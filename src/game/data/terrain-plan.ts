import { CLUBHOUSE_EXTERIOR, GREENHOUSE_EXTERIOR, SIGNAL_POSITIONS } from './world-layout';

/**
 * Authored terrain plan for Junction. The engine turns this into smooth
 * clay-like geometry (see `src/game/engine/terrain.ts`).
 *
 * The island reaches further north (−z) than south: past the river, the old north rim is now a
 * ridge (`RIDGE`) with a cutting for the north road, and beyond it lies the north bank, a hamlet
 * that opens once Mission 2's gem is earned (`isNorthBankOpen`; the barrier is `NORTH_GATE`).
 * Everything the north bank adds is appended to the lists below, never inserted: the engine keeps
 * the old island's prop scatter exactly where it was.
 */

export type Pt = [number, number]; // [x, z]

export const TERRAIN = {
  /** Full extent of the island including the raised rim: ±x, +z (south) and −north. */
  extent: { x: 26, z: 22, north: 42 },
  /** Raised rim starts here (walkable area is inside). */
  rimInner: { x: 24, z: 20, north: 40 },
  cell: 0.5,
  river: {
    points: [
      [-28, -13],
      [-16, -14.5],
      [-6, -12.5],
      [4, -15],
      [14, -14],
      [28, -16],
    ] as Pt[],
    halfWidth: 1.7,
  },
  plaza: { center: [0, 0] as Pt, radius: 6 },
  paths: [
    // To the Circuit Club door, then on toward Sarah's house
    { points: [[0, 0], [6, -1.6], [12, -3.3]] as Pt[], halfWidth: 1.1 },
    { points: [[6, -1.6], [14.6, -0.9]] as Pt[], halfWidth: 1.05 },
    // Main road south, with the branch west to Mika's house
    { points: [[0, 0], [0, 18.6]] as Pt[], halfWidth: 1.15 },
    { points: [[0, 10.5], [-16.6, 10.5]] as Pt[], halfWidth: 1.1 },
    // West, toward another map
    { points: [[0, 0], [-23.8, 0]] as Pt[], halfWidth: 1.1 },
    // North over the bridge, toward another map
    { points: [[0, 0], [-3, -7], [-4, -11]] as Pt[], halfWidth: 1.1 },
    { points: [[-4, -15.2], [-4, -19.8]] as Pt[], halfWidth: 1.1 },
    // North bank: on through the ridge's cutting to the hamlet, with a lane each way.
    { points: [[-4, -19.8], [-4, -27], [-4, -34.2]] as Pt[], halfWidth: 1.1 },
    { points: [[-4, -30], [12, -30]] as Pt[], halfWidth: 1.05 },
    { points: [[-4, -31], [-15, -33]] as Pt[], halfWidth: 1.05 },
  ],
  bridges: [{ center: [-4, -13.1] as Pt, length: 5.4, width: 2.3, rotation: 0 }],
  pond: { center: [9.5, 7.5] as Pt, radius: 3 },
  /** Stepping-stone walkways from the roads to the houses' doors. */
  walkways: [
    [[15.7, -0.9], [18.6, -0.8]],
    [[1.4, 12.8], [17.6, 12.8], [17.6, 14.2]],
    [[8.5, 12.8], [8.5, 14.2]],
    [[17.6, 12.8], [17.6, 8.2], [18.6, 8.2]],
    [[-13.5, -1.3], [-13.5, -3.3]],
    // North bank: to the cottage behind the east lane, and on to the watchtower.
    [[4.6, -31.1], [4.6, -32.3]],
    [[9.6, -31.1], [9.6, -35.7]],
  ] as Pt[][],
};

/**
 * The old north rim, kept as a ridge between the river and the north bank (z from −22 to −20), with a
 * cutting `cut.half` either side of `cut.x` where the north road passes through.
 */
export const RIDGE = { z: [-22, -20] as [number, number], cut: { x: -4, half: 1.5 } };

/** The road barrier in the ridge's cutting: closed until the north bank opens. */
export const NORTH_GATE = { x: -4, z: -21 };

/**
 * The north bank's watchtower, against the north rim (anywhere south of a road, its roof would come
 * between the follow camera and the hero), looking out over the hamlet to the river; and the well on its green.
 */
export const WATCHTOWER = { x: 9.6, z: -37.3 };
export const WELL = { x: -1.3, z: -27.9 };

/** The orchard west of the north road: `rows` × `cols` apple trees `gap` apart round this centre, alternate rows staggered. */
export const ORCHARD = { x: -14.4, z: -26.3, rows: 2, cols: 5, gap: 2.8 };

/** The wildflower meadow in the north bank's east corner: centre + radius. */
export const MEADOW = { x: 16.6, z: -36, r: 4.4 };

/** The farm south of Mika's road: crop rows with a scarecrow in the middle. */
export const FARM = { x: -11.9, z: 16, w: 19, d: 5.4 };

/** Red tractor parked on the lawn between the greenhouse and the main road (front faces +x rotated by `rot`). */
export const TRACTOR = { x: -4.6, z: 6.4, rot: -0.55 };

/** Fruit stand against the grocery's right shop window (front faces +z, toward the road). */
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
  // Two-storey house with the grocery store below, northwest of the plaza
  { x: -13.5, z: -6, w: 7, d: 4.6, rot: 0, wall: '#f4e6cf', roof: '#d9674a', storeys: 2, shop: 'GROCERY' },
  // Sarah's house, east of the Circuit Club (door faces west)
  { x: 20.6, z: -0.8, w: 4.4, d: 3.4, rot: -Math.PI / 2, wall: '#f5dfe1', roof: '#5c9a5a' },
  // Mika's house, at the end of her road (door faces east)
  { x: -19.4, z: 10.5, w: 4.4, d: 3.4, rot: Math.PI / 2, wall: '#fbeccd', roof: '#c9734a' },
  // Neighbours: east of the pond (door west), and two along the south edge (doors north)
  { x: 20.6, z: 8.2, w: 4.4, d: 3.4, rot: -Math.PI / 2, wall: '#f1e9dc', roof: '#4f86b8' },
  { x: 8.5, z: 16.2, w: 4.4, d: 3.4, rot: Math.PI, wall: '#f6e2d0', roof: '#7a62ad' },
  { x: 17.6, z: 16.2, w: 4.4, d: 3.4, rot: Math.PI, wall: '#efe7d6', roof: '#d9674a' },
  // North bank: Jordan's house at the end of the west lane (door faces east), a cottage at the end
  // of the east lane (door west), one behind the east lane and one at the north road's end (doors south).
  { x: -17.8, z: -33.2, w: 4.4, d: 3.4, rot: Math.PI / 2, wall: '#e3eef5', roof: '#3f7f9e' },
  { x: 14.8, z: -30, w: 4.4, d: 3.4, rot: -Math.PI / 2, wall: '#f6e7cf', roof: '#b8574a' },
  { x: 4.6, z: -34.1, w: 4.4, d: 3.4, rot: 0, wall: '#f2e4d8', roof: '#6b8f4e' },
  { x: -4, z: -37.4, w: 4.4, d: 3.4, rot: 0, wall: '#f8ecd9', roof: '#8a64a8' },
];

export const LANDMARKS = {
  junctionNode: [0, -1] as Pt,
};

/** Park benches around the plaza: position and facing (seat faces +z rotated by `rot`, i.e. toward the Node). */
export const BENCHES: { x: number; z: number; rot: number }[] = [
  [-3.6, -3.8],
  [1.5, -5.2],
  [-4.2, 3.4],
  [4.4, 3.6],
].map(([x, z]) => ({ x, z, rot: Math.atan2(-x, -z) }));

/** Benches on the north bank's green, east and south-east of the well (clear of the lane), facing it. */
export const HAMLET_BENCHES: { x: number; z: number; rot: number }[] = [
  [1.4, -27.4],
  [0.4, -25.3],
].map(([x, z]) => ({ x, z, rot: Math.atan2(WELL.x - x, WELL.z - z) }));

/**
 * Direction signposts beside the paths (board faces +z rotated by `rot`, so ~0 reads
 * well from the follow camera). Scattered trees, hedges and lanterns keep clear of them.
 */
export const SIGNPOSTS: { x: number; z: number; rot: number; text: string }[] = [
  { x: 7.2, z: -3.5, rot: -0.25, text: 'CIRCUIT CLUB' },
  { x: -7.2, z: 1.7, rot: 0.12, text: 'TAYLOR' },
  { x: -1.3, z: -7.6, rot: 0.2, text: 'JORDAN' },
  { x: -2.6, z: 8.3, rot: 0, text: 'GREENHOUSE' },
  // Just past the cutting, readable through it from the south.
  { x: -6.6, z: -24.4, rot: 0.1, text: 'NORTH BANK' },
];

/** Keep-clear zones for scattered props: [x, z, radius]. */
export const CLEAR_ZONES: [number, number, number][] = [
  [0, 0, 7],
  [CLUBHOUSE_EXTERIOR.x, CLUBHOUSE_EXTERIOR.z, 5.4],
  [TERRAIN.pond.center[0], TERRAIN.pond.center[1], TERRAIN.pond.radius + 1.3],
  [1.6, 4, 2.5],
  [TRACTOR.x, TRACTOR.z, 2],
  [FRUIT_STAND.x, FRUIT_STAND.z, 1.5],
  // Mika's greenhouse, and the conversation camera south of it
  [GREENHOUSE_EXTERIOR.x, GREENHOUSE_EXTERIOR.z + 0.8, 4.8],
  [-9.9, 14.4, 2.6],
  ...Object.values(SIGNAL_POSITIONS).map(([x, , z]) => [x, z, 3.2] as [number, number, number]),
  // The approach to the north gate (Mission 3's signal stood here before the north bank).
  [-4, -18.5, 3.2],
  // North bank: the gate's far side, the watchtower, the green round the well and the meadow (the orchard is its own rows).
  [NORTH_GATE.x, -24, 2.2],
  [WATCHTOWER.x, WATCHTOWER.z, 2.2],
  [WELL.x, WELL.z, 2.6],
  ...HAMLET_BENCHES.map((b) => [b.x, b.z, 2.2] as [number, number, number]),
  [MEADOW.x, MEADOW.z, 2],
];
