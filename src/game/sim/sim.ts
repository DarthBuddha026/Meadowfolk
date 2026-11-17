import {
  ANIMALS,
  CROPS,
  DAYS_PER_SEASON,
  ITEMS,
  kitItem,
  PARCELS,
  PIECES,
  SEASONS,
  SLICE_SEASONS,
  itemKey,
  parseItem,
  sellPrice,
  TREE_GROWN,
  TREE_HITS,
  TREES,
  villaTier,
  VILLA_TIERS,
} from './content';
import { FARM_GATE, footprint, GRID, inGrid, inHouseArea, inVilla, isOwned, ORCHARD_TREES, placementsAt, tileIndex, underShell, WAKE_TILE } from './farm-map';
import type { Actor, ApplyResult, Bag, Crop, Effect, FarmState, HelpStats, Intent, ItemKey, Placement, Quality, Tile, Tree } from './types';

/**
 * Meadowfolk's farm rules. `applyIntent` is the only way farm state changes (besides the clock):
 * given the same state and the same ordered intents it always ends the same, so a guest's replica
 * that applies the host's accepted intents stays identical to the host's farm.
 *
 * Checks of the acting player's own bag and gold happen on their client before an intent is sent
 * (each player owns their profile); the sim only returns the effects to apply to it.
 */

export const SAVE_VERSION = 9;

/* ------------------------------------------------------------------ */
/* A new farm                                                          */
/* ------------------------------------------------------------------ */

const emptyTile = (): Tile => ({ tilled: false, watered: false, fertilized: false, crop: null });

export function createFarm(owner: string, ownerName: string): FarmState {
  const farm: FarmState = {
    version: SAVE_VERSION,
    owner,
    ownerName,
    name: `${ownerName}'s Farm`,
    year: 1,
    season: 'spring',
    day: 1,
    minute: 0,
    tiles: Array.from({ length: GRID.cols * GRID.rows }, emptyTile),
    placements: [],
    nextId: 1,
    animals: [],
    produce: {},
    storage: {},
    bin: {},
    parcels: [],
    villaTier: 1,
    roofColor: 1,
    help: {},
    trees: [],
    lastPayout: null,
  };
  const put = (piece: string, c: number, r: number, rot = 0) =>
    farm.placements.push({ id: farm.nextId++, piece, c, r, rot, color: PIECES[piece].color, storey: 0 });

  buildStarterHouse(put);
  putYard(put);
  for (let c = 23; c < 29; c++) for (let r = 12; r < 15; r++) farm.tiles[tileIndex(c, r)].tilled = true;
  plantStartingTrees(farm);
  return farm;
}

type Put = (piece: string, c: number, r: number, rot?: number) => void;

/** Wild trees already standing on the home plot and the meadow, to clear or keep. */
const WILD_TREES: [string, number, number][] = [
  ['oak', 11, 2],
  ['pine', 12, 11],
  ['oak', 13, 7],
  ['oak', 25, 4],
  ['pine', 30, 2],
  ['pine', 30, 9],
  ['pine', 35, 3],
  ['oak', 38, 10],
  ['pine', 41, 6],
];

/** The orchard's old apple trees and the wild ones, grown, wherever their tile is still free. */
function plantStartingTrees(farm: FarmState) {
  farm.trees ??= [];
  const starting: [string, number, number][] = [...ORCHARD_TREES.map(([c, r]) => ['apple', c, r] as [string, number, number]), ...WILD_TREES];
  for (const [kind, c, r] of starting) {
    const t = tile(farm, c, r);
    if (!t || t.tilled || t.crop || isBlocked(farm, c, r) || underShell(farm, c, r)) continue;
    farm.trees.push({ id: farm.nextId++, kind, c, r, stage: TREE_GROWN, growth: 0, hits: 0 });
  }
}

/** Outside the front door: a wide pebble path down to the gate, a lantern, and the shipping bin. */
function putYard(put: Put) {
  const e = villaTier(1).ext;
  const doorC = WAKE_TILE[0];
  for (let r = e.r + e.h; r <= FARM_GATE[1]; r++) put('path', doorC, r);
  put('lantern', doorC - 3, e.r + e.h); // clear of the name plaque left of the door
  put('shipping-bin', doorC + 3, e.r + e.h);
}

/**
 * The house the villa starts as, from the owner's floor plan: two square rooms (9×9) side by side
 * on the tier-1 footprint (18×9). West, the kitchen and living room — the counter and fridge under
 * the north windows, the stove and a plant on the west wall, the dining table, and the TV table,
 * coffee table and sofa facing each other — with wide double doors front (to the gate) and back in
 * its east corner. East, through a wide doorway in the dividing wall, the bedroom: a cabinet (the
 * farm's storage), the double bed with a bedside table, a carpet at its foot, plants in two corners,
 * and a study table and chair under the east windows. Objects face +z at rot 0; rot 1 turns them to
 * face west, rot 3 east.
 */
function buildStarterHouse(put: Put) {
  const v = villaTier(1);
  const [x0, y0] = [v.c, v.r];
  const east = v.c + v.w - 1;
  const south = v.r + v.h - 1;
  const mid = x0 + 9; // first column of the bedroom
  const doors = [x0 + 7, x0 + 8]; // the living room's last two columns (the shell's door faces the gate)
  const windows = [x0 + 2, x0 + 3, mid + 4, mid + 5];
  for (let c = x0; c <= east; c++) {
    const piece = doors.includes(c) ? 'wall-door' : windows.includes(c) ? 'wall-window' : 'wall';
    put(piece, c, y0, 0);
    put(piece, c, south, 2);
  }
  for (let r = y0; r <= south; r++) {
    put('wall', x0, r, 3);
    put(r === y0 + 6 || r === y0 + 7 ? 'wall-window' : 'wall', east, r, 1);
    put(r === y0 + 4 || r === y0 + 5 ? 'wall-door' : 'wall', mid, r, 3); // the dividing wall
  }
  for (let c = x0; c <= east; c++) for (let r = y0; r <= south; r++) put('floor', c, r);

  // Kitchen and living room.
  put('kitchen-counter', x0, y0);
  put('fridge', x0 + 4, y0);
  put('stove', x0, y0 + 1, 3);
  put('plant', x0, y0 + 3);
  put('dining-set', x0 + 3, y0 + 2);
  put('tv-stand', x0, y0 + 5, 3);
  put('coffee-table', x0 + 3, y0 + 6, 1);
  put('sofa', x0 + 5, y0 + 5, 1);
  put('plant', x0 + 6, y0);

  // Bedroom.
  put('wardrobe', mid, y0, 3);
  put('big-bed', mid + 4, y0);
  put('bedside-table', mid + 6, y0);
  put('plant', east, y0);
  put('carpet', mid + 4, y0 + 3);
  put('desk', east, y0 + 6, 1);
  put('chair', east - 1, y0 + 7, 3);
  put('plant', mid, south);
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export const tile = (farm: FarmState, c: number, r: number): Tile | undefined => (inGrid(c, r) ? farm.tiles[tileIndex(c, r)] : undefined);

export function cropDays(crop: Crop): number {
  const def = CROPS[crop.id];
  return crop.harvests > 0 && def.regrow ? def.regrow : def.days;
}

export const isRipe = (crop: Crop) => crop.growth >= cropDays(crop);

/** 0 seed … 3 ripe, for drawing. */
export function cropStage(crop: Crop): number {
  if (isRipe(crop)) return 3;
  return Math.min(2, Math.floor((crop.growth / cropDays(crop)) * 3));
}

export function cropQuality(t: Tile, crop: Crop): Quality {
  if (!t.fertilized) return 'normal';
  return crop.missed === 0 ? 'great' : 'good';
}

/** The tree standing on a tile, if any. */
export const treeAt = (farm: FarmState, c: number, r: number): Tree | undefined => (farm.trees ?? []).find((t) => t.c === c && t.r === r);

/** Something stands on the tile that farming can't share it with (floors, paths, objects, trees). */
export function isBlocked(farm: FarmState, c: number, r: number): boolean {
  if (treeAt(farm, c, r)) return true;
  return placementsAt(farm, c, r).some((p) => PIECES[p.piece].layer !== 'edge');
}

export const isHost = (farm: FarmState, actor: Actor) => actor.id === farm.owner;

export function coopOf(farm: FarmState, id: number): Placement | undefined {
  const p = farm.placements.find((q) => q.id === id);
  return p && PIECES[p.piece].use === 'coop' ? p : undefined;
}

export const animalsIn = (farm: FarmState, coop: number) => farm.animals.filter((a) => a.home === coop);

export function binValue(bin: Bag): number {
  return Object.entries(bin).reduce((s, [k, n]) => s + sellPrice(k) * n, 0);
}

/* ------------------------------------------------------------------ */
/* Bags                                                                */
/* ------------------------------------------------------------------ */

export function addTo(bag: Bag, item: ItemKey, n: number) {
  const v = (bag[item] ?? 0) + n;
  if (v > 0) bag[item] = v;
  else delete bag[item];
}

const has = (bag: Bag, item: ItemKey, n: number) => (bag[item] ?? 0) >= n;

/* ------------------------------------------------------------------ */
/* Placement rules                                                     */
/* ------------------------------------------------------------------ */

/** Why a piece can't go here, or null when it can. Shared by the build-mode ghost and the sim. */
export function placementProblem(farm: FarmState, piece: string, c: number, r: number, rot: number): string | null {
  const def = PIECES[piece];
  if (!def) return 'Unknown piece';
  if (def.tier > farm.villaTier) return `Unlocks with villa tier ${def.tier}`;
  const tiles = footprint(def, c, r, rot);
  for (const [tc, tr] of tiles) {
    const inside = inHouseArea(tc, tr);
    if (!inGrid(tc, tr) && !inside) return 'Off the farm';
    if (!isOwned(farm, tc, tr)) return 'You don’t own this land yet';
    if ((def.villa || def.indoor) && !inVilla(farm, tc, tr)) return inside ? 'Only inside the house' : 'That goes inside the house';
    if (def.outdoor && inside) return 'That belongs outdoors';
    if (!inside) {
      if (treeAt(farm, tc, tr)) return 'A tree stands here';
      if (underShell(farm, tc, tr)) return 'The house stands here';
      const t = farm.tiles[tileIndex(tc, tr)];
      if (def.layer !== 'edge' && (t.tilled || t.crop)) return 'Tilled soil here — clear it with the hoe first';
    }
    for (const p of placementsAt(farm, tc, tr)) {
      const other = PIECES[p.piece];
      // Floors go under objects; edges (walls, fences) share a tile with both, one per edge.
      if (def.layer === 'edge') {
        if (other.layer === 'edge' && p.rot % 4 === rot % 4) return 'Something already stands on this edge';
      } else if (other.layer === def.layer) return 'Something is already here';
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Applying intents                                                    */
/* ------------------------------------------------------------------ */

const ok = (effects: Effect[] = [], note?: string): ApplyResult => ({ ok: true, effects, note });
const no = (reason: string): ApplyResult => ({ ok: false, reason });

/** Count a guest's help for the thank-you summary (only once the intent has succeeded). */
function credit(farm: FarmState, actor: Actor, what: Exclude<keyof HelpStats, 'name'>, n = 1) {
  if (isHost(farm, actor)) return;
  const h = (farm.help[actor.id] ??= { name: actor.name, watered: 0, planted: 0, harvested: 0, fed: 0, petted: 0, shipped: 0 });
  h[what] += n;
}

/** Take an item from the actor's bag (an effect) or from storage (now). Guests may only use storage. */
function spend(farm: FarmState, actor: Actor, from: 'self' | 'storage', item: ItemKey, n: number, effects: Effect[]): string | null {
  if (from === 'self') {
    if (!isHost(farm, actor)) return 'Guests plant and feed from the farm’s storage';
    effects.push({ e: 'take', who: actor.id, item, n });
    return null;
  }
  if (!has(farm.storage, item, n)) return `No ${ITEMS[parseItem(item).id]?.name ?? item} in storage`;
  addTo(farm.storage, item, -n);
  return null;
}

/** Produce goes to the host's own bag, or into the farm's storage when a guest picked it. */
function gather(farm: FarmState, actor: Actor, item: ItemKey, n: number, effects: Effect[]) {
  if (isHost(farm, actor)) effects.push({ e: 'give', who: actor.id, item, n });
  else addTo(farm.storage, item, n);
}

const HOST_ONLY = new Set<Intent['t']>(['till', 'chop', 'clear', 'withdraw', 'place', 'remove', 'recolor', 'roof', 'buyParcel', 'buyTier', 'buyAnimal', 'tip', 'endDay']);

export function applyIntent(farm: FarmState, actor: Actor, intent: Intent): ApplyResult {
  if (HOST_ONLY.has(intent.t) && !isHost(farm, actor)) return no('Only the farm’s owner can do that');
  const effects: Effect[] = [];

  switch (intent.t) {
    case 'chop': {
      const tree = treeAt(farm, intent.c, intent.r);
      if (!tree) return no('No tree here');
      if (!isOwned(farm, tree.c, tree.r)) return no('You don’t own this land yet');
      tree.hits++;
      if (tree.hits < TREE_HITS[tree.stage]) return ok([], 'chop');
      // Down it comes: wood by its size, and its seeds (a seedling just comes up whole).
      const def = TREES[tree.kind];
      farm.trees = farm.trees.filter((t) => t !== tree);
      const drops: [string, number][] =
        tree.stage <= 1 ? [[def.seed, 1]] : tree.stage === 2 ? [['wood', 1]] : tree.stage === 3 ? [['wood', 3], [def.seed, 1]] : [['wood', def.wood], [def.seed, def.seeds]];
      for (const [item, n] of drops) effects.push({ e: 'give', who: actor.id, item, n });
      return ok(effects, 'felled');
    }
    case 'till': {
      const t = tile(farm, intent.c, intent.r);
      if (!t || !isOwned(farm, intent.c, intent.r)) return no('You don’t own this land yet');
      if (inVilla(farm, intent.c, intent.r)) return no('Not inside the villa footprint');
      if (isBlocked(farm, intent.c, intent.r)) return no('Something is in the way');
      if (t.crop) return no('A crop is growing here');
      if (t.tilled) {
        // Hoeing tilled, empty soil turns it back to grass.
        Object.assign(t, emptyTile());
        return ok([], 'untill');
      }
      t.tilled = true;
      return ok();
    }
    case 'water': {
      const t = tile(farm, intent.c, intent.r);
      if (!t?.tilled) return no('Only tilled soil needs water');
      if (t.watered) return no('Already watered today');
      t.watered = true;
      credit(farm, actor, 'watered');
      return ok();
    }
    case 'fertilize': {
      const t = tile(farm, intent.c, intent.r);
      if (!t?.tilled) return no('Fertilizer goes on tilled soil');
      if (t.fertilized) return no('Already fertilized');
      if (t.crop && t.crop.growth > 0) return no('Fertilize before the seed sprouts');
      const err = spend(farm, actor, intent.from, 'fertilizer', 1, effects);
      if (err) return no(err);
      t.fertilized = true;
      return ok(effects);
    }
    case 'plant': {
      const t = tile(farm, intent.c, intent.r);
      const item = ITEMS[intent.seed];
      if (item?.tree) return plantTree(farm, actor, intent.c, intent.r, intent.seed, intent.from, effects);
      const crop = item?.crop ? CROPS[item.crop] : undefined;
      if (!t?.tilled || !crop) return no('Seeds go in tilled soil');
      if (t.crop) return no('Something is already growing here');
      if (!crop.seasons.includes(farm.season)) return no(`${crop.name} won’t grow in ${farm.season}`);
      const err = spend(farm, actor, intent.from, intent.seed, 1, effects);
      if (err) return no(err);
      t.crop = { id: crop.id, growth: 0, missed: 0, harvests: 0 };
      credit(farm, actor, 'planted');
      return ok(effects);
    }
    case 'harvest': {
      const t = tile(farm, intent.c, intent.r);
      if (!t?.crop || !isRipe(t.crop)) return no('Nothing ripe here');
      const crop = t.crop;
      const def = CROPS[crop.id];
      gather(farm, actor, itemKey(crop.id, cropQuality(t, crop)), 1, effects);
      if (def.regrow) {
        crop.harvests++;
        crop.growth = 0;
      } else {
        t.crop = null;
        t.fertilized = false;
      }
      credit(farm, actor, 'harvested');
      return ok(effects);
    }
    case 'clear': {
      const t = tile(farm, intent.c, intent.r);
      if (!t?.crop) return no('Nothing to clear');
      t.crop = null;
      return ok();
    }
    case 'ship': {
      if (intent.n < 1 || sellPrice(intent.item) <= 0) return no('The bin won’t take that');
      effects.push({ e: 'take', who: actor.id, item: intent.item, n: intent.n });
      addTo(farm.bin, intent.item, intent.n);
      credit(farm, actor, 'shipped', intent.n);
      return ok(effects);
    }
    case 'deposit': {
      if (intent.n < 1) return no('Nothing to store');
      effects.push({ e: 'take', who: actor.id, item: intent.item, n: intent.n });
      addTo(farm.storage, intent.item, intent.n);
      return ok(effects);
    }
    case 'withdraw': {
      if (intent.n < 1 || !has(farm.storage, intent.item, intent.n)) return no('Not in storage');
      addTo(farm.storage, intent.item, -intent.n);
      effects.push({ e: 'give', who: actor.id, item: intent.item, n: intent.n });
      return ok(effects);
    }
    case 'feed': {
      const coop = coopOf(farm, intent.coop);
      if (!coop) return no('No coop here');
      const hungry = animalsIn(farm, coop.id).filter((a) => !a.fed);
      if (!hungry.length) return no(animalsIn(farm, coop.id).length ? 'Everyone has eaten today' : 'No animals live here yet');
      const err = spend(farm, actor, intent.from, ANIMALS[hungry[0].kind].feed, hungry.length, effects);
      if (err) return no(err);
      for (const a of hungry) a.fed = true;
      credit(farm, actor, 'fed', hungry.length);
      return ok(effects);
    }
    case 'collect': {
      const bag = farm.produce[intent.coop];
      if (!bag || !Object.keys(bag).length) return no('Nothing to collect yet');
      let count = 0;
      for (const [item, n] of Object.entries(bag)) {
        gather(farm, actor, item, n, effects);
        count += n;
      }
      delete farm.produce[intent.coop];
      credit(farm, actor, 'harvested', count);
      return ok(effects);
    }
    case 'pet': {
      const a = farm.animals.find((x) => x.id === intent.animal);
      if (!a) return no('Nobody here');
      if (a.petted) return no(`${a.name} has had a cuddle today`);
      a.petted = true;
      a.happiness = Math.min(100, a.happiness + 12);
      credit(farm, actor, 'petted');
      return ok();
    }
    case 'place': {
      const problem = placementProblem(farm, intent.piece, intent.c, intent.r, intent.rot);
      if (problem) return no(problem);
      farm.placements.push({ id: farm.nextId++, piece: intent.piece, c: intent.c, r: intent.r, rot: intent.rot % 4, color: intent.color, storey: 0 });
      effects.push({ e: 'take', who: actor.id, item: kitItem(intent.piece), n: 1 });
      return ok(effects);
    }
    case 'remove': {
      const i = farm.placements.findIndex((p) => p.id === intent.id);
      if (i < 0) return no('Nothing here');
      const p = farm.placements[i];
      const def = PIECES[p.piece];
      if (def.use === 'coop' && animalsIn(farm, p.id).length) return no('Animals live in this coop');
      if (def.use === 'ship' && Object.keys(farm.bin).length) return no('Empty the bin first — it pays out tonight');
      if (def.use === 'sleep' && farm.placements.filter((q) => PIECES[q.piece].use === 'sleep').length === 1) return no('You need somewhere to sleep');
      farm.placements.splice(i, 1);
      if (def.use === 'coop') delete farm.produce[p.id];
      effects.push({ e: 'give', who: actor.id, item: kitItem(p.piece), n: 1 });
      return ok(effects);
    }
    case 'recolor': {
      const p = farm.placements.find((q) => q.id === intent.id);
      if (!p) return no('Nothing here');
      p.color = intent.color;
      return ok();
    }
    case 'roof': {
      farm.roofColor = intent.color;
      return ok();
    }
    case 'buyParcel': {
      const parcel = PARCELS.find((p) => p.id === intent.parcel);
      if (!parcel) return no('No such land');
      if (farm.parcels.includes(parcel.id)) return no('Already yours');
      farm.parcels.push(parcel.id);
      effects.push({ e: 'gold', who: actor.id, n: -parcel.price });
      return ok(effects);
    }
    case 'buyTier': {
      const next = VILLA_TIERS.find((t) => t.tier === intent.tier);
      if (!next || intent.tier !== farm.villaTier + 1) return no('Not available');
      farm.villaTier = intent.tier;
      effects.push({ e: 'gold', who: actor.id, n: -next.price });
      return ok(effects);
    }
    case 'buyAnimal': {
      const def = ANIMALS[intent.kind];
      const coop = coopOf(farm, intent.coop);
      if (!def || !coop) return no(`Build a ${PIECES[def?.home ?? 'coop'].name.toLowerCase()} first`);
      if (animalsIn(farm, coop.id).length >= def.capacity) return no('That coop is full');
      farm.animals.push({ id: farm.nextId++, kind: def.id, name: intent.name.slice(0, 16) || def.name, home: coop.id, happiness: 40, fed: false, petted: false });
      effects.push({ e: 'gold', who: actor.id, n: -def.price });
      return ok(effects);
    }
    case 'tip': {
      if (intent.gold < 0) return no('Not a tip');
      for (const [item, n] of Object.entries(intent.items)) if (!has(farm.storage, item, n)) return no('Not enough in storage');
      for (const [item, n] of Object.entries(intent.items)) {
        addTo(farm.storage, item, -n);
        effects.push({ e: 'give', who: intent.to, item, n });
      }
      if (intent.gold > 0) effects.push({ e: 'gold', who: actor.id, n: -intent.gold }, { e: 'gold', who: intent.to, n: intent.gold });
      return ok(effects);
    }
    case 'endDay':
      return ok(endDay(farm));
  }
}

/** Plant a tree seed: on owned grass (or bare soil), with room round it to grow. Only the owner plants trees. */
function plantTree(farm: FarmState, actor: Actor, c: number, r: number, seed: string, from: 'self' | 'storage', effects: Effect[]): ApplyResult {
  const kind = ITEMS[seed].tree!;
  const t = tile(farm, c, r);
  if (!isHost(farm, actor)) return no(`Only ${farm.ownerName} plants trees`);
  if (!t || !isOwned(farm, c, r)) return no('You don’t own this land yet');
  if (t.crop) return no('A crop is growing here');
  if (isBlocked(farm, c, r) || underShell(farm, c, r)) return no('Something is in the way');
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if ((dc || dr) && treeAt(farm, c + dc, r + dr)) return no('Trees need room to grow — try a tile further from the others');
  const err = spend(farm, actor, from, seed, 1, effects);
  if (err) return no(err);
  Object.assign(t, emptyTile());
  farm.trees.push({ id: farm.nextId++, kind, c, r, stage: 0, growth: 0, hits: 0 });
  return ok(effects, 'tree');
}

/* ------------------------------------------------------------------ */
/* Overnight                                                           */
/* ------------------------------------------------------------------ */

/**
 * The farm settles overnight: watered crops grow (unwatered ones simply wait), fed animals
 * produce, the shipping bin pays the owner, and the calendar turns. Nothing dies or is lost.
 */
export function endDay(farm: FarmState): Effect[] {
  const effects: Effect[] = [];
  for (const t of farm.tiles) {
    if (t.crop && !isRipe(t.crop)) {
      if (t.watered) t.crop.growth++;
      else if (t.crop.growth > 0 || t.crop.harvests > 0) t.crop.missed++;
    }
    t.watered = false;
  }
  // Trees grow by themselves, a stage every few nights; half-chopped ones heal.
  for (const tree of farm.trees) {
    tree.hits = 0;
    if (tree.stage >= TREE_GROWN) continue;
    if (++tree.growth >= TREES[tree.kind].nightsPerStage) {
      tree.stage++;
      tree.growth = 0;
    }
  }
  for (const a of farm.animals) {
    const def = ANIMALS[a.kind];
    if (a.fed) {
      const q: Quality = a.happiness >= 85 ? 'great' : a.happiness >= 60 ? 'good' : 'normal';
      addTo((farm.produce[a.home] ??= {}), itemKey(def.product, q), 1);
    }
    if (!a.petted) a.happiness = Math.max(20, a.happiness - 4);
    a.fed = false;
    a.petted = false;
  }
  const gold = binValue(farm.bin);
  farm.lastPayout = { gold, items: farm.bin };
  if (gold > 0) effects.push({ e: 'gold', who: farm.owner, n: gold });
  farm.bin = {};
  farm.help = {};
  farm.minute = 0;

  farm.day++;
  if (farm.day > DAYS_PER_SEASON) {
    farm.day = 1;
    const seasons = SLICE_SEASONS.length ? SLICE_SEASONS : SEASONS;
    const i = seasons.indexOf(farm.season);
    if (i < 0 || i === seasons.length - 1) {
      farm.season = seasons[0];
      farm.year++;
    } else farm.season = seasons[i + 1];
    // Out-of-season crops wither at the turn of a season.
    for (const t of farm.tiles) if (t.crop && !CROPS[t.crop.id].seasons.includes(farm.season)) t.crop = null;
  }
  return effects;
}

/* ------------------------------------------------------------------ */
/* Saves                                                               */
/* ------------------------------------------------------------------ */

/** Upgrade an older save to the current schema, one version at a time. */
export function migrateFarm(raw: unknown): FarmState | null {
  if (!raw || typeof raw !== 'object') return null;
  const farm = raw as FarmState;
  if (typeof farm.version !== 'number' || !Array.isArray(farm.tiles)) return null;
  if (farm.tiles.length !== GRID.cols * GRID.rows) return null;
  // The house moved twice: 7×6 at row 0 (v1), 12×6 at row 1 (v2), now 18×9 at row 1.
  // v3 had it 18×9 on the farm; now the rooms are their own space and the farm has the shell.
  const OLD_HOUSES: Record<number, [number, number, number, number]> = { 1: [15, 0, 7, 6], 2: [13, 1, 12, 6], 3: [11, 1, 18, 9] };
  if (OLD_HOUSES[farm.version]) {
    rebuildStarterHouse(farm, OLD_HOUSES[farm.version]);
    farm.version = SAVE_VERSION;
  }
  if (farm.version === 4) {
    // v5 made the house smaller outside (12×6 → 8×5): the path now starts a row nearer.
    const e = villaTier(farm.villaTier).ext;
    for (const c of [WAKE_TILE[0]]) {
      for (let r = e.r + e.h; r < e.r + e.h + 2; r++) {
        if (!placementsAt(farm, c, r).some((p) => PIECES[p.piece]?.layer === 'floor') && !farm.tiles[tileIndex(c, r)].tilled) {
          farm.placements.push({ id: farm.nextId++, piece: 'path', c, r, rot: 0, color: PIECES.path.color, storey: 0 });
        }
      }
    }
    farm.version = 5;
  }
  if (farm.version === 5) {
    // v6: the path to the door is one tile wide again; the second lane's stones go to storage.
    const e = villaTier(farm.villaTier).ext;
    const lane = (p: Placement) => p.piece === 'path' && p.c === WAKE_TILE[0] + 1 && p.r >= e.r + e.h && p.r <= FARM_GATE[1];
    const n = farm.placements.filter(lane).length;
    farm.placements = farm.placements.filter((p) => !lane(p));
    if (n) addTo(farm.storage, kitItem('path'), n);
    farm.version = 6;
  }
  // v7: trees are part of the farm (the orchard's and wild ones), to chop and to plant.
  if (!Array.isArray(farm.trees)) plantStartingTrees(farm);
  if (farm.version === 6) farm.version = 7;
  if (farm.version === 7) {
    // v8: the house's floor is light oak planks (floors still in the old default brown change too).
    for (const p of farm.placements) if (p.piece === 'floor' && p.color === 7) p.color = PIECES.floor.color;
    farm.version = 8;
  }
  if (farm.version === 8) {
    // v9: the world grew east (a forest, the town hall, beaches), so the house's rooms moved further
    // out, from column 88 to 160.
    for (const p of farm.placements) if (p.c >= 88 && p.c < 114) p.c += 72;
    farm.version = 9;
  }
  return farm;
}

/**
 * Put up the current starter house over an older one ([c, r, w, h]). Everything standing where
 * either house is comes down; the new house (and its yard, where there's room) goes up; furniture
 * that came down and isn't part of the new house goes into storage as kit, so nothing the player
 * owned is lost. Coops stay put (animals live in them) and new pieces skip anything in their way.
 */
function rebuildStarterHouse(farm: FarmState, [oc, or, ow, oh]: [number, number, number, number]) {
  const v = villaTier(1);
  const inArea = (c: number, r: number) =>
    (c >= oc && c < oc + ow && r >= or && r < or + oh) || (c >= v.c && c < v.c + v.w && r >= v.r && r < v.r + v.h) || underShell(farm, c, r);
  const kept: Placement[] = [];
  const removed: Record<string, number> = {};
  for (const p of farm.placements) {
    const def = PIECES[p.piece];
    const there = !def || footprint(def, p.c, p.r, p.rot).some(([c, r]) => inArea(c, r));
    if (!there || def?.use === 'coop') kept.push(p);
    else if (!def.villa) removed[p.piece] = (removed[p.piece] ?? 0) + 1;
  }
  farm.placements = kept;
  const put: Put = (piece, c, r, rot = 0) => {
    const def = PIECES[piece];
    if (piece === 'shipping-bin' && farm.placements.some((q) => q.piece === piece)) return;
    for (const [fc, fr] of footprint(def, c, r, rot)) {
      if (!inHouseArea(fc, fr) && (!inGrid(fc, fr) || farm.tiles[tileIndex(fc, fr)].tilled || farm.tiles[tileIndex(fc, fr)].crop)) return;
      for (const q of placementsAt(farm, fc, fr)) {
        const other = PIECES[q.piece];
        if (other?.layer === def.layer && (def.layer !== 'edge' || q.rot % 4 === rot % 4)) return;
      }
    }
    farm.placements.push({ id: farm.nextId++, piece, c, r, rot, color: def.color, storey: 0 });
    if (removed[piece]) removed[piece]--;
  };
  buildStarterHouse(put);
  putYard(put);
  for (const [piece, n] of Object.entries(removed)) if (n > 0) addTo(farm.storage, kitItem(piece), n);
}

export function cloneFarm(farm: FarmState): FarmState {
  return JSON.parse(JSON.stringify(farm)) as FarmState;
}
