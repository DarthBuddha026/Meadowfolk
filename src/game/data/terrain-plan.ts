import { CARPENTER_HOUSE, GREEN_LOT, LEGACY_CLEAR } from './world-layout';

/**
 * Authored terrain plan. The engine turns this into smooth clay-like geometry
 * (see `src/game/engine/terrain.ts`).
 *
 * The map, west to east and north to south (−z is north):
 *
 *   FARM            | FOREST with the statue in the middle
 *   river ──────────┐ (the river turns south here)
 *   TOWN            │ TOWN HALL with the playground, and forest at the back
 *   BEACH           │ BEACH
 *   OCEAN ──────────┴──────────
 *
 * The town sits round the origin. Past the river, the old north rim is a ridge (`RIDGE`) with a
 * cutting for the north road, and beyond it lies the north bank: the farm (its grid is `GRID` in
 * src/game/sim/farm-map.ts), which opens east into the forest. The river runs east along the
 * town's north edge, then turns south at x ≈ 27 down to the ocean, between the town and the east
 * side; bridges cross it to the town hall and between the beaches. Append to these lists; don't insert.
 */

export type Pt = [number, number]; // [x, z]

export const TERRAIN = {
  /** Full extent of the land drawn (−west … east, −north … south, the ocean past the beach). */
  extent: { west: 26, east: 78, south: 40, north: 42 },
  /** Raised rim starts here on the west, east and north (walkable area is inside); the south is the beach. */
  rimInner: { west: 24, east: 76, north: 40 },
  /** The beach: sand from about z = `from` (a gentle wave) down to the waterline near z = `shore`. */
  beach: { from: 20.5, shore: 34 },
  cell: 0.5,
  river: {
    points: [
      [-28, -13],
      [-16, -14.5],
      [-6, -12.5],
      [4, -15],
      [14, -14],
      // …then it turns south, between the town and the east side, down to the ocean.
      [21.5, -15],
      [25.6, -12.6],
      [27.2, -5],
      [26.8, 6],
      [27.4, 16],
      [27, 26],
      [27, 44],
    ] as Pt[],
    halfWidth: 1.7,
  },
  plaza: { center: [0, 0] as Pt, radius: 6 },
  paths: [
    // To the carpenter's door, then on east past the cottages
    { points: [[0, 0], [6, -1.6], [12, -3.3]] as Pt[], halfWidth: 1.1 },
    { points: [[6, -1.6], [14.6, -0.9]] as Pt[], halfWidth: 1.05 },
    // Main road south, with the branch west along the fields
    { points: [[0, 0], [0, 18.6]] as Pt[], halfWidth: 1.15 },
    { points: [[0, 10.5], [-16.6, 10.5]] as Pt[], halfWidth: 1.1 },
    // West, past the General Store
    { points: [[0, 0], [-23.8, 0]] as Pt[], halfWidth: 1.1 },
    // North over the bridge, toward the farm
    { points: [[0, 0], [-3, -7], [-4, -11]] as Pt[], halfWidth: 1.1 },
    { points: [[-4, -15.2], [-4, -19.8]] as Pt[], halfWidth: 1.1 },
    // On through the ridge's cutting to the farm gate (the farm's own paths are kit pieces).
    { points: [[-4, -19.8], [-4, -23.3]] as Pt[], halfWidth: 1.1 },
    // East between the cottages to the bridge over the river, and on to the town hall.
    { points: [[14.6, -0.9], [16.6, 3.7], [24.2, 3.7]] as Pt[], halfWidth: 1.05 },
    { points: [[29.8, 3.7], [40, 3.7], [48.6, 1]] as Pt[], halfWidth: 1.1 },
    // The town hall's forecourt, and the sandy playground south-west of it.
    { points: [[45.6, 1], [48.6, 1]] as Pt[], halfWidth: 2.6 },
    { points: [[40, 3.7], [42.4, 8.6]] as Pt[], halfWidth: 1 },
    { points: [[44, 12.2], [44.01, 12.2]] as Pt[], halfWidth: 4.2 },
    // North into the forest, to the clearing with the statue.
    { points: [[40, 3.7], [42, -8], [48.6, -22.6]] as Pt[], halfWidth: 1.05 },
    { points: [[52, -27], [52.01, -27]] as Pt[], halfWidth: 5 },
    // From the farm's east edge into the forest.
    { points: [[23.2, -31], [36, -29.6], [47, -27.6]] as Pt[], halfWidth: 1.05 },
    // Down to the beaches.
    { points: [[0, 18.6], [0, 22]] as Pt[], halfWidth: 1.15 },
    { points: [[44, 16.4], [43, 22]] as Pt[], halfWidth: 1 },
  ],
  bridges: [
    { center: [-4, -13.1] as Pt, length: 5.4, width: 2.3, rotation: 0 },
    // Over the south-flowing river: to the town hall, and between the two beaches.
    { center: [27, 3.7] as Pt, length: 6, width: 2.3, rotation: Math.PI / 2 },
    { center: [27, 27.5] as Pt, length: 6, width: 2.3, rotation: Math.PI / 2 },
  ],
  pond: { center: [9.5, 7.5] as Pt, radius: 3 },
  /** Stepping-stone walkways from the roads to the houses' doors. */
  walkways: [
    [[15.7, -0.9], [18.6, -0.8]],
    [[1.4, 12.8], [17.6, 12.8], [17.6, 14.2]],
    [[8.5, 12.8], [8.5, 14.2]],
    [[17.6, 12.8], [17.6, 8.2], [18.6, 8.2]],
    [[-13.5, -1.3], [-13.5, -3.3]],
  ] as Pt[][],
};

/**
 * The old north rim, kept as a ridge between the river and the farm (z from −22 to −20), with a
 * cutting `cut.half` either side of `cut.x` where the north road passes through.
 */
export const RIDGE = { z: [-22, -20] as [number, number], cut: { x: -4, half: 1.5 }, east: 24 };

/** A neighbour's field south of the field road: crop rows with a scarecrow in the middle (scenery). */
export const FARM = { x: -11.9, z: 16, w: 19, d: 5.4 };

/** Red tractor parked on the lawn west of the main road (front faces +x rotated by `rot`). */
export const TRACTOR = { x: -4.6, z: 6.4, rot: -0.55 };

/** Fruit stand against the General Store's right shop window (front faces +z, toward the road). */
export const FRUIT_STAND = { x: -11.6, z: -3.15 };

export interface HousePlan {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Door faces +z rotated by this angle. */
  rot: number;
  wall: string;
  roof: string;
  /** 2 = a second floor. */
  storeys?: number;
  /** Shop sign over a ground-floor shopfront. */
  shop?: string;
}

export const HOUSES: HousePlan[] = [
  // Two-storey house with Rosa's General Store below, northwest of the plaza
  { x: -13.5, z: -6, w: 7, d: 4.6, rot: 0, wall: '#f4e6cf', roof: '#d9674a', storeys: 2, shop: 'GENERAL STORE' },
  // A cottage east of the carpenter's (door faces west)
  { x: 20.6, z: -0.8, w: 4.4, d: 3.4, rot: -Math.PI / 2, wall: '#f5dfe1', roof: '#5c9a5a' },
  // A cottage at the end of the field road (door faces east)
  { x: -19.4, z: 10.5, w: 4.4, d: 3.4, rot: Math.PI / 2, wall: '#fbeccd', roof: '#c9734a' },
  // Neighbours: east of the pond (door west), and two along the south edge (doors north)
  { x: 20.6, z: 8.2, w: 4.4, d: 3.4, rot: -Math.PI / 2, wall: '#f1e9dc', roof: '#4f86b8' },
  { x: 8.5, z: 16.2, w: 4.4, d: 3.4, rot: Math.PI, wall: '#f6e2d0', roof: '#7a62ad' },
  { x: 17.6, z: 16.2, w: 4.4, d: 3.4, rot: Math.PI, wall: '#efe7d6', roof: '#d9674a' },
  // Across the river: the town hall, its door facing west toward the bridge (see TOWN_HALL).
  { x: 53, z: 1, w: 8, d: 6, rot: -Math.PI / 2, wall: '#f4ead8', roof: '#4f86b8', storeys: 2 },
];

/** The town hall (the last of HOUSES): its sign, clock tower and flag are drawn in east-side.tsx. */
export const TOWN_HALL = { x: 53, z: 1, w: 8, d: 6, rot: -Math.PI / 2 };

/** The playground south-west of the town hall: swings, a slide, a seesaw, a roundabout and a sandpit. */
export const PLAYGROUND = { x: 44, z: 12.2 };

/** The statue in the clearing in the middle of the north-east forest. */
export const STATUE = { x: 52, z: -27 };

/** Where the woods grow thick: round the statue in the north-east, and behind the town hall. */
export const FORESTS: { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: 24.5, x1: 76, z0: -40, z1: -11 },
  { x0: 61, x1: 76, z0: -11, z1: 19 },
];

export const LANDMARKS = {
  /** The fountain in the middle of the plaza. */
  fountain: [0, -1] as Pt,
};

/** Park benches around the plaza: position and facing (seat faces +z rotated by `rot`, i.e. toward the plaza's centre). */
export const BENCHES: { x: number; z: number; rot: number }[] = [
  [-3.6, -3.8],
  [1.5, -5.2],
  [-4.2, 3.4],
  [4.4, 3.6],
].map(([x, z]) => ({ x, z, rot: Math.atan2(-x, -z) }));

/**
 * Direction signposts beside the paths (board faces +z rotated by `rot`, so ~0 reads
 * well from the follow camera). Scattered trees, hedges and lanterns keep clear of them.
 */
export const SIGNPOSTS: { x: number; z: number; rot: number; text: string }[] = [
  { x: 7.2, z: -3.5, rot: -0.25, text: 'CARPENTER' },
  { x: -7.2, z: 1.7, rot: 0.12, text: 'STORE' },
  { x: -1.3, z: -7.6, rot: 0.2, text: 'FARM' },
  { x: -2.6, z: 8.3, rot: 0, text: 'FIELDS' },
  { x: 23.4, z: 1.6, rot: 0, text: 'TOWN HALL' },
  { x: 24.4, z: -32.8, rot: 0.15, text: 'FOREST' },
  { x: 2.2, z: 19.4, rot: 0, text: 'BEACH' },
];

/** Keep-clear zones for scattered props: [x, z, radius]. */
export const CLEAR_ZONES: [number, number, number][] = [
  [0, 0, 7],
  [CARPENTER_HOUSE.x, CARPENTER_HOUSE.z, 5.4],
  [TERRAIN.pond.center[0], TERRAIN.pond.center[1], TERRAIN.pond.radius + 1.3],
  [1.6, 4, 2.5],
  [TRACTOR.x, TRACTOR.z, 2],
  [FRUIT_STAND.x, FRUIT_STAND.z, 1.5],
  // The empty lot, and the lawn south of it
  [GREEN_LOT.x, GREEN_LOT.z + 0.8, 4.8],
  [-9.9, 14.4, 2.6],
  ...LEGACY_CLEAR.map(([x, , z]) => [x, z, 3.2] as [number, number, number]),
  // The road up to the ridge's cutting.
  [-4, -18.5, 3.2],
  // East of the river: the town hall, the playground, and the statue's clearing.
  [53, 1, 7],
  [44, 12.2, 5.6],
  [52, -27, 6.5],
];
