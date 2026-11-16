import type { ConversationStage, Vec3 } from './types';

/**
 * Spatial layout of every map — every position the gameplay logic and the
 * 3D scene both need lives here, so the two can never drift apart.
 *
 * Maps share one physics world but live far apart:
 *  - `junction`   — the outdoor diorama island around the origin
 *                   (x ∈ [-26, 26], z ∈ [-42, 22]; walkable |x| < 24, -40 < z < 20, the north
 *                   bank past the ridge at z ≈ -21 opening after Mission 2).
 *  - `clubhouse`  — the Circuit Club interior, centred at CLUBHOUSE.origin (Mission 1).
 *  - `greenhouse` — Mika's greenhouse interior, centred at GREENHOUSE.origin (Mission 2).
 * North is -z on both maps.
 */

export type MapId = 'junction' | 'clubhouse' | 'greenhouse';

/** Walkable Junction: |x| < x, and z from -north to z. */
export const WORLD_BOUNDS = { x: 24, z: 20, north: 40 };

export const PLAYER_SPAWN: Vec3 = [1.6, 0, 4];

/** Height of the workbench top (sized for chibi characters). */
export const BENCH_TOP = 0.78;

/** The Circuit Club house as seen from outside, in Junction. */
export const CLUBHOUSE_EXTERIOR = {
  x: 12,
  z: -7,
  w: 7,
  d: 5,
  wall: '#f3e7d2',
  roof: '#d9674a',
};

/** The Circuit Club interior map. */
export const CLUBHOUSE = {
  origin: [160, 0, 0] as Vec3,
  size: [12, 12] as [number, number],
  wallHeight: 2.6,
};

const at = (dx: number, y: number, dz: number): Vec3 => [CLUBHOUSE.origin[0] + dx, y, CLUBHOUSE.origin[2] + dz];

/**
 * Mission 1 (No Signal) set dressing inside the clubhouse, laid out to the club's floor
 * plan: bookshelf, router and the bench along the back wall with the diagram board in the
 * back-right corner; the meeting table on the left, the carpet down the middle, the sofas
 * and coffee table on the right, and a plant in each front corner.
 */
export const WORKSHOP = {
  floorCenter: at(0, 0, 0),
  bench: { center: at(1.28, 0, -5.35), size: [3.9, BENCH_TOP, 1.1] as Vec3 },
  laptop: at(0.98, BENCH_TOP, -5.3),
  board: at(2.18, BENCH_TOP, -5.2),
  /** The diagram board (ESP32 datasheet and pinout), angled in the back-right corner. */
  poster: { position: at(4.67, 0, -4.59), rotationY: -0.44 },
  /** The club's Wi-Fi router, on a low cabinet against the back wall. */
  cabinet: at(-2.04, 0, -5.7),
  router: at(-2.04, 0.62, -5.65),
  sarahHome: at(-1.0, 0, -3.4),
  mrTHome: at(-1.9, 0, 2.0),
  gem: at(0, 0, 1.0),
};

/** Mika's greenhouse as seen from outside, in Junction (door faces +z, toward the path). */
export const GREENHOUSE_EXTERIOR = {
  x: -10.5,
  // Its front (the door) stays at z = 8.8; it is as deep as the interior is, at the same scale (see
  // GreenhouseExterior, which shows the interior's set through the glass).
  z: 5.95,
  w: 6.2,
  d: 5.7,
};

/** The greenhouse interior map. */
export const GREENHOUSE = {
  origin: [-160, 0, 0] as Vec3,
  size: [12, 11] as [number, number],
  wallHeight: 2.6,
};

const gh = (dx: number, y: number, dz: number): Vec3 => [GREENHOUSE.origin[0] + dx, y, GREENHOUSE.origin[2] + dz];

/** Where Captain T waits by the greenhouse signal before Mission 2 starts. */
export const MR_T_GREENHOUSE: Vec3 = [-8.6, 0, 12.1];

/**
 * Mika's greenhouse floor plan (Mission 2), in greenhouse-local metres (x right,
 * z toward the door): two farm areas left and right with the water tank between
 * them at the back, a central aisle, and the tech area across the front by the door.
 */
const g = (dx: number, y: number, dz: number): Vec3 => [GREENHOUSE.origin[0] + dx, y, GREENHOUSE.origin[2] + dz];

export const GARDEN = {
  center: g(0, 0, 0),
  /** Farm areas: raised planting plots, centre + footprint [x, z]. */
  farms: [
    { center: g(-3.53, 0, -1.52), size: [4.44, 7.21] as [number, number] },
    { center: g(3.53, 0, -1.52), size: [4.44, 7.21] as [number, number] },
  ],
  /** Tech area: the decked strip across the front, between the farms and the door. */
  techArea: { center: g(0, 0, 3.57), size: [11.5, 2.57] as [number, number] },
  tank: g(0, 0, -4.41),
  /** Straight in front of the tank, in the aisle. */
  pump: g(0, 0, -3.03),
  /** One sprinkler in each farm area. */
  sprinklers: [g(-3.52, 0, -1.51), g(3.52, 0, -1.51)],
  /** Hoses leave the pump sideways, run up the aisle at ±hoseX and along the back wall at hoseBackZ. */
  hoseX: 1.05,
  hoseBackZ: -5.3,
  /** Weatherproof box on a post, in the tech area: the TRIOE board and the relay module live inside. */
  controlPost: g(3.52, 0, 2.82),
  /** A soil moisture sensor in each farm area (left, right), on its aisle side, level with the sprinkler. */
  sensors: [g(-1.97, 0, -1.53), g(1.97, 0, -1.53)] as Vec3[],
  /** The sensor the evidence panel looks at: the right one, on the control box's side. */
  sensor: g(1.97, 0, -1.53),
  /** Both sensor cables leave their farm into the aisle and run down it, beside the right farm, at this x. */
  sensorCableX: 0.93,
  /** Mika's dry test pot — a potted flower in dry soil — on the deck beside the control box. */
  dryPot: g(4.1, 0, 3.2),
  deviceTable: { center: g(-3.53, 0, 2.82), size: [2.3, 0.55] as [number, number] },
  tablet: g(-3.0, 0.74, 2.82),
  /** Table with plants, along the left wall of the tech area (runs along z). */
  plantTable: g(-5.29, 0, 3.6),
  sacks: g(-3.53, 0, 4.45),
  tools: g(3.52, 0, 4.45),
  mikaHome: g(-1.6, 0, 3.1),
  mrTHome: g(1.1, 0, 2.6),
  gem: g(0, 0, 0.8),
  /** Puddles spreading down the aisle into the tech area: centre + radius. */
  puddles: [
    [g(0, 0, -1.6), 0.9],
    [g(-0.4, 0, 0.5), 0.7],
    [g(-0.9, 0, 2.95), 0.55],
    [g(1.9, 0, 3.3), 0.5],
  ] as [Vec3, number][],
};

export interface Door {
  map: MapId;
  position: Vec3;
  radius: number;
  to: MapId;
  /** Where the hero appears on the other side, and which way they face (radians). */
  spawn: Vec3;
  face: number;
  label: string;
  /** Shown on the transition card. */
  destination: string;
}

export const DOORS: Record<string, Door> = {
  'door-clubhouse': {
    map: 'junction',
    position: [CLUBHOUSE_EXTERIOR.x, 0, CLUBHOUSE_EXTERIOR.z + CLUBHOUSE_EXTERIOR.d / 2 + 0.8],
    radius: 1.3,
    to: 'clubhouse',
    spawn: at(0, 0, 4.7),
    face: Math.PI,
    label: 'Enter the Circuit Club',
    destination: 'Circuit Club',
  },
  'door-exit': {
    map: 'clubhouse',
    position: at(0, 0, 5.4),
    radius: 1.3,
    to: 'junction',
    spawn: [CLUBHOUSE_EXTERIOR.x, 0, CLUBHOUSE_EXTERIOR.z + CLUBHOUSE_EXTERIOR.d / 2 + 1.6],
    face: 0,
    label: 'Go outside',
    destination: 'Junction',
  },
  'door-greenhouse': {
    map: 'junction',
    position: [GREENHOUSE_EXTERIOR.x, 0, GREENHOUSE_EXTERIOR.z + GREENHOUSE_EXTERIOR.d / 2 + 0.8],
    radius: 1.3,
    to: 'greenhouse',
    spawn: gh(0, 0, 4.4),
    face: Math.PI,
    label: 'Enter the greenhouse',
    destination: "Mika's Greenhouse",
  },
  'door-greenhouse-exit': {
    map: 'greenhouse',
    position: gh(0, 0, 4.9),
    radius: 1.3,
    to: 'junction',
    spawn: [GREENHOUSE_EXTERIOR.x, 0, GREENHOUSE_EXTERIOR.z + GREENHOUSE_EXTERIOR.d / 2 + 1.6],
    face: 0,
    label: 'Go outside',
    destination: 'Junction',
  },
};

/** The door that leads from an interior map back out to Junction. */
export function exitDoorOf(map: MapId): string | undefined {
  return Object.keys(DOORS).find((id) => DOORS[id].map === map && DOORS[id].to === 'junction');
}

export const MR_T_PLAZA: Vec3 = [-0.6, 0, 2.2];

/**
 * Conversation stages. Every one is a single row facing the camera: the hero on the left,
 * the help seeker (if any) in the middle, a step back, and Captain T on the right.
 */
export const STAGES: Record<string, ConversationStage> = {
  plaza: {
    hero: [-0.4, 0, 4.2],
    mrT: [1.2, 0, 4.2],
    camera: [0.4, 2.1, 10],
    lookAt: [0.4, 1.25, 4.2],
  },
  // In front of the bench, on the carpet.
  workshop: {
    hero: at(-1.4, 0, -3.0),
    npc: at(0, 0, -3.25),
    mrT: at(1.4, 0, -3.0),
    camera: at(0, 1.75, 2.4),
    lookAt: at(0, 1.25, -3.1),
  },
  // Outside, by the greenhouse signal (Junction): the hero stays about where they answered it,
  // Captain T steps over to their right.
  'greenhouse-entry': {
    hero: [-8.9, 0, 12.2],
    mrT: [-7.4, 0, 12.2],
    camera: [-8.15, 3.2, 16.6],
    lookAt: [-8.15, 1.25, 12.0],
  },
  // Inside the greenhouse
  // Up the aisle between the farm areas, just behind the gem's spot; the camera stands just
  // inside the front wall (the doorway glow sits behind it), far enough back to frame all three.
  garden: {
    hero: g(-0.85, 0, 0.3),
    npc: g(0, 0, 0.1),
    mrT: g(0.85, 0, 0.3),
    camera: g(0, 1.9, 5.3),
    lookAt: g(0, 1.2, 0.2),
  },
};

export interface CameraShot {
  camera: Vec3;
  lookAt: Vec3;
}

export const SHOTS: Record<string, CameraShot> = {
  laptop: { camera: at(1.08, BENCH_TOP + 1.0, -3.6), lookAt: at(1.4, BENCH_TOP + 0.13, -5.45) },
  // Board and its display both sit left of the evidence panel (the camera aims right of them).
  board: { camera: at(2.45, BENCH_TOP + 1.2, -3.35), lookAt: at(2.2, BENCH_TOP + 0.14, -5.35) },
  poster: { camera: at(3.42, 1.4, -1.98), lookAt: at(5.17, 1.3, -4.36) },
  router: { camera: at(-2.45, 1.4, -4.1), lookAt: at(-1.45, 0.72, -5.6) },
  // The board with its display mounted behind it, centred.
  'result-m1': { camera: at(2.2, BENCH_TOP + 1.0, -3.9), lookAt: at(2.22, BENCH_TOP + 0.12, -5.42) },
  // Close-ups aim right of their subject so it stays clear of the evidence panel.
  tablet: { camera: g(-3.15, 1.75, 3.89), lookAt: g(-2.76, 0.78, 2.83) },
  'relay-box': { camera: g(3.29, 1.38, 3.97), lookAt: g(3.76, 1.12, 2.97) },
  'soil-sensor': { camera: g(0.62, 1.55, 0.27), lookAt: g(2.3, 0.4, -1.7) },
  // West of the help signal, so its bubble stays out of frame.
  // High over the tech area, looking up the aisle: both sprinklers, the puddles, the pump and the tank.
  'result-m2': { camera: g(0, 5.5, 3.5), lookAt: g(0, 0, -2.0) },
  heroSetup: { camera: [0.2, 1.25, 7.2], lookAt: [0.2, 0.75, 4] },
  // From the north end of the bridge, up the road through the ridge's cutting into the north bank.
  'north-gate': { camera: [-1.2, 4.4, -14.2], lookAt: [-4.6, 0.9, -25] },
};

/** Help signal locations. Mission 1's signal hangs at the clubhouse door; Mission 3's is at Jordan's, on the north bank. */
export const SIGNAL_POSITIONS: Record<string, Vec3> = {
  'mission-1': [CLUBHOUSE_EXTERIOR.x, 0, CLUBHOUSE_EXTERIOR.z + CLUBHOUSE_EXTERIOR.d / 2 + 0.75],
  'mission-2': [-8.6, 0, 11.6],
  'mission-3': [-13.6, 0, -34.6],
  'mission-4': [3.4, 0, -4.2],
  'mission-5': [13.1, 0, 15.6],
  'mission-6': [-19.5, 0, -2.4],
};

export interface InteractPoint {
  map: MapId;
  position: Vec3;
  radius: number;
}

/**
 * Where you stand to use each interactable (xz distance check, per map). Ids are
 * unique across missions; only the current mission's ones are interactable.
 */
export const INTERACT_POINTS: Record<string, InteractPoint> = {
  // Mission 1 — the Circuit Club
  sarah: { map: 'clubhouse', position: WORKSHOP.sarahHome, radius: 1.7 },
  laptop: { map: 'clubhouse', position: at(0.98, 0, -4.3), radius: 1.2 },
  board: { map: 'clubhouse', position: at(2.33, 0, -4.2), radius: 1.2 },
  poster: { map: 'clubhouse', position: at(4.07, 0, -3.35), radius: 1.3 },
  router: { map: 'clubhouse', position: at(-2.04, 0, -4.55), radius: 1.2 },
  // Mission 2 — Mika's greenhouse
  mika: { map: 'greenhouse', position: GARDEN.mikaHome, radius: 1.6 },
  tablet: { map: 'greenhouse', position: g(-3.0, 0, 3.65), radius: 1.0 },
  'relay-box': { map: 'greenhouse', position: g(3.52, 0, 3.85), radius: 1.0 },
  'soil-sensor': { map: 'greenhouse', position: g(0.85, 0, -1.1), radius: 0.9 },
  // Shared
  'mr-t': { map: 'clubhouse', position: WORKSHOP.mrTHome, radius: 1.7 },
  ...Object.fromEntries(Object.entries(DOORS).map(([id, d]) => [id, { map: d.map, position: d.position, radius: d.radius }])),
  ...Object.fromEntries(
    Object.entries(SIGNAL_POSITIONS)
      .filter(([id]) => id !== 'mission-1') // Mission 1's signal is the clubhouse door
      .map(([id, position]) => ['signal-' + id, { map: 'junction' as MapId, position, radius: 2 }])
  ),
};
