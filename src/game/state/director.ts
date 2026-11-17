import { ANIMALS, CROPS, DAY_MINUTES, DAY_REAL_SECONDS, ITEMS, PARCELS, PIECES, SHOPS, TREE_GROWN, TREE_HITS, TREE_STAGES, TREES, kitItem, itemName, parseItem, villaTier, VILLA_TIERS } from '@/game/sim/content';
import { houseEntry, houseExit, inGrid, nearestEdge, placementCenter, placementsAt as placementsAtTile, shellDoors, tileAt, tileCenter, villaDoors, WAKE_TILE, type HouseSide } from '@/game/sim/farm-map';
import { animalsIn, applyIntent, cloneFarm, createFarm, cropStage, isHost, isRipe, tile, treeAt } from '@/game/sim/sim';
import type { Actor, Bag, Effect, FarmState, HelpStats, Intent, Placement, Source } from '@/game/sim/types';
import { getLook } from '@/game/data/looks';
import { SHOP_SPOTS, shopRoom } from '@/game/data/world-layout';
import { playSound } from '@/game/engine/sound';
import { clearMovement } from '@/game/engine/input';
import { animalPositions, playerState, requestTeleport } from '@/game/engine/world-state';
import * as net from '@/game/net/coop';
import * as cloud from './cloud';
import { clockText, getFarm, useClock, useFarm } from './farm-store';
import { DEV_GOLD, isDevName, ownsItem, profileData, useProfile } from './profile-store';
import { useSession, type Nearby, type NetPlayer } from './session-store';
import { zoneAt } from './zones';

/**
 * Every gameplay rule outside the farm sim lives here: what the hero's tools do, what interacting
 * with things does, shops, sleeping and the clock, saving, and co-op. Components read state and
 * call these; they never decide outcomes themselves.
 */

const session = () => useSession.getState();
const profile = () => useProfile.getState();

export function me(): Actor {
  const p = profile();
  return { id: p.playerId, name: p.name || 'Farmer' };
}

const role = () => useFarm.getState().role;
export const amHost = () => {
  const farm = getFarm();
  return !!farm && farm.owner === profile().playerId;
};
const guestsHere = () => session().net.players.filter((p) => !p.host).length > 0;

function toast(text: string) {
  session().showToast(text);
}

/* ------------------------------------------------------------------ */
/* Intents and effects                                                 */
/* ------------------------------------------------------------------ */

/** Apply profile effects addressed to this player. */
function applyEffects(effects: Effect[]) {
  const id = profile().playerId;
  for (const fx of effects) {
    if (fx.who !== id) continue;
    if (fx.e === 'gold') profile().addGold(fx.n);
    else profile().addItem(fx.item, fx.e === 'give' ? fx.n : -fx.n);
  }
}

/**
 * Do something to the farm. The host applies it at once and tells any guests; a guest checks it
 * against a copy of the replica (for an instant answer) and asks the host.
 */
export function submit(intent: Intent): boolean {
  const farm = getFarm();
  if (!farm) return false;
  if (role() === 'guest') {
    const trial = applyIntent(cloneFarm(farm), me(), intent);
    if (!trial.ok) {
      reject(trial.reason);
      return false;
    }
    net.sendIntent(intent);
    return true;
  }
  const res = applyIntent(farm, me(), intent);
  if (!res.ok) {
    reject(res.reason);
    return false;
  }
  applyEffects(res.effects);
  useFarm.getState().bump();
  net.sendDelta(me(), intent);
  return true;
}

function reject(reason: string) {
  toast(reason);
  playSound('nudge');
}

/* ------------------------------------------------------------------ */
/* The hotbar and tools                                                */
/* ------------------------------------------------------------------ */

export interface Slot {
  key: string;
  kind: 'hoe' | 'can' | 'axe' | 'item';
  label: string;
  icon: string;
  item?: string;
  from?: Source;
  count?: number;
}

/** Tools first, then seeds and fertilizer: from your own bag on your farm, from storage when visiting. */
export function hotbar(farm: FarmState | null, bag: Bag): Slot[] {
  const host = !!farm && farm.owner === profile().playerId;
  const slots: Slot[] = [];
  if (host) slots.push({ key: 'hoe', kind: 'hoe', label: 'Hoe', icon: '⛏️' });
  slots.push({ key: 'can', kind: 'can', label: 'Watering Can', icon: '🚿' });
  if (host) slots.push({ key: 'axe', kind: 'axe', label: 'Axe', icon: '🪓' });
  const source: Bag = host ? bag : (farm?.storage ?? {});
  const usable = Object.entries(source)
    .filter(([k]) => {
      const kind = ITEMS[parseItem(k).id]?.kind;
      return kind === 'seed' || parseItem(k).id === 'fertilizer';
    })
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [item, count] of usable.slice(0, 9 - slots.length)) {
    slots.push({ key: item, kind: 'item', label: itemName(item), icon: ITEMS[parseItem(item).id]?.icon ?? '📦', item, from: host ? 'self' : 'storage', count });
  }
  return slots;
}

/** The farm tile the hero is facing, if on the grid. */
export function facingTile(): [number, number] | null {
  const { x, z } = playerState.position;
  const f = playerState.facing;
  const [c, r] = tileAt(x + Math.sin(f) * 0.8, z + Math.cos(f) * 0.8);
  return inGrid(c, r) ? [c, r] : null;
}

/** Use the selected tool or item on the facing tile (F, or a click). */
export function applyTool() {
  const s = session();
  const farm = getFarm();
  if (!farm || s.panel || s.build.on || s.fade) return;
  const target = s.target;
  if (!target) {
    toast('Face a patch of your farm to use that');
    return;
  }
  const [c, r] = target;
  const t = tile(farm, c, r);
  // A ripe crop is picked whatever is in your hand.
  if (t?.crop && isRipe(t.crop)) {
    if (submit({ t: 'harvest', c, r })) playSound('clue');
    return;
  }
  const slots = hotbar(farm, profile().bag);
  const slot = slots[Math.min(s.slot, slots.length - 1)];
  if (!slot) return;
  if (slot.kind === 'hoe') {
    if (t?.crop) {
      if (submit({ t: 'clear', c, r })) playSound('step');
      return;
    }
    if (submit({ t: 'till', c, r })) playSound('step');
  } else if (slot.kind === 'can') {
    if (submit({ t: 'water', c, r })) playSound('upload');
  } else if (slot.kind === 'axe') {
    // Only trees on the farm: a few chops bring a big one down, for wood and its seeds.
    const tree = treeAt(farm, c, r);
    if (!tree) return toast('Face a tree on your farm to use the axe');
    const def = TREES[tree.kind];
    const left = TREE_HITS[tree.stage] - tree.hits - 1;
    if (!submit({ t: 'chop', c, r })) return;
    playSound(left > 0 ? 'step' : 'success');
    if (left > 0) toast(`Chop! ${left} more`);
    else
      toast(
        tree.stage <= 1
          ? `You dug up the ${def.name.toLowerCase()} seedling.`
          : tree.stage === 2
            ? `The ${def.name.toLowerCase()} sapling is down: +1 wood.`
            : `Timber! The ${def.name.toLowerCase()} is down.`,
      );
  } else if (slot.item) {
    const { id } = parseItem(slot.item);
    if (slot.from === 'self' && !ownsItem(slot.item)) return reject(`No ${itemName(slot.item)} left`);
    const intent: Intent =
      id === 'fertilizer' ? { t: 'fertilize', c, r, from: slot.from! } : { t: 'plant', c, r, seed: slot.item, from: slot.from! };
    if (submit(intent)) playSound('blip');
  }
}

/* ------------------------------------------------------------------ */
/* Interacting                                                         */
/* ------------------------------------------------------------------ */

const shopOpen = (shop: string, minute = useClock.getState().minute) => {
  const def = SHOPS[shop];
  return minute >= def.open && minute < def.close;
};

const hoursText = (shop: string) => {
  const d = SHOPS[shop];
  const h = (m: number) => {
    const hr = 6 + m / 60;
    return `${hr % 12 || 12} ${hr < 12 ? 'AM' : 'PM'}`;
  };
  return `${h(d.open)}–${h(d.close)}`;
};

interface Point {
  id: string;
  x: number;
  z: number;
  r: number;
  label: () => string;
}

function interactPoints(farm: FarmState | null): Point[] {
  // The shops: go in at the door; inside, shop at the counter, or step back out.
  const pts: Point[] = Object.entries(SHOP_SPOTS).flatMap(([shop, spot]) => {
    const room = shopRoom(shop);
    const { name, keeper } = SHOPS[shop];
    return [
      { id: 'shopdoor:' + shop, x: spot.counter[0], z: spot.counter[1], r: 1.9, label: () => (shopOpen(shop) ? `Go into the ${name}` : `${name} — closed (${hoursText(shop)})`) },
      { id: 'shop:' + shop, x: room.shopAt[0], z: room.shopAt[1], r: 1.7, label: () => (shopOpen(shop) ? `Shop with ${keeper}` : `${keeper} is closing up`) },
      { id: 'shopout:' + shop, x: room.exit[0], z: room.exit[1], r: 1.3, label: () => 'Go outside' },
    ];
  });
  if (!farm) return pts;
  const host = farm.owner === profile().playerId;
  for (const p of farm.placements) {
    const def = PIECES[p.piece];
    if (!def?.use) continue;
    const [x, z] = placementCenter(p);
    const size = Math.max(...(def.size ?? [1, 1]));
    pts.push({
      id: 'p:' + p.id,
      x,
      z,
      r: 0.95 + size * 0.45,
      label: () =>
        def.use === 'sleep'
          ? host
            ? 'Sleep until morning'
            : `${farm.ownerName}'s bed`
          : def.use === 'storage'
            ? 'Open storage'
            : def.use === 'ship'
              ? 'Shipping bin'
              : 'Tend the coop',
    });
  }
  // "Go inside" from the house's doorstep on the farm; "Go outside" from just within a front door of its rooms.
  if (session().indoors) {
    for (const door of villaDoors(farm)) pts.push({ id: 'door-out:' + door.placement.id, x: door.inside[0], z: door.inside[1], r: 1.3, label: () => 'Go outside' });
  } else {
    for (const door of shellDoors(farm)) pts.push({ id: 'door-in:' + door.side, x: door.outside[0], z: door.outside[1], r: 1.4, label: () => 'Go inside' });
  }
  for (const a of farm.animals) {
    const pos = animalPositions.get(a.id);
    if (pos) pts.push({ id: 'animal:' + a.id, x: pos.x, z: pos.z, r: 0.85, label: () => (a.petted ? `${a.name} 💛` : `Pet ${a.name}`) });
  }
  return pts;
}

let cachedPoints: { rev: number; indoors: boolean; pts: Point[] } | null = null;

/** The nearest thing to interact with (or a ripe crop on the facing tile). Called every frame. */
export function findNearby(x: number, z: number): Nearby | null {
  const { farm, rev } = useFarm.getState();
  const indoors = session().indoors;
  if (!cachedPoints || cachedPoints.rev !== rev || cachedPoints.indoors !== indoors || farm?.animals.length) cachedPoints = { rev, indoors, pts: interactPoints(farm) };
  let best: Point | null = null;
  let bestD = Infinity;
  for (const p of cachedPoints.pts) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < p.r && d < bestD) {
      best = p;
      bestD = d;
    }
  }
  if (best) return { id: best.id, label: best.label() };
  // Indoors with no front door left (it was picked up in build mode): you can always step out.
  if (indoors && farm && !villaDoors(farm).length && zoneAt(x, z) === 'house') return { id: 'door-out:none', label: 'Go outside' };
  const target = session().target;
  if (farm && target) {
    const t = tile(farm, target[0], target[1]);
    if (t?.crop && isRipe(t.crop)) return { id: 'harvest', label: `Harvest ${CROPS[t.crop.id].name}` };
  }
  return null;
}

export function interact(id: string) {
  const farm = getFarm();
  const s = session();
  if (s.panel || s.fade) return;
  if (id === 'harvest') return applyTool();
  if (id.startsWith('door-in:') || id.startsWith('door-out:')) return goThroughDoor(id);
  if (id.startsWith('shopdoor:') || id.startsWith('shopout:')) return goThroughShopDoor(id);
  if (id.startsWith('shop:')) {
    const shop = id.slice(5);
    if (!shopOpen(shop) && !isDevName()) {
      reject(`${SHOPS[shop].keeper} has closed for the day. Come back at ${hoursText(shop).split('–')[0]}!`);
      return;
    }
    playSound('open');
    s.openPanel('shop', shop);
    return;
  }
  if (!farm) return;
  if (id.startsWith('animal:')) {
    const a = farm.animals.find((x) => x.id === Number(id.slice(7)));
    if (a && submit({ t: 'pet', animal: a.id })) {
      playSound('success');
      toast(`${a.name} looks delighted.`);
    }
    return;
  }
  const p = farm.placements.find((q) => 'p:' + q.id === id);
  const use = p && PIECES[p.piece].use;
  if (!p || !use) return;
  if (use === 'sleep') {
    if (!amHost()) return reject(`Only ${farm.ownerName} can end the day.`);
    return requestSleep();
  }
  playSound('open');
  s.openPanel(use === 'storage' ? 'storage' : use === 'ship' ? 'ship' : 'coop', String(p.id));
}

/* ------------------------------------------------------------------ */
/* Shops                                                               */
/* ------------------------------------------------------------------ */

export function buy(item: string, n: number) {
  const def = ITEMS[item];
  if (!def?.buy) return;
  const cost = def.buy * n;
  if (profile().gold < cost) return reject('Not enough gold');
  profile().addGold(-cost);
  profile().addItem(item, n);
  playSound('gem');
}

export function buyParcel(id: string) {
  const parcel = PARCELS.find((p) => p.id === id);
  if (!parcel) return;
  if (profile().gold < parcel.price) return reject('Not enough gold');
  if (submit({ t: 'buyParcel', parcel: id })) {
    playSound('unlock');
    toast(`${parcel.name} is yours! The fence comes down tonight… well, right now, actually.`);
  }
}

export function buyTier() {
  const farm = getFarm();
  if (!farm) return;
  const next = VILLA_TIERS.find((t) => t.tier === farm.villaTier + 1);
  if (!next) return;
  if (profile().gold < next.price) return reject('Not enough gold');
  if (submit({ t: 'buyTier', tier: next.tier })) {
    playSound('unlock');
    toast(`Your villa can grow into a ${next.name} now. Open build mode (B) to extend it.`);
  }
}

export function buyAnimal(kind: string, name: string) {
  const farm = getFarm();
  const def = ANIMALS[kind];
  if (!farm || !def) return;
  if (profile().gold < def.price) return reject('Not enough gold');
  const coop = farm.placements.find((p) => p.piece === def.home && animalsIn(farm, p.id).length < def.capacity);
  if (!coop) return reject(`Build a ${PIECES[def.home].name} first (the carpenter sells them), or make room in one.`);
  if (submit({ t: 'buyAnimal', kind, coop: coop.id, name })) {
    playSound('success');
    toast(`${name || def.name} is waiting at your coop.`);
  }
}

/* ------------------------------------------------------------------ */
/* Clock and sleep                                                     */
/* ------------------------------------------------------------------ */

let clockTimer: number | null = null;
let lastTick = 0;
let lastClockSent = 0;
let lastAutosave = 0;
const AUTOSAVE_MS = 5 * 60 * 1000;
const COUNTDOWN_S = 20;
let countdownTimer: number | null = null;

/**
 * The host's clock is wall-clock driven: it advances by real elapsed time, so a throttled tab
 * catches up rather than losing time. Alone, it pauses while a menu, a shop or build mode is
 * open; with guests it never pauses. Guests just advance their copy between the host's syncs.
 */
export function startClock() {
  if (clockTimer || typeof window === 'undefined') return;
  lastTick = Date.now();
  clockTimer = window.setInterval(tickClock, 250);
}

/* ------------------------------------------------------------------ */
/* DEV tools                                                           */
/* ------------------------------------------------------------------ */

/** DEV: jump the day clock (in-game minutes since 6:00) on your own farm; guests follow. */
export function devSetTime(minute: number) {
  const farm = getFarm();
  if (!farm || !isDevName() || role() !== 'host' || session().countdown !== null) return;
  farm.minute = Math.max(0, Math.min(DAY_MINUTES - 1, minute));
  useClock.getState().setMinute(farm.minute);
  net.sendClock(farm.minute);
  lastClockSent = Date.now();
  toast(`Time set to ${clockText(farm.minute)}`);
}

/** DEV: freeze or unfreeze the day clock. */
export function devToggleFreeze() {
  if (!isDevName() || role() !== 'host') return;
  const frozen = !session().frozen;
  session().setFrozen(frozen);
  toast(frozen ? 'Time frozen' : 'Time running again');
}

function tickClock() {
  const now = Date.now();
  const dt = Math.min(60, (now - lastTick) / 1000);
  lastTick = now;
  const farm = getFarm();
  const s = session();
  if (!farm || s.screen !== 'play' || s.fade) return;
  const hosting = role() === 'host';
  const paused = hosting && !guestsHere() && (!!s.panel || s.build.on);
  if (!paused && !s.frozen && s.countdown === null) {
    farm.minute = Math.min(DAY_MINUTES, farm.minute + (dt * DAY_MINUTES) / DAY_REAL_SECONDS);
    useClock.getState().setMinute(farm.minute);
  }
  if (!hosting) return;
  if (now - lastClockSent > 2000) {
    lastClockSent = now;
    net.sendClock(farm.minute);
  }
  if (farm.minute >= DAY_MINUTES && s.countdown === null) void finishDay(true);
  if (now - lastAutosave > AUTOSAVE_MS) {
    lastAutosave = now;
    void saveAll();
  }
}

/** The host goes to bed: alone, the day ends now; with guests, after a short countdown everyone sees. */
export function requestSleep() {
  if (!amHost()) return;
  if (!guestsHere()) return void finishDay(false);
  startCountdown(COUNTDOWN_S, true);
}

function startCountdown(seconds: number | null, host: boolean) {
  if (countdownTimer) window.clearInterval(countdownTimer);
  countdownTimer = null;
  session().setCountdown(seconds);
  if (host) net.sendCountdown(seconds);
  if (seconds === null) return;
  let left = seconds;
  countdownTimer = window.setInterval(() => {
    left--;
    if (left > 0) return session().setCountdown(left);
    window.clearInterval(countdownTimer!);
    countdownTimer = null;
    session().setCountdown(null);
    if (host) void finishDay(false);
  }, 1000);
}

export function cancelSleep() {
  if (amHost()) startCountdown(null, true);
}

/** Guests whose help is waiting for a thank-you, with what they did. */
const pendingThanks = new Map<string, HelpStats>();
const thankedToday = new Set<string>();

export const thanksFor = (id: string) => pendingThanks.get(id);

function queueThanks(ids: string[]) {
  const farm = getFarm();
  if (!farm) return;
  for (const id of ids) {
    const h = farm.help[id];
    if (!h || thankedToday.has(id)) continue;
    if (h.watered + h.planted + h.harvested + h.fed + h.petted + h.shipped === 0) continue;
    pendingThanks.set(id, { ...h });
  }
  session().setThanks([...pendingThanks.keys()]);
}

const sleeper = { busy: false };

async function finishDay(passedOut: boolean) {
  const farm = getFarm();
  if (!farm || !amHost() || sleeper.busy) return;
  sleeper.busy = true;
  session().closePanel();
  session().setBuild({ on: false });
  queueThanks(Object.keys(farm.help));
  session().setFade(passedOut ? 'It’s 2 AM… you doze off where you stand.' : 'Sleeping…');
  playSound('door');
  await wait(1400);
  submit({ t: 'endDay' });
  useClock.getState().setMinute(0);
  thankedToday.clear();
  wakeUp();
  await saveAll();
  await wait(600);
  session().setFade(null);
  sleeper.busy = false;
  session().openPanel('morning', passedOut ? 'passed-out' : undefined);
}

/** Stand the host up beside their bed (or at the door). */
function wakeUp() {
  const farm = getFarm();
  if (!farm) return;
  const bed = farm.placements.find((p) => PIECES[p.piece].use === 'sleep');
  const [x, z] = bed ? placementCenter(bed) : tileCenter(...WAKE_TILE);
  // Beside the bed, clear of its footprint (a double bed is two tiles wide).
  const half = bed ? (bed.rot % 2 ? PIECES[bed.piece].size?.[1] ?? 1 : PIECES[bed.piece].size?.[0] ?? 1) / 2 : 0;
  requestTeleport(bed ? x + half + 0.4 : x, z + (bed ? 0.4 : 0), 0);
  session().setIndoors(!!bed);
}

/** After the morning card: any thank-yous waiting come next. */
export function closeMorning() {
  session().closePanel();
  if (session().thanks.length) session().openPanel('thanks');
}

/** Tip a guest from storage and/or your own gold (or with nothing, to dismiss). */
export async function tipGuest(id: string, tip: { gold: number; items: Bag } | null) {
  const stats = pendingThanks.get(id);
  pendingThanks.delete(id);
  thankedToday.add(id);
  session().setThanks([...pendingThanks.keys()]);
  if (!session().thanks.length) session().closePanel();
  if (!tip || (!tip.gold && !Object.keys(tip.items).length)) return;
  if (tip.gold > profile().gold) return reject('Not enough gold');
  const here = session().net.players.some((p) => p.id === id);
  if (!here && !cloud.cloudEnabled) return reject('They’ve gone home — tips reach guests who are still here.');
  if (!submit({ t: 'tip', to: id, items: tip.items, gold: tip.gold })) return;
  if (!here) await cloud.sendGift(id, { from: profile().name, gold: tip.gold, items: tip.items });
  playSound('gem');
  toast(`Sent ${stats?.name ?? 'them'} a thank-you.`);
}

/* ------------------------------------------------------------------ */
/* Starting, saving, leaving                                           */
/* ------------------------------------------------------------------ */

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
let account: cloud.Account | null = null;
export const getAccount = () => account;

/** Sign in to the cloud (if configured), adopt that account id, pick the newer profile, claim tips. */
export async function bootAccount() {
  account = await cloud.signIn();
  if (!account) return;
  if (profile().playerId !== account.id) profile().setPlayerId(account.id);
  const remote = await cloud.loadProfile(account.id);
  if (remote && remote.savedAt > profile().savedAt) profile().load({ ...remote, playerId: account.id });
  await claimTips();
}

async function claimTips() {
  for (const gift of await cloud.claimGifts()) {
    applyGift(gift);
  }
}

function applyGift(gift: cloud.GiftPayload) {
  if (gift.gold) profile().addGold(gift.gold);
  for (const [item, n] of Object.entries(gift.items)) profile().addItem(item, n);
  const parts = [gift.gold ? `${gift.gold}g` : '', ...Object.entries(gift.items).map(([k, n]) => `${n} × ${itemName(k)}`)].filter(Boolean);
  toast(`A thank-you from ${gift.from}: ${parts.join(', ')}`);
  playSound('gem');
}

export async function saveAll() {
  const farm = getFarm();
  const tasks: Promise<void>[] = [cloud.saveProfile(profileData())];
  if (farm && role() === 'host' && farm.owner === profile().playerId) tasks.push(cloud.saveFarm(farm));
  await Promise.all(tasks);
}

/** Load (or start) your own farm and stand at its door. */
export async function enterOwnFarm(fresh: boolean) {
  const p = profile();
  let farm = fresh ? null : await cloud.loadFarm(p.playerId);
  if (!farm) {
    farm = createFarm(p.playerId, p.name || 'Farmer');
    if (fresh) p.resetEconomy();
  }
  // The DEV account: infinite gold.
  if (isDevName()) useProfile.setState({ gold: DEV_GOLD });
  farm.ownerName = p.name || farm.ownerName;
  useFarm.getState().setFarm(farm, 'host');
  lastAutosave = Date.now();
  const [x, z] = tileCenter(...WAKE_TILE);
  requestTeleport(x, z, 0);
  session().setIndoors(false);
  if (fresh) await cloud.saveFarm(farm);
}

export async function leaveToTitle() {
  await saveAll();
  await net.leaveSession();
  session().closePanel();
  session().setBuild({ on: false });
  session().setScreen('title');
}

if (typeof window !== 'undefined') {
  // Last-chance save when the tab closes (the local cache is synchronous; the cloud is best effort).
  window.addEventListener('pagehide', () => void saveAll());
}

/* ------------------------------------------------------------------ */
/* Co-op                                                               */
/* ------------------------------------------------------------------ */

async function whoAmI() {
  const p = profile();
  return { playerId: p.playerId, name: p.name, look: p.look, token: await cloud.accessToken() };
}

/** Open your farm to friends. */
export async function openFarm(): Promise<string | null> {
  if (!amHost()) return null;
  try {
    const code = await net.hostSession(await whoAmI());
    toast(`Your farm is open. Share the code ${code}.`);
    return code;
  } catch (err) {
    console.warn('[Meadowfolk] could not open the farm', err);
    reject('Couldn’t reach the co-op relay. Is it running? (npm run relay)');
    return null;
  }
}

export async function closeFarm() {
  await net.leaveSession();
  toast('Your farm is closed to visitors.');
}

let visitResolve: ((ok: boolean) => void) | null = null;

/** Visit a friend's farm by its code. Resolves once their farm has arrived. */
export async function joinFarm(code: string): Promise<boolean> {
  if (role() === 'host' && getFarm()) await saveAll();
  if (net.isOnline()) await net.leaveSession();
  try {
    const arrived = new Promise<boolean>((resolve) => {
      visitResolve = resolve;
      window.setTimeout(() => resolve(false), 12_000);
    });
    await net.joinSession(code, await whoAmI());
    const ok = await arrived;
    if (!ok) {
      await net.leaveSession();
      reject('The farm didn’t answer. Check the code and try again.');
    }
    return ok;
  } catch (err) {
    console.warn('[Meadowfolk] could not join', err);
    reject('No farm with that code is open right now.');
    return false;
  }
}

export async function leaveVisit() {
  await net.leaveSession();
}

async function returnHome(message: string) {
  if (message) toast(message);
  session().closePanel();
  session().setCountdown(null);
  await enterOwnFarm(false);
  if (account?.anonymous && !profile().nudged.includes('email-after-visit')) {
    profile().markNudged('email-after-visit');
    session().openPanel('account', 'nudge');
  }
}

net.setNetHandlers({
  onIntent(from, intent) {
    const farm = getFarm();
    if (!farm || !amHost()) return;
    const res = applyIntent(farm, from, intent);
    if (!res.ok) return net.sendRejected(from.id, res.reason);
    applyEffects(res.effects);
    useFarm.getState().bump();
    net.sendDelta(from, intent);
  },
  onNeedSnapshot(sid) {
    const farm = getFarm();
    if (farm && amHost()) net.sendSnapshot(sid, farm);
  },
  onSnapshot(farm) {
    useFarm.getState().setFarm(farm, 'guest');
    const [x, z] = tileCenter(18, 14);
    requestTeleport(x, z, Math.PI);
    session().setIndoors(false);
    if (session().screen !== 'play') session().setScreen('play');
    visitResolve?.(true);
    visitResolve = null;
  },
  onDelta(actor, intent) {
    const farm = getFarm();
    if (!farm || role() !== 'guest') return;
    const res = applyIntent(farm, actor, intent);
    if (!res.ok) {
      console.warn('[Meadowfolk] replica disagreed with the host', intent, res.reason);
      return;
    }
    applyEffects(res.effects);
    if (intent.t === 'endDay') {
      useClock.getState().setMinute(0);
      session().setCountdown(null);
      session().setFade('A new day…');
      window.setTimeout(() => session().setFade(null), 1600);
    }
    if (intent.t === 'tip' && intent.to === profile().playerId) {
      playSound('gem');
      toast(`${farm.ownerName} sent you a thank-you!`);
    }
    useFarm.getState().bump();
  },
  onClock(minute) {
    const farm = getFarm();
    if (!farm || role() !== 'guest') return;
    farm.minute = minute;
    useClock.getState().setMinute(minute);
  },
  onCountdown(seconds) {
    startCountdown(seconds, false);
  },
  onRejected(reason) {
    reject(reason);
  },
  onPlayers(players: NetPlayer[], before: NetPlayer[]) {
    const myId = profile().playerId;
    for (const p of players) if (!before.some((b) => b.sid === p.sid) && p.id !== myId) toast(`${p.name} ${p.host ? 'welcomes you' : 'dropped in'}!`);
    const left = before.filter((b) => !players.some((p) => p.sid === b.sid) && b.id !== myId);
    for (const p of left) if (!p.host) toast(`${p.name} headed home.`);
    if (amHost() && left.length) {
      queueThanks(left.map((p) => p.id));
      if (session().thanks.length && !session().panel) session().openPanel('thanks');
    }
    if (amHost() && players.some((p) => !p.host) && account?.anonymous && !profile().nudged.includes('email-after-host')) {
      profile().markNudged('email-after-host');
      session().openPanel('account', 'nudge-host');
    }
  },
  onEnded(message) {
    if (role() === 'guest') void returnHome(message);
    else if (message) toast(message);
  },
});

/* ------------------------------------------------------------------ */
/* Small helpers for the HUD                                           */
/* ------------------------------------------------------------------ */

export const seasonName = (s: string) => s[0].toUpperCase() + s.slice(1);

export function cropLabel(farm: FarmState, c: number, r: number): string | null {
  const tree = treeAt(farm, c, r);
  if (tree) {
    const def = TREES[tree.kind];
    if (tree.stage >= TREE_GROWN) return `${def.name}${tree.hits ? ` · ${TREE_HITS[tree.stage] - tree.hits} chops left` : ''}`;
    const nights = def.nightsPerStage - tree.growth;
    return `${def.name} · ${TREE_STAGES[tree.stage]} · grows in ${nights} night${nights === 1 ? '' : 's'}`;
  }
  const t = tile(farm, c, r);
  if (!t?.crop) return null;
  const def = CROPS[t.crop.id];
  if (isRipe(t.crop)) return `${def.name} — ripe!`;
  const stage = ['Seed', 'Sprout', 'Growing'][cropStage(t.crop)];
  return `${def.name} · ${stage}${t.watered ? ' · watered' : ' · needs water'}`;
}

export const lookOf = (id: string) => getLook(id);
export { kitItem, isHost };

/* ------------------------------------------------------------------ */
/* Build mode (host only)                                              */
/* ------------------------------------------------------------------ */

type BuildStep = { k: 'placed'; id: number } | { k: 'removed'; p: Placement } | { k: 'painted'; id: number; from: number };
/** Undo is unlimited within a session. */
const undoStack: BuildStep[] = [];

export function toggleBuild() {
  const s = session();
  if (s.build.on) {
    s.setBuild({ on: false, hover: null });
    playSound('close');
    return;
  }
  if (!amHost()) return reject(`Only ${getFarm()?.ownerName ?? 'the owner'} can build on this farm.`);
  if (s.panel) return;
  if (s.indoors && zoneAt(playerState.position.x, playerState.position.z) !== 'house') return reject('You can build on your farm and in your house.');
  s.setBuild({ on: true, hover: null });
  playSound('open');
}

/** Place the selected piece (from your kit bag) at a tile. */
export function placeAt(c: number, r: number, rot: number) {
  const farm = getFarm();
  const piece = session().build.piece;
  if (!farm || !piece) return;
  const def = PIECES[piece];
  if (!ownsItem(kitItem(piece))) return reject(`No ${def.name} in your bag — Bram the carpenter sells them.`);
  const color = session().build.color ?? def.color;
  if (submit({ t: 'place', piece, c, r, rot, color })) {
    undoStack.push({ k: 'placed', id: farm.nextId - 1 });
    playSound('blip');
  }
}

/** What's at a tile that a click would pick up: an object, else the nearest edge piece, else the floor. */
function pickAt(farm: FarmState, c: number, r: number, x: number, z: number): Placement | undefined {
  const here = placementsAtTile(farm, c, r);
  const object = here.find((p) => PIECES[p.piece].layer === 'object');
  if (object) return object;
  const edge = nearestEdge(c, r, x, z);
  const edges = here.filter((p) => PIECES[p.piece].layer === 'edge');
  return edges.find((p) => p.rot % 4 === edge) ?? edges[0] ?? here.find((p) => PIECES[p.piece].layer === 'floor');
}

/** Pick a piece back up into your bag. */
export function removeAt(c: number, r: number, x: number, z: number) {
  const farm = getFarm();
  if (!farm) return;
  const p = pickAt(farm, c, r, x, z);
  if (!p) return;
  const copy = { ...p };
  if (submit({ t: 'remove', id: p.id })) {
    undoStack.push({ k: 'removed', p: copy });
    playSound('close');
  }
}

/** Recolour the piece under the pointer with the selected clay colour. */
export function paintAt(c: number, r: number, x: number, z: number) {
  const farm = getFarm();
  const color = session().build.color;
  if (!farm || color === null) return;
  const p = pickAt(farm, c, r, x, z);
  if (!p || p.color === color) return;
  const from = p.color;
  if (submit({ t: 'recolor', id: p.id, color })) {
    undoStack.push({ k: 'painted', id: p.id, from });
    playSound('blip');
  }
}

export function undoBuild() {
  const step = undoStack.pop();
  const farm = getFarm();
  if (!step || !farm) return;
  if (step.k === 'placed') submit({ t: 'remove', id: step.id });
  else if (step.k === 'painted') submit({ t: 'recolor', id: step.id, color: step.from });
  else {
    const { piece, c, r, rot, color } = step.p;
    submit({ t: 'place', piece, c, r, rot, color });
  }
  playSound('close');
}

export function rotateBuild() {
  const b = session().build;
  session().setBuild({ rot: (b.rot + 1) % 4 });
  playSound('blip');
}

/* ------------------------------------------------------------------ */
/* Going in and out of the villa                                       */
/* ------------------------------------------------------------------ */

/** The fade card fully covers the screen after this long; the hero moves then. */
const DOOR_FADE_MS = 340;

/**
 * Through the villa's front door, like entering a building in town: a warm fade with the
 * destination's name, the hero moves to the other side, and the camera switches between the
 * outdoor follow and the indoor room view.
 */
/**
 * In or out of a shop: like the house, its inside is its own room off the map, behind the same
 * fade card. Closed shops stay locked (except for DEV).
 */
function goThroughShopDoor(id: string) {
  const s = session();
  if (s.transition) return;
  const going = id.startsWith('shopdoor:') ? 'in' : 'out';
  const shop = id.slice(id.indexOf(':') + 1);
  if (going === 'in' && !shopOpen(shop) && !isDevName()) {
    reject(`${SHOPS[shop].keeper} opens at ${hoursText(shop).split('–')[0]}. Come back then!`);
    return;
  }
  clearMovement();
  playSound('door');
  s.setTransition({ destination: going === 'in' ? SHOPS[shop].name : 'The town' });
  window.setTimeout(() => {
    if (going === 'in') {
      const r = shopRoom(shop);
      requestTeleport(r.arrive[0], r.arrive[1], Math.PI);
    } else {
      const [x, z] = SHOP_SPOTS[shop].counter;
      requestTeleport(x, z + 0.3, 0);
    }
    session().setIndoors(going === 'in');
  }, DOOR_FADE_MS);
  window.setTimeout(() => session().setTransition(null), DOOR_FADE_MS + 520);
}

function goThroughDoor(id: string) {
  const farm = getFarm();
  const s = session();
  if (!farm || s.transition) return;
  const going = id.startsWith('door-in:') ? 'in' : 'out';
  const v = villaTier(farm.villaTier);
  clearMovement();
  playSound('door');
  s.setTransition({ destination: going === 'in' ? `${farm.ownerName}’s ${v.name}` : farm.name });
  window.setTimeout(() => {
    // The rooms are their own space: going in or out is a jump between them and the house on the farm.
    if (going === 'in') {
      const at = houseEntry(farm, id.slice('door-in:'.length) as HouseSide);
      requestTeleport(at.x, at.z, at.face);
    } else {
      const out = houseExit(farm, Number(id.slice('door-out:'.length)) || null);
      requestTeleport(out.outside[0], out.outside[1], out.faceOut);
    }
    session().setIndoors(going === 'in');
  }, DOOR_FADE_MS);
  window.setTimeout(() => session().setTransition(null), DOOR_FADE_MS + 520);
}
