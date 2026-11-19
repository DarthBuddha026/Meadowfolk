/**
 * Meadowfolk farm simulation — data types.
 *
 * Pure TypeScript: no React, no three.js, no browser APIs. The host's browser runs the sim; guests
 * keep a read-only replica fed the same accepted intents, so it must stay deterministic.
 */

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type Quality = 'normal' | 'good' | 'great';

/** A player's id: their account id (Supabase user id, or a local id when offline). */
export type PlayerId = string;

/** An inventory / storage key: an item id, with `@good` / `@great` appended for quality. */
export type ItemKey = string;
export type Bag = Record<ItemKey, number>;

export interface Crop {
  id: string;
  /** Days of growth so far (advances overnight when watered). */
  growth: number;
  /** Nights it went unwatered while growing (spoils "great" quality). */
  missed: number;
  /** Times harvested (regrowing crops). */
  harvests: number;
}

export interface Tile {
  tilled: boolean;
  watered: boolean;
  fertilized: boolean;
  crop: Crop | null;
}

/**
 * A tree on the farm, on one tile. It grows from a seed through stages (0 seed, 1 sprout,
 * 2 sapling, 3 young, 4 grown) one step every few nights, by itself. The axe takes a few chops
 * (`hits`, reset overnight) to bring a big one down.
 */
export interface Tree {
  id: number;
  kind: string;
  c: number;
  r: number;
  stage: number;
  /** Nights grown at this stage. */
  growth: number;
  hits: number;
  /** Fruit hanging on a grown fruit tree; unset, it bears a full crop. */
  fruit?: number;
  /** Nights since it was picked bare. */
  fruitNights?: number;
}

/** Every placed thing on the farm, villa pieces included: one schema. */
export interface Placement {
  id: number;
  piece: string;
  c: number;
  r: number;
  /** 90° steps, 0–3. For edge pieces (walls, fences): 0 north edge, 1 east, 2 south, 3 west. */
  rot: number;
  /** Index into the clay palette. */
  color: number;
  storey: number;
}

export interface Animal {
  id: number;
  kind: string;
  name: string;
  /** The coop (placement id) it lives in. */
  home: number;
  happiness: number;
  fed: boolean;
  petted: boolean;
}

/** What a guest did today, for the host's thank-you summary. */
export interface HelpStats {
  name: string;
  watered: number;
  planted: number;
  harvested: number;
  fed: number;
  petted: number;
  shipped: number;
}

export interface FarmState {
  /** Save schema version. */
  version: number;
  /** The host's player id. Only the owner may build, buy villa tiers, spend or end the day. */
  owner: PlayerId;
  ownerName: string;
  name: string;
  year: number;
  season: Season;
  /** 1–28. */
  day: number;
  /** In-game minutes since 6:00 (0 … 1200 = 2:00). Advanced by the host's clock, not by intents. */
  minute: number;
  /** Row-major, `cols × rows` (see farm-map.ts). */
  tiles: Tile[];
  placements: Placement[];
  nextId: number;
  animals: Animal[];
  /** Eggs etc. waiting in each coop: coop placement id → items. */
  produce: Record<number, Bag>;
  /** The farm's shared storage chest(s). */
  storage: Bag;
  /** Shipping bin contents, paid out overnight. */
  bin: Bag;
  villaTier: number;
  /** Clay palette index of the villa's roof. */
  roofColor: number;
  /** Today's guest help, keyed by player id. */
  help: Record<PlayerId, HelpStats>;
  /** Trees standing on the farm (the orchard's old apple trees, wild ones, and those you plant). */
  trees: Tree[];
  /** What last night's shipping paid, for the morning summary. */
  lastPayout: { gold: number; items: Bag } | null;
}

/** Where an item an intent uses comes from: the acting player's own bag, or the farm's storage. */
export type Source = 'self' | 'storage';

export type Intent =
  | { t: 'till'; c: number; r: number }
  | { t: 'chop'; c: number; r: number }
  | { t: 'water'; c: number; r: number }
  | { t: 'plant'; c: number; r: number; seed: string; from: Source }
  | { t: 'fertilize'; c: number; r: number; from: Source }
  | { t: 'harvest'; c: number; r: number }
  | { t: 'pick'; c: number; r: number }
  /** DEV tools (the director only sends these for the DEV account): grow everything planted; ripen fruit. */
  | { t: 'devGrow' }
  | { t: 'devFruit' }
  | { t: 'clear'; c: number; r: number }
  | { t: 'ship'; item: ItemKey; n: number }
  | { t: 'deposit'; item: ItemKey; n: number }
  | { t: 'withdraw'; item: ItemKey; n: number }
  | { t: 'feed'; coop: number; from: Source }
  | { t: 'collect'; coop: number }
  | { t: 'pet'; animal: number }
  | { t: 'place'; piece: string; c: number; r: number; rot: number; color: number }
  | { t: 'remove'; id: number }
  | { t: 'recolor'; id: number; color: number }
  | { t: 'roof'; color: number }
  | { t: 'buyTier'; tier: number }
  | { t: 'buyAnimal'; kind: string; coop: number; name: string }
  | { t: 'tip'; to: PlayerId; items: Bag; gold: number }
  | { t: 'endDay' };

/**
 * Side effects on a player's own profile (gold, personal bag). Every client applies only the
 * effects addressed to itself; the farm state itself is changed by the sim.
 */
export type Effect =
  | { e: 'take'; who: PlayerId; item: ItemKey; n: number }
  | { e: 'give'; who: PlayerId; item: ItemKey; n: number }
  | { e: 'gold'; who: PlayerId; n: number };

export interface Actor {
  id: PlayerId;
  name: string;
}

export type ApplyResult = { ok: true; effects: Effect[]; note?: string } | { ok: false; reason: string };
