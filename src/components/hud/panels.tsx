'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ANIMALS, ITEMS, PARCELS, SHOPS, VILLA_TIERS, itemIcon, itemName, parseItem, sellPrice, shopStock } from '@/game/sim/content';
import { animalsIn, binValue } from '@/game/sim/sim';
import type { Bag } from '@/game/sim/types';
import { playSound } from '@/game/engine/sound';
import { joinLink } from '@/game/net/coop';
import { attachEmail, cloudEnabled } from '@/game/state/cloud';
import {
  amHost,
  buy,
  buyAnimal,
  buyParcel,
  buyTier,
  closeFarm,
  closeMorning,
  getAccount,
  joinFarm,
  leaveToTitle,
  leaveVisit,
  openFarm,
  seasonName,
  submit,
  thanksFor,
  tipGuest,
} from '@/game/state/director';
import { useFarmState } from '@/game/state/farm-store';
import { useProfile } from '@/game/state/profile-store';
import { useSession } from '@/game/state/session-store';
import { OptionsPanel } from '../screens/options-panel';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

/** A dimmed backdrop with a paper card; `bare` drops the card for children that bring their own. */
export function Modal({ children, width = 'max-w-lg', onBackdrop, bare = false }: { children: ReactNode; width?: string; onBackdrop?: () => void; bare?: boolean }) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/35 p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onBackdrop}
    >
      {bare ? (
        children
      ) : (
        <motion.div
          className={`paper flex max-h-[92vh] w-full ${width} flex-col overflow-hidden`}
          initial={{ scale: 0.94, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  );
}

function useClose() {
  const closePanel = useSession((s) => s.closePanel);
  return () => {
    playSound('close');
    closePanel();
  };
}

function Header({ kicker, title, tone = 'bg-sun', right }: { kicker: string; title: string; tone?: string; right?: ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b-3 border-ink px-5 py-3 ${tone}`}>
      <div>
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink-soft">{kicker}</p>
        <h3 className="font-display text-xl font-semibold leading-tight">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function Gold({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-display font-semibold ${className}`}>
      <span className="inline-block h-4 w-4 rounded-full border-2 border-ink bg-sun" aria-hidden />
      {n.toLocaleString()}g
    </span>
  );
}

function Footer({ onClose, hint = 'Esc' }: { onClose: () => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between border-t-3 border-ink px-5 py-3">
      <Gold n={useProfile.getState().gold} />
      <button className="btn btn--ghost" onClick={onClose}>
        Close <span className="key">{hint}</span>
      </button>
    </div>
  );
}

function Row({ icon, name, sub, children }: { icon: string; name: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-ink bg-white/70 px-3 py-2">
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-display text-base font-semibold">{name}</p>
        {sub && <p className="text-xs font-bold text-ink-soft">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

const small = 'btn px-2.5 py-1 text-sm';

function bagEntries(bag: Bag, filter?: (key: string) => boolean) {
  return Object.entries(bag)
    .filter(([k, n]) => n > 0 && (!filter || filter(k)))
    .sort(([a], [b]) => itemName(a).localeCompare(itemName(b)));
}

/* ------------------------------------------------------------------ */
/* Shops                                                               */
/* ------------------------------------------------------------------ */

export function ShopPanel() {
  const close = useClose();
  const shopId = useSession((s) => s.panelArg) ?? 'store';
  const shop = SHOPS[shopId];
  const farm = useFarmState();
  const { gold, bag } = useProfile();
  const host = amHost();
  const [tab, setTab] = useState<'goods' | 'more'>('goods');
  const [chickName, setChickName] = useState('');
  if (!farm || !shop) return null;
  const stock = shopStock(shopId, farm.season, host ? farm.villaTier : 3);
  const tabs = shopId === 'store' ? ['Seeds & Supplies', 'Animals'] : ['Building Kit', 'Land & Villa'];
  const nextTier = VILLA_TIERS.find((t) => t.tier === farm.villaTier + 1);
  const coops = farm.placements.filter((p) => p.piece === 'coop');
  const space = coops.reduce((s, c) => s + ANIMALS.chicken.capacity - animalsIn(farm, c.id).length, 0);

  return (
    <Modal onBackdrop={close} width="max-w-xl">
      <Header kicker={`${shop.keeper.toUpperCase()} · ${shop.name.toUpperCase()}`} title={`“${shop.greeting}”`} right={<Gold n={gold} className="text-lg" />} />
      <p className="border-b-2 border-ink/15 bg-paper-2 px-5 py-2 text-sm font-semibold italic text-ink-soft">{shop.seasonal[farm.season]}</p>
      <div className="flex gap-2 px-5 pt-3">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-bold ${(i === 0) === (tab === 'goods') ? 'bg-mint shadow-[0_2px_0_#2b2340]' : 'bg-white'}`}
            onClick={() => {
              setTab(i === 0 ? 'goods' : 'more');
              playSound('blip');
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-2 overflow-y-auto px-5 py-3">
        {tab === 'goods' &&
          stock.map((id) => {
            const def = ITEMS[id];
            return (
              <Row key={id} icon={def.icon} name={def.name} sub={<>{def.buy}g · you have {bag[id] ?? 0}</>}>
                <button className={small} disabled={gold < def.buy} onClick={() => buy(id, 1)}>
                  Buy
                </button>
                <button className={`${small} btn--ghost`} disabled={gold < def.buy * 5} onClick={() => buy(id, 5)}>
                  ×5
                </button>
              </Row>
            );
          })}
        {tab === 'more' && shopId === 'store' && (
          <>
            <Row icon="🐔" name="Chicken" sub={<>{ANIMALS.chicken.price}g · lays an egg a day when fed · room for {space}</>}>
              <input
                value={chickName}
                onChange={(e) => setChickName(e.target.value.slice(0, 16))}
                placeholder="Name"
                className="w-24 rounded-lg border-2 border-ink bg-white px-2 py-1 text-sm font-bold outline-none"
              />
              <button
                className={small}
                disabled={!host || gold < ANIMALS.chicken.price}
                onClick={() => {
                  buyAnimal('chicken', chickName.trim());
                  setChickName('');
                }}
              >
                Buy
              </button>
            </Row>
            {!coops.length && <p className="px-1 text-sm font-semibold text-ink-soft">Chickens need a coop first — Bram the carpenter builds them.</p>}
            {!host && <p className="px-1 text-sm font-semibold text-ink-soft">Only {farm.ownerName} can add animals to this farm.</p>}
          </>
        )}
        {tab === 'more' && shopId === 'carpenter' && (
          <>
            {PARCELS.map((p) => {
              const owned = farm.parcels.includes(p.id);
              return (
                <Row key={p.id} icon="🗺️" name={p.name} sub={owned ? 'Yours' : <>{p.price.toLocaleString()}g · {p.blurb}</>}>
                  <button className={small} disabled={!host || owned || gold < p.price} onClick={() => buyParcel(p.id)}>
                    {owned ? 'Owned' : 'Buy'}
                  </button>
                </Row>
              );
            })}
            {nextTier ? (
              <Row icon="🏡" name={`Villa: ${nextTier.name}`} sub={<>{nextTier.price.toLocaleString()}g · {nextTier.unlocks}</>}>
                <button className={small} disabled={!host || gold < nextTier.price} onClick={buyTier}>
                  Upgrade
                </button>
              </Row>
            ) : (
              <Row icon="🏰" name="Your villa is at its grandest" sub="Every footprint and kit piece is unlocked." />
            )}
            {!host && <p className="px-1 text-sm font-semibold text-ink-soft">Land and villa upgrades are for {farm.ownerName} to buy.</p>}
          </>
        )}
      </div>
      <Footer onClose={close} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Storage chest and shipping bin                                      */
/* ------------------------------------------------------------------ */

export function StoragePanel() {
  const close = useClose();
  const farm = useFarmState();
  const bag = useProfile((s) => s.bag);
  const host = amHost();
  if (!farm) return null;
  const mine = bagEntries(bag, (k) => !k.startsWith('kit:'));
  const stored = bagEntries(farm.storage);
  return (
    <Modal onBackdrop={close} width="max-w-2xl">
      <Header kicker="STORAGE CHEST" title={host ? 'The farm’s shared storage' : `${farm.ownerName}’s storage`} tone="bg-mint" />
      <div className="grid gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        <section className="space-y-2">
          <p className="font-display text-sm font-semibold">Your bag</p>
          {!mine.length && <p className="text-sm font-semibold text-ink-soft">Empty.</p>}
          {mine.map(([k, n]) => (
            <Row key={k} icon={itemIcon(k)} name={itemName(k)} sub={`× ${n}`}>
              <button className={small} onClick={() => submit({ t: 'deposit', item: k, n: 1 })}>
                Store
              </button>
              <button className={`${small} btn--ghost`} onClick={() => submit({ t: 'deposit', item: k, n })}>
                All
              </button>
            </Row>
          ))}
        </section>
        <section className="space-y-2">
          <p className="font-display text-sm font-semibold">In the chest</p>
          {!stored.length && <p className="text-sm font-semibold text-ink-soft">Nothing yet. Seeds left here can be planted by visiting friends.</p>}
          {stored.map(([k, n]) => (
            <Row key={k} icon={itemIcon(k)} name={itemName(k)} sub={`× ${n}`}>
              {host && (
                <>
                  <button className={small} onClick={() => submit({ t: 'withdraw', item: k, n: 1 })}>
                    Take
                  </button>
                  <button className={`${small} btn--ghost`} onClick={() => submit({ t: 'withdraw', item: k, n })}>
                    All
                  </button>
                </>
              )}
            </Row>
          ))}
          {!host && <p className="text-xs font-semibold text-ink-soft">Guests can put things in, not take them out.</p>}
        </section>
      </div>
      <Footer onClose={close} />
    </Modal>
  );
}

export function ShipPanel() {
  const close = useClose();
  const farm = useFarmState();
  const bag = useProfile((s) => s.bag);
  if (!farm) return null;
  const sellable = bagEntries(bag, (k) => sellPrice(k) > 0);
  const binned = bagEntries(farm.bin);
  return (
    <Modal onBackdrop={close} width="max-w-xl">
      <Header kicker="SHIPPING BIN" title="Sold overnight at the base price" tone="bg-sun" right={<span className="text-sm font-bold">Tonight: <Gold n={binValue(farm.bin)} /></span>} />
      <div className="space-y-2 overflow-y-auto px-5 py-4">
        {!sellable.length && <p className="text-sm font-semibold text-ink-soft">Nothing in your bag to ship. Harvest something first!</p>}
        {sellable.map(([k, n]) => (
          <Row key={k} icon={itemIcon(k)} name={itemName(k)} sub={<>{sellPrice(k)}g each · × {n}</>}>
            <button className={small} onClick={() => submit({ t: 'ship', item: k, n: 1 })}>
              Ship
            </button>
            <button className={`${small} btn--ghost`} onClick={() => submit({ t: 'ship', item: k, n })}>
              All
            </button>
          </Row>
        ))}
        {binned.length > 0 && (
          <div className="rounded-xl bg-paper-2 px-4 py-2 text-sm font-bold text-ink-soft">
            In the bin: {binned.map(([k, n]) => `${n} × ${itemName(k)}`).join(', ')}
            {!amHost() && <span className="block text-xs">The bin pays {farm.ownerName} — shipping here is a gift to their farm.</span>}
          </div>
        )}
      </div>
      <Footer onClose={close} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* The coop                                                            */
/* ------------------------------------------------------------------ */

export function CoopPanel() {
  const close = useClose();
  const farm = useFarmState();
  const coopId = Number(useSession((s) => s.panelArg));
  const bag = useProfile((s) => s.bag);
  const host = amHost();
  if (!farm) return null;
  const hens = animalsIn(farm, coopId);
  const eggs = Object.values(farm.produce[coopId] ?? {}).reduce((s, n) => s + n, 0);
  const hungry = hens.filter((a) => !a.fed).length;
  const feedFrom = host && (bag.feed ?? 0) >= hungry ? 'self' : 'storage';
  return (
    <Modal onBackdrop={close}>
      <Header kicker="CHICKEN COOP" title={hens.length ? `${hens.length} hen${hens.length > 1 ? 's' : ''} at home` : 'Empty and waiting'} tone="bg-mint" />
      <div className="space-y-2 overflow-y-auto px-5 py-4">
        {!hens.length && <p className="text-sm font-semibold text-ink-soft">Rosa at the General Store sells chickens.</p>}
        {hens.map((a) => (
          <Row
            key={a.id}
            icon="🐔"
            name={a.name}
            sub={
              <>
                {'💛'.repeat(Math.max(1, Math.round(a.happiness / 34)))} · {a.fed ? 'fed' : 'hungry'} · {a.petted ? 'cuddled today' : 'walk up and pet her'}
              </>
            }
          />
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn py-1.5" disabled={!hungry} onClick={() => submit({ t: 'feed', coop: coopId, from: feedFrom })}>
            Feed {hungry ? `(${hungry} feed from ${feedFrom === 'self' ? 'your bag' : 'storage'})` : '— all fed'}
          </button>
          <button className="btn btn--teal py-1.5" disabled={!eggs} onClick={() => submit({ t: 'collect', coop: coopId })}>
            Collect {eggs ? `${eggs} egg${eggs > 1 ? 's' : ''}` : '— none yet'}
          </button>
        </div>
        <p className="text-xs font-semibold text-ink-soft">Fed hens lay overnight. Happier hens (pet them daily) lay better eggs.</p>
      </div>
      <Footer onClose={close} />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Bag                                                                 */
/* ------------------------------------------------------------------ */

export function BagPanel() {
  const close = useClose();
  const { bag, gold, name } = useProfile();
  const items = bagEntries(bag);
  return (
    <Modal onBackdrop={close}>
      <Header kicker="YOUR BAG" title={name} right={<Gold n={gold} className="text-lg" />} />
      <div className="grid grid-cols-1 gap-2 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        {!items.length && <p className="text-sm font-semibold text-ink-soft">Empty.</p>}
        {items.map(([k, n]) => (
          <Row key={k} icon={itemIcon(k)} name={itemName(k)} sub={`× ${n}${sellPrice(k) ? ` · ${sellPrice(k)}g each` : ''}`} />
        ))}
      </div>
      <Footer onClose={close} hint="I" />
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Morning and thank-yous                                              */
/* ------------------------------------------------------------------ */

export function MorningPanel() {
  const farm = useFarmState();
  const passedOut = useSession((s) => s.panelArg) === 'passed-out';
  useEffect(() => playSound('success'), []);
  if (!farm) return null;
  const pay = farm.lastPayout;
  const items = pay ? bagEntries(pay.items) : [];
  return (
    <Modal width="max-w-md">
      <Header kicker={`GOOD MORNING · YEAR ${farm.year}`} title={`${seasonName(farm.season)} ${farm.day}`} tone="bg-sun" />
      <div className="space-y-3 px-5 py-4">
        {passedOut && <p className="text-sm font-semibold text-ink-soft">You woke up a little stiff, but nothing was lost. Bed before 2 AM tomorrow, maybe.</p>}
        {items.length ? (
          <>
            <p className="font-display font-semibold">Last night the shipping bin sold:</p>
            <ul className="space-y-1 text-sm font-bold">
              {items.map(([k, n]) => (
                <li key={k} className="flex justify-between">
                  <span>
                    {itemIcon(k)} {n} × {itemName(k)}
                  </span>
                  <span>{sellPrice(k) * n}g</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t-2 border-ink/20 pt-2 font-display text-lg font-semibold">
              Earned <Gold n={pay!.gold} />
            </p>
          </>
        ) : (
          <p className="text-sm font-semibold text-ink-soft">The crops that were watered grew overnight. Anything you put in the shipping bin is paid for the next morning.</p>
        )}
      </div>
      <div className="border-t-3 border-ink px-5 py-3 text-right">
        <button className="btn py-1.5" autoFocus onClick={closeMorning}>
          Start the day
        </button>
      </div>
    </Modal>
  );
}

export function ThanksPanel() {
  const ids = useSession((s) => s.thanks);
  const farm = useFarmState();
  const gold = useProfile((s) => s.gold);
  const id = ids[0];
  const stats = id ? thanksFor(id) : undefined;
  if (!farm || !id || !stats) return null;
  // A crate of the most plentiful produce in storage, up to five.
  const produce = bagEntries(farm.storage, (k) => ITEMS[parseItem(k).id]?.kind === 'produce').sort(([, a], [, b]) => b - a)[0];
  const crate: Bag | null = produce ? { [produce[0]]: Math.min(5, produce[1]) } : null;
  const did = [
    stats.watered && `watered ${stats.watered} tile${stats.watered > 1 ? 's' : ''}`,
    stats.planted && `planted ${stats.planted} seed${stats.planted > 1 ? 's' : ''}`,
    stats.harvested && `harvested ${stats.harvested}`,
    stats.fed && `fed ${stats.fed} animal${stats.fed > 1 ? 's' : ''}`,
    stats.petted && `petted ${stats.petted}`,
    stats.shipped && `shipped ${stats.shipped}`,
  ].filter(Boolean);
  return (
    <Modal width="max-w-md">
      <Header kicker="THANK-YOU" title={`${stats.name} helped out today`} tone="bg-mint" right={ids.length > 1 ? <span className="text-sm font-bold">+{ids.length - 1} more</span> : undefined} />
      <div className="space-y-3 px-5 py-4">
        <p className="font-semibold">They {did.join(', ')}.</p>
        <p className="text-sm font-semibold text-ink-soft">Send a little something? It goes straight to their own bag. Entirely optional.</p>
        <div className="grid grid-cols-2 gap-2">
          {crate && (
            <button className="btn btn--teal col-span-2 py-1.5 text-base" onClick={() => tipGuest(id, { gold: 0, items: crate })}>
              A crate: {Object.entries(crate).map(([k, n]) => `${n} × ${itemName(k)}`)}
            </button>
          )}
          {[50, 100].map((g) => (
            <button key={g} className="btn py-1.5 text-base" disabled={gold < g} onClick={() => tipGuest(id, { gold: g, items: {} })}>
              {g}g
            </button>
          ))}
          <button className="btn btn--ghost col-span-2 py-1.5 text-base" onClick={() => tipGuest(id, null)}>
            Just say thanks
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Co-op                                                               */
/* ------------------------------------------------------------------ */

export function CoopPlayPanel() {
  const close = useClose();
  const net = useSession((s) => s.net);
  const farm = useFarmState();
  const myId = useProfile((s) => s.playerId);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const host = amHost();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  };
  return (
    <Modal onBackdrop={close} width="max-w-md">
      <Header kicker="PLAY TOGETHER" title={net.status === 'visiting' ? `Visiting ${farm?.ownerName}’s farm` : net.status === 'hosting' ? 'Your farm is open' : 'Friends on the farm'} tone="bg-mint" />
      <div className="space-y-4 px-5 py-4">
        {net.status === 'hosting' && net.code && (
          <div className="space-y-2 text-center">
            <p className="text-sm font-semibold text-ink-soft">Share this code, or the link — friends join in seconds, no install.</p>
            <p className="font-display text-4xl font-bold tracking-[0.25em]">{net.code}</p>
            <div className="flex justify-center gap-2">
              <button className={small} onClick={() => copy(net.code!)}>
                Copy code
              </button>
              <button className={`${small} btn--teal`} onClick={() => copy(joinLink(net.code!))}>
                Copy link
              </button>
            </div>
            {copied && <p className="text-xs font-bold text-teal">Copied!</p>}
          </div>
        )}
        {(net.status === 'hosting' || net.status === 'visiting') && (
          <div className="space-y-1.5">
            <p className="font-display text-sm font-semibold">Here now</p>
            {net.players.map((p) => (
              <div key={p.sid} className="flex items-center justify-between rounded-lg bg-paper-2 px-3 py-1.5 text-sm font-bold">
                <span>
                  {p.name}
                  {p.id === myId ? ' (you)' : ''}
                </span>
                <span className="text-ink-soft">{p.host ? 'host 🏡' : 'guest'}</span>
              </div>
            ))}
          </div>
        )}
        {net.status === 'offline' && host && (
          <button
            className="btn w-full py-2 text-lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await openFarm();
              setBusy(false);
            }}
          >
            {busy ? 'Opening the gate…' : 'Open my farm to friends'}
          </button>
        )}
        {net.status === 'offline' && (
          <div className="space-y-2">
            <p className="font-display text-sm font-semibold">Visit a friend</p>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="CODE"
                className="w-full rounded-xl border-3 border-ink bg-white px-3 py-1.5 font-display text-xl tracking-[0.3em] outline-none"
              />
              <button
                className="btn btn--teal px-4"
                disabled={code.length !== 6 || busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await joinFarm(code);
                  setBusy(false);
                  if (ok) useSession.getState().closePanel();
                }}
              >
                Join
              </button>
            </div>
            <p className="text-xs font-semibold text-ink-soft">As a guest you water, harvest, plant from their storage and feed animals. Your gold and bag stay your own.</p>
          </div>
        )}
        {net.status === 'connecting' && <p className="text-center font-display font-semibold">Knocking on the gate…</p>}
        {net.status === 'hosting' && (
          <button className="btn btn--ghost w-full" onClick={closeFarm}>
            Close my farm to visitors
          </button>
        )}
        {net.status === 'visiting' && (
          <button className="btn btn--ghost w-full" onClick={leaveVisit}>
            Head home
          </button>
        )}
      </div>
      <div className="border-t-3 border-ink px-5 py-3 text-right">
        <button className="btn btn--ghost" onClick={close}>
          Close <span className="key">C</span>
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export function AccountPanel() {
  const close = useClose();
  const arg = useSession((s) => s.panelArg);
  const account = getAccount();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Modal onBackdrop={close} width="max-w-md">
      <Header kicker="YOUR ACCOUNT" title={account?.email ?? (cloudEnabled ? 'A guest account' : 'Saved on this browser')} tone="bg-sun" />
      <div className="space-y-3 px-5 py-4">
        {!cloudEnabled && (
          <p className="text-sm font-semibold text-ink-soft">
            This server has no cloud saves configured, so your farm lives in this browser only. Clearing site data would lose it.
          </p>
        )}
        {cloudEnabled && account?.anonymous && (
          <>
            <p className="text-sm font-semibold">
              {arg === 'nudge-host'
                ? 'You’re hosting friends now — attach an email so this farm is safe even if this browser is cleared.'
                : arg === 'nudge'
                  ? 'Had fun? Attach an email to keep your character, gold and bag across devices.'
                  : 'Your account lives in this browser until you attach an email.'}
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border-3 border-ink bg-white px-3 py-1.5 font-bold outline-none"
              />
              <button
                className="btn px-4"
                disabled={!email.includes('@')}
                onClick={async () => {
                  const err = await attachEmail(email.trim());
                  setMsg(err ?? 'Check your inbox for a confirmation link.');
                }}
              >
                Attach
              </button>
            </div>
            {msg && <p className="text-sm font-bold text-teal">{msg}</p>}
          </>
        )}
        {cloudEnabled && account && !account.anonymous && <p className="text-sm font-semibold">Your farm and profile are saved to your account.</p>}
      </div>
      <div className="border-t-3 border-ink px-5 py-3 text-right">
        <button className="btn btn--ghost" onClick={close}>
          {arg?.startsWith('nudge') ? 'Maybe later' : 'Close'}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Help and pause                                                      */
/* ------------------------------------------------------------------ */

const CONTROLS: [string, string][] = [
  ['WASD / Arrows', 'Walk (Shift to run)'],
  ['E', 'Talk, shop, open, sleep, pet'],
  ['F / Click', 'Use the tool in hand on the tile you face'],
  ['1 – 9', 'Pick a tool or seeds'],
  ['B', 'Build mode (your farm)'],
  ['R · X · Ctrl+Z', 'Rotate · pick up · undo (build mode)'],
  ['I / Tab', 'Your bag'],
  ['C', 'Play together'],
  ['T / Enter', 'Chat'],
  ['Scroll', 'Zoom'],
  ['Esc', 'Close / pause'],
];

export function HelpPanel() {
  const close = useClose();
  return (
    <Modal onBackdrop={close}>
      <Header kicker="HOW TO PLAY" title="A day on the farm" />
      <div className="space-y-3 overflow-y-auto px-5 py-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm font-semibold">
          <li>Till soil with the hoe, plant seeds, water them. Watered crops grow overnight.</li>
          <li>The axe fells trees on your farm (big ones take a few chops) for wood and their seeds. Plant a tree seed on grass and it grows by itself, night by night.</li>
          <li>Harvest when ripe, drop it in the shipping bin — it pays the next morning.</li>
          <li>Buy seeds at Rosa’s General Store, building kit and land from Bram the carpenter.</li>
          <li>Press B on your farm to build and style your villa and yard.</li>
          <li>Sleep in your bed to end the day. Nothing wilts, nothing is lost.</li>
        </ol>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="contents">
              <span className="key justify-self-start">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t-3 border-ink px-5 py-3 text-right">
        <button className="btn btn--ghost" onClick={close}>
          Close <span className="key">H</span>
        </button>
      </div>
    </Modal>
  );
}

type PauseView = 'menu' | 'options' | 'confirm-quit';

export function PausePanel() {
  const close = useClose();
  const [view, setView] = useState<PauseView>('menu');
  const farm = useFarmState();
  const show = (next: PauseView) => {
    playSound(next === 'menu' ? 'close' : 'open');
    setView(next);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (view === 'menu') close();
      else if (view === 'confirm-quit') show('menu');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (view === 'options')
    return (
      <Modal bare>
        <OptionsPanel onBack={() => show('menu')} />
      </Modal>
    );
  return (
    <Modal width="max-w-xs" onBackdrop={view === 'menu' ? close : undefined}>
      <Header kicker="PAUSED" title={farm?.name ?? 'Meadowfolk'} />
      {view === 'menu' ? (
        <nav className="flex flex-col gap-3 px-5 py-5" aria-label="Pause menu">
          <button className="btn py-2 text-xl" onClick={close} autoFocus>
            Resume
          </button>
          <button className="btn btn--ghost py-2 text-lg" onClick={() => show('options')}>
            Options
          </button>
          <button className="btn btn--ghost py-2 text-lg" onClick={() => useSession.getState().openPanel('account')}>
            Account
          </button>
          <button className="btn btn--ghost py-2 text-lg" onClick={() => show('confirm-quit')}>
            Main Menu
          </button>
        </nav>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-5 text-center">
          <p className="font-display text-lg font-semibold">Save and return to the main menu?</p>
          <p className="-mt-2 text-sm font-semibold text-ink-soft">Your farm is saved as it is now. With friends here, the session ends.</p>
          <button className="btn py-2 text-lg" onClick={() => void leaveToTitle()}>
            Save &amp; quit
          </button>
          <button className="btn btn--ghost text-base" onClick={() => show('menu')}>
            Cancel
          </button>
        </div>
      )}
    </Modal>
  );
}

