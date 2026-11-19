import type { ItemKey, Quality, Season } from './types';

/**
 * Meadowfolk content tables: crops, items, kit pieces, animals, shops and villa tiers.
 * Data only. (The whole farm is yours from the start; there is no land to buy.)
 */

export const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
/** The first public slice plays Spring only: after day 28 it is Spring again, next year. */
export const SLICE_SEASONS: Season[] = ['spring'];
export const DAYS_PER_SEASON = 28;

/** A day: 6:00 → 2:00 is 1200 in-game minutes over this many real seconds. */
export const DAY_REAL_SECONDS = 15 * 60;
export const DAY_MINUTES = 1200;
export const START_GOLD = 500;

export interface CropDef {
  id: string;
  name: string;
  seed: string;
  /** Days of watered growth until ripe. */
  days: number;
  /** Regrowing crops ripen again this many days after a harvest. */
  regrow?: number;
  seasons: Season[];
  /** Clay colours: leaves, and the ripe produce. */
  leaf: string;
  fruit: string;
  /** How the ripe crop looks: a root showing at the soil, a bush with berries, or a vine on a stake. */
  shape: 'root' | 'bush' | 'vine';
}

export const CROPS: Record<string, CropDef> = {
  turnip: { id: 'turnip', name: 'Turnip', seed: 'seed-turnip', days: 4, seasons: ['spring'], leaf: '#6fae4f', fruit: '#f1e3ee', shape: 'root' },
  potato: { id: 'potato', name: 'Potato', seed: 'seed-potato', days: 6, seasons: ['spring'], leaf: '#5f9a48', fruit: '#c79a5b', shape: 'root' },
  strawberry: { id: 'strawberry', name: 'Strawberry', seed: 'seed-strawberry', days: 8, regrow: 4, seasons: ['spring'], leaf: '#4f9446', fruit: '#e2463f', shape: 'bush' },
  peas: { id: 'peas', name: 'Snap Peas', seed: 'seed-peas', days: 6, regrow: 2, seasons: ['spring'], leaf: '#78b956', fruit: '#9bd36a', shape: 'vine' },
};

export type ItemKind = 'seed' | 'produce' | 'supply' | 'kit' | 'material';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;
  /** Base price the shipping bin pays (0: can't be shipped). */
  sell: number;
  /** What a shop asks for it (0: not sold). */
  buy: number;
  /** For seeds: the crop they grow. For kit items: the piece they place. */
  crop?: string;
  piece?: string;
  /** For tree seeds: the tree they grow. */
  tree?: string;
}

const ITEM_LIST: ItemDef[] = [
  { id: 'seed-turnip', name: 'Turnip Seeds', kind: 'seed', icon: '🌱', sell: 10, buy: 20, crop: 'turnip' },
  { id: 'seed-potato', name: 'Potato Seeds', kind: 'seed', icon: '🌱', sell: 25, buy: 50, crop: 'potato' },
  { id: 'seed-strawberry', name: 'Strawberry Seeds', kind: 'seed', icon: '🌱', sell: 50, buy: 100, crop: 'strawberry' },
  { id: 'seed-peas', name: 'Snap Pea Seeds', kind: 'seed', icon: '🌱', sell: 20, buy: 40, crop: 'peas' },
  { id: 'turnip', name: 'Turnip', kind: 'produce', icon: '🧅', sell: 60, buy: 0 },
  { id: 'potato', name: 'Potato', kind: 'produce', icon: '🥔', sell: 140, buy: 0 },
  { id: 'strawberry', name: 'Strawberry', kind: 'produce', icon: '🍓', sell: 110, buy: 0 },
  { id: 'peas', name: 'Snap Peas', kind: 'produce', icon: '🫛', sell: 45, buy: 0 },
  { id: 'egg', name: 'Egg', kind: 'produce', icon: '🥚', sell: 50, buy: 0 },
  // Trees: what the axe brings, and the seeds they grow from.
  { id: 'wood', name: 'Wood', kind: 'material', icon: '🪵', sell: 8, buy: 0 },
  { id: 'apple-wood', name: 'Apple Wood', kind: 'material', icon: '🪵', sell: 14, buy: 0 },
  { id: 'apple', name: 'Apple', kind: 'produce', icon: '🍎', sell: 40, buy: 0 },
  { id: 'seed-apple', name: 'Apple Seed', kind: 'seed', icon: '🫘', sell: 30, buy: 120, tree: 'apple' },
  { id: 'acorn', name: 'Acorn', kind: 'seed', icon: '🌰', sell: 15, buy: 60, tree: 'oak' },
  { id: 'pinecone', name: 'Pine Cone', kind: 'seed', icon: '🌲', sell: 15, buy: 60, tree: 'pine' },
  { id: 'fertilizer', name: 'Fertilizer', kind: 'supply', icon: '🧺', sell: 0, buy: 25 },
  { id: 'feed', name: 'Chicken Feed', kind: 'supply', icon: '🌾', sell: 0, buy: 10 },
];

/* ------------------------------------------------------------------ */
/* The modular clay kit                                                */
/* ------------------------------------------------------------------ */

export type PieceLayer = 'floor' | 'edge' | 'object';

export interface PieceDef {
  id: string;
  name: string;
  layer: PieceLayer;
  /** Villa structure: only inside the villa footprint (the tier's limit). */
  villa?: boolean;
  /** Must stand inside the villa footprint (furniture like the bed). */
  indoor?: boolean;
  /** Only outdoors on the farm (not inside the house). */
  outdoor?: boolean;
  /** Footprint in tiles at rot 0 [cols, rows] (objects only). */
  size?: [number, number];
  /** Blocks walking (gets a collider). */
  solid?: boolean;
  /** Carpenter price (0: not sold). */
  buy: number;
  /** The villa tier that unlocks it. */
  tier: number;
  /** Default palette colour. */
  color: number;
  /** What using it does. */
  use?: 'sleep' | 'storage' | 'ship' | 'coop';
}

export const PIECES: Record<string, PieceDef> = {
  floor: { id: 'floor', name: 'Wood Floor', layer: 'floor', villa: true, buy: 15, tier: 1, color: 10 },
  wall: { id: 'wall', name: 'Wall', layer: 'edge', villa: true, solid: true, buy: 40, tier: 1, color: 0 },
  'wall-window': { id: 'wall-window', name: 'Window Wall', layer: 'edge', villa: true, solid: true, buy: 60, tier: 1, color: 0 },
  'wall-door': { id: 'wall-door', name: 'Door Wall', layer: 'edge', villa: true, solid: true, buy: 80, tier: 1, color: 0 },
  path: { id: 'path', name: 'Pebble Path', layer: 'floor', buy: 5, tier: 1, color: 9, outdoor: true },
  fence: { id: 'fence', name: 'Fence', layer: 'edge', solid: true, buy: 10, tier: 1, color: 7, outdoor: true },
  // A gate in a fence: people walk through (it swings open), animals don't.
  'fence-gate': { id: 'fence-gate', name: 'Gate', layer: 'edge', buy: 30, tier: 1, color: 7, outdoor: true },
  lantern: { id: 'lantern', name: 'Lantern', layer: 'object', solid: true, buy: 30, tier: 1, color: 8, outdoor: true },
  'flower-pot': { id: 'flower-pot', name: 'Flower Pot', layer: 'object', solid: true, buy: 20, tier: 1, color: 1 },
  bench: { id: 'bench', name: 'Bench', layer: 'object', solid: true, buy: 60, tier: 1, color: 7 },
  bed: { id: 'bed', name: 'Bed', layer: 'object', indoor: true, solid: true, buy: 200, tier: 1, color: 3, use: 'sleep' },
  chest: { id: 'chest', name: 'Storage Chest', layer: 'object', solid: true, buy: 100, tier: 1, color: 7, use: 'storage' },
  table: { id: 'table', name: 'Table', layer: 'object', solid: true, buy: 80, tier: 1, color: 7 },
  chair: { id: 'chair', name: 'Chair', layer: 'object', solid: true, buy: 40, tier: 1, color: 7 },
  rug: { id: 'rug', name: 'Rug', layer: 'object', buy: 50, tier: 1, color: 5 },
  plant: { id: 'plant', name: 'Potted Plant', layer: 'object', solid: true, buy: 30, tier: 1, color: 1 },
  // Home furniture (the starter house's kitchen, living room and bedroom). Modelled facing +z at rot 0.
  'kitchen-counter': { id: 'kitchen-counter', name: 'Kitchen Counter', layer: 'object', indoor: true, size: [4, 1], solid: true, buy: 220, tier: 1, color: 9 },
  fridge: { id: 'fridge', name: 'Fridge', layer: 'object', indoor: true, solid: true, buy: 150, tier: 1, color: 9 },
  stove: { id: 'stove', name: 'Stove', layer: 'object', indoor: true, solid: true, buy: 140, tier: 1, color: 0 },
  'dining-set': { id: 'dining-set', name: 'Dining Table with Chairs', layer: 'object', indoor: true, size: [3, 2], solid: true, buy: 220, tier: 1, color: 7 },
  'tv-stand': { id: 'tv-stand', name: 'TV Table', layer: 'object', indoor: true, size: [3, 1], solid: true, buy: 160, tier: 1, color: 7 },
  'coffee-table': { id: 'coffee-table', name: 'Coffee Table', layer: 'object', indoor: true, size: [2, 1], solid: true, buy: 70, tier: 1, color: 7 },
  sofa: { id: 'sofa', name: 'Sofa', layer: 'object', indoor: true, size: [3, 1], solid: true, buy: 200, tier: 1, color: 2 },
  wardrobe: { id: 'wardrobe', name: 'Cabinet', layer: 'object', indoor: true, size: [2, 1], solid: true, buy: 160, tier: 1, color: 7, use: 'storage' },
  'big-bed': { id: 'big-bed', name: 'Double Bed', layer: 'object', indoor: true, size: [2, 3], solid: true, buy: 350, tier: 1, color: 3, use: 'sleep' },
  'bedside-table': { id: 'bedside-table', name: 'Bedside Table', layer: 'object', indoor: true, solid: true, buy: 45, tier: 1, color: 7 },
  carpet: { id: 'carpet', name: 'Carpet', layer: 'object', indoor: true, size: [2, 1], buy: 90, tier: 1, color: 3 },
  desk: { id: 'desk', name: 'Study Table', layer: 'object', indoor: true, size: [2, 1], solid: true, buy: 110, tier: 1, color: 7 },
  'shipping-bin': { id: 'shipping-bin', name: 'Shipping Bin', layer: 'object', solid: true, buy: 0, tier: 1, color: 7, use: 'ship', outdoor: true },
  coop: { id: 'coop', name: 'Chicken Shed', layer: 'object', size: [2, 2], solid: true, buy: 900, tier: 1, color: 1, use: 'coop', outdoor: true },
  // Tier 2 kit: porch and garden.
  hedge: { id: 'hedge', name: 'Hedge', layer: 'object', solid: true, buy: 35, tier: 2, color: 2, outdoor: true },
  arch: { id: 'arch', name: 'Garden Arch', layer: 'object', buy: 120, tier: 2, color: 9, outdoor: true },
  // Tier 3: full decorative kit.
  fountain: { id: 'fountain', name: 'Fountain', layer: 'object', size: [2, 2], solid: true, buy: 600, tier: 3, color: 9, outdoor: true },
  pond: { id: 'pond', name: 'Pond', layer: 'object', size: [5, 4], solid: true, buy: 400, tier: 1, color: 9, outdoor: true },
};

/** Kit pieces are carried as items `kit:<piece>` (the starter ones nobody sells too, once picked up). */
export const kitItem = (piece: string) => 'kit:' + piece;
for (const p of Object.values(PIECES)) {
  ITEM_LIST.push({ id: kitItem(p.id), name: p.name, kind: 'kit', icon: '🧱', sell: 0, buy: p.buy, piece: p.id });
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));

/** The clay palette every piece is recoloured from. */
export const PALETTE = ['#f4e6cf', '#d9674a', '#8fb07a', '#7fb3d5', '#f2cf6b', '#e7a3a8', '#a99ad1', '#a8754d', '#4b4552', '#fbf6ee', '#e6c79a'];

// Index 10, light oak, is the house's plank floor.

/* ------------------------------------------------------------------ */
/* Trees                                                               */
/* ------------------------------------------------------------------ */

export interface TreeDef {
  id: string;
  name: string;
  /** The seed it grows from, and drops when felled. */
  seed: string;
  /** Wood and seeds a grown one drops. */
  wood: number;
  seeds: number;
  /** The wood it gives (plain wood unless it has its own). */
  woodItem?: string;
  /** Fruit a grown one bears: how many hang on it, and the nights they take to grow back once picked. */
  fruit?: { item: string; n: number; nights: number };
  /** Nights per growth stage (seed → sprout → sapling → young → grown). */
  nightsPerStage: number;
}

export const TREES: Record<string, TreeDef> = {
  apple: { id: 'apple', name: 'Apple Tree', seed: 'seed-apple', wood: 5, seeds: 2, woodItem: 'apple-wood', fruit: { item: 'apple', n: 3, nights: 3 }, nightsPerStage: 3 },
  oak: { id: 'oak', name: 'Oak', seed: 'acorn', wood: 8, seeds: 2, nightsPerStage: 2 },
  pine: { id: 'pine', name: 'Pine', seed: 'pinecone', wood: 6, seeds: 3, nightsPerStage: 2 },
};

export const TREE_GROWN = 4;
export const TREE_STAGES = ['Seed', 'Sprout', 'Sapling', 'Young tree', 'Grown'];
/** Chops it takes to bring one down, by stage. */
export const TREE_HITS = [1, 1, 1, 2, 3];

/* ------------------------------------------------------------------ */
/* Animals                                                             */
/* ------------------------------------------------------------------ */

export interface AnimalDef {
  id: string;
  name: string;
  price: number;
  /** The building it lives in, and how many fit. */
  home: string;
  capacity: number;
  product: string;
  feed: string;
}

export const ANIMALS: Record<string, AnimalDef> = {
  chicken: { id: 'chicken', name: 'Chicken', price: 400, home: 'coop', capacity: 4, product: 'egg', feed: 'feed' },
};

/* ------------------------------------------------------------------ */
/* Quality                                                             */
/* ------------------------------------------------------------------ */

export const QUALITY_MULT: Record<Quality, number> = { normal: 1, good: 1.25, great: 1.5 };

export function itemKey(id: string, q: Quality = 'normal'): ItemKey {
  return q === 'normal' ? id : `${id}@${q}`;
}

export function parseItem(key: ItemKey): { id: string; quality: Quality } {
  const [id, q] = key.split('@');
  return { id, quality: q === 'good' || q === 'great' ? q : 'normal' };
}

export function itemName(key: ItemKey): string {
  const { id, quality } = parseItem(key);
  const name = ITEMS[id]?.name ?? id;
  return quality === 'normal' ? name : `${name} (${quality === 'good' ? 'Good' : 'Great'})`;
}

export function itemIcon(key: ItemKey): string {
  return ITEMS[parseItem(key).id]?.icon ?? '📦';
}

/** What the shipping bin pays for one. */
export function sellPrice(key: ItemKey): number {
  const { id, quality } = parseItem(key);
  return Math.round((ITEMS[id]?.sell ?? 0) * QUALITY_MULT[quality]);
}

/* ------------------------------------------------------------------ */
/* Town                                                                */
/* ------------------------------------------------------------------ */

export interface ShopDef {
  id: string;
  name: string;
  keeper: string;
  /** Opening hours as in-game minutes since 6:00. */
  open: number;
  close: number;
  greeting: string;
  /** One seasonal line per season. */
  seasonal: Record<Season, string>;
  /** Nothing for sale: the counter is for a chat with the keeper (the tavern). */
  chat?: boolean;
}

export const SHOPS: Record<string, ShopDef> = {
  store: {
    id: 'store',
    name: 'General Store',
    keeper: 'Rosa',
    open: 180, // 9:00
    close: 660, // 17:00
    greeting: "Seeds, feed and fertilizer — and if it isn't on the shelf, I'll order it in.",
    seasonal: {
      spring: 'Turnips are quick, strawberries pay. Plant both and you never stand idle.',
      summer: 'Hot one today. Water early, before the sun gets cross.',
      fall: 'Harvest moon soon. Everyone gets a little sentimental.',
      winter: 'Quiet season. I knit behind the counter, if you were wondering.',
    },
  },
  carpenter: {
    id: 'carpenter',
    name: 'Carpenter',
    keeper: 'Bram',
    open: 180, // 9:00
    close: 600, // 16:00
    greeting: 'Walls, fences, coops, land. You dream it, I saw it.',
    seasonal: {
      spring: 'Spring is for porches. Mark my words.',
      summer: 'Wood swells in the heat. My joints are cut for it.',
      fall: 'Best time to build a barn is before you need one.',
      winter: 'Snow on a good roof just looks cosy.',
    },
  },
  // Not a shop: a place to sit by the fire. Gold is earned and spent elsewhere.
  tavern: {
    id: 'tavern',
    name: 'Tavern',
    keeper: 'Tess',
    open: 300, // 11:00
    close: 1200, // 2:00, when the day ends
    chat: true,
    greeting: 'Pull up a stool. The fire is free, and so is the gossip.',
    seasonal: {
      spring: 'The vines across the road are budding. Come autumn, this whole street smells of grapes.',
      summer: 'Long evenings, open windows. Half the town ends up out at the picnic tables.',
      fall: 'Harvest at the vineyard this month. Everyone helps, everyone sings, nobody sings well.',
      winter: 'Best seat in town is the one by the fire. I keep it warm for whoever comes in coldest.',
    },
  },
};

/** What each shop sells this season. */
export function shopStock(shop: string, season: Season, villaTier: number): string[] {
  if (shop === 'store') {
    const seeds = Object.values(CROPS)
      .filter((c) => c.seasons.includes(season))
      .map((c) => c.seed);
    return [...seeds, 'fertilizer', 'feed', ...Object.values(TREES).map((t) => t.seed)];
  }
  if (shop === 'carpenter') {
    return Object.values(PIECES)
      .filter((p) => p.buy > 0 && p.tier <= villaTier)
      .map((p) => kitItem(p.id));
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Villa tiers                                                         */
/* ------------------------------------------------------------------ */

export interface VillaTierDef {
  tier: number;
  name: string;
  price: number;
  /** Footprint on the grid: first column, first row, columns, rows. */
  c: number;
  r: number;
  w: number;
  h: number;
  storeys: number;
  unlocks: string;
  /** The house as it stands on the farm (its outside shell), on the farm grid. */
  ext: { c: number; r: number; w: number; h: number };
}

export const VILLA_TIERS: VillaTierDef[] = [
  // c/r/w/h is the inside: its own space off the map (from column HOUSE_AREA.c0), bigger than the
  // house looks from outside, like a building's interior in town. `ext` is the house on the farm
  // (row 0 stays clear behind it: the back door opens onto it).
  { tier: 1, name: 'Cottage', price: 0, c: 163, r: 1, w: 18, h: 9, storeys: 1, unlocks: 'Basic kit', ext: { c: 15, r: 1, w: 7, h: 5 } },
  { tier: 2, name: 'Farmhouse', price: 5000, c: 162, r: 1, w: 20, h: 10, storeys: 1, unlocks: 'A bigger house, porch and garden kit', ext: { c: 14, r: 1, w: 9, h: 6 } },
  { tier: 3, name: 'Villa', price: 15000, c: 162, r: 1, w: 22, h: 11, storeys: 1, unlocks: 'The largest house and the full decorative kit', ext: { c: 13, r: 1, w: 11, h: 7 } },
];

export function villaTier(tier: number): VillaTierDef {
  return VILLA_TIERS[Math.max(0, Math.min(VILLA_TIERS.length - 1, tier - 1))];
}
