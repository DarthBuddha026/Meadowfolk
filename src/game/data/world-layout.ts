import type { Vec3 } from './types';

/**
 * Spatial layout of the world — every position gameplay and the scene both need lives here, so the
 * two can never drift apart. One connected diorama: the town on the island round the origin, the
 * river, and past the ridge (z ≈ −21) the north bank, where the farm grid lies (see
 * `src/game/sim/farm-map.ts`). North is −z.
 */

/** Walkable land: x from −west to east, z from −north to south (the beach's waterline). */
export const WORLD_BOUNDS = { west: 24, east: 76, north: 40, south: 33.2 };

/** Where the character-setup preview stands (the plaza). */
export const PLAYER_SPAWN: Vec3 = [1.6, 0, 4];

/** The carpenter's workshop, east of the plaza (door faces +z). */
export const CARPENTER_HOUSE = {
  x: 12,
  z: -7,
  w: 7,
  d: 5,
  wall: '#f3e7d2',
  roof: '#d9674a',
};

/** An empty lawn south-west of the plaza, kept clear of props (room for the market stall later). */
export const GREEN_LOT = { x: -10.5, z: 5.95, w: 6.2, d: 5.7 };

/**
 * The two shops of the first slice: where you stand to shop (`counter`), and where the shopkeeper
 * stands (`keeper`, facing `face` radians; 0 faces +z).
 */
export const SHOP_SPOTS: Record<string, { counter: [number, number]; keeper: [number, number]; face: number; model: string; tag: string }> = {
  // Rosa's General Store: the ground floor of the two-storey house north-west of the plaza.
  store: { counter: [-13.5, -2.5], keeper: [-15.3, -3.05], face: 0.35, model: '/models/villager-baker.glb', tag: 'Rosa · General Store' },
  // Bram the carpenter, at his workshop door.
  carpenter: { counter: [12, -3.4], keeper: [13.9, -3.9], face: -0.4, model: '/models/villager-neighbour.glb', tag: 'Bram · Carpenter' },
};

/**
 * Inside the shops: rooms of their own off the map (past the east edge, beyond the house's rooms),
 * like the house's — you go in through the shop's door (where `SHOP_SPOTS.counter` is) and
 * shop at the counter inside, with the keeper behind it. Centre, width (x) and depth (z); the door
 * is in the middle of the south (+z) wall, the counter runs across the room near the back.
 */
export const SHOP_ROOMS: Record<string, { cx: number; cz: number; w: number; d: number }> = {
  store: { cx: 200, cz: -30, w: 10, d: 7 },
  carpenter: { cx: 220, cz: -30, w: 9, d: 7 },
};

/** A shop room's walls and the spots in it. */
export function shopRoom(id: string) {
  const r = SHOP_ROOMS[id];
  const x0 = r.cx - r.w / 2;
  const x1 = r.cx + r.w / 2;
  const z0 = r.cz - r.d / 2;
  const z1 = r.cz + r.d / 2;
  return {
    ...r,
    x0,
    x1,
    z0,
    z1,
    /** Where you appear coming in, and where you stand to go back out. */
    arrive: [r.cx, z1 - 2.2] as [number, number],
    exit: [r.cx, z1 - 0.9] as [number, number],
    /** The counter's front edge line, where you stand to shop, and where the keeper stands. */
    counterZ: z0 + 2.4,
    shopAt: [r.cx, z0 + 3.5] as [number, number],
    keeper: [r.cx, z0 + 1.45] as [number, number],
  };
}

export interface CameraShot {
  camera: Vec3;
  lookAt: Vec3;
}

export const SHOTS: Record<string, CameraShot> = {
  setup: { camera: [0.2, 1.25, 7.2], lookAt: [0.2, 0.75, 4] },
};

/**
 * Old keep-clear spots south of the ridge. Kept so the town's scattered trees and flowers stay
 * exactly where they always were.
 */
export const LEGACY_CLEAR: Vec3[] = [
  [-8.6, 0, 11.6],
  [3.4, 0, -4.2],
  [13.1, 0, 15.6],
  [-19.5, 0, -2.4],
  [12, 0, -3.75],
];
