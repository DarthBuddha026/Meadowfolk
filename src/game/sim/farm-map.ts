import { HOME_COLS, PARCELS, PIECES, villaTier, type PieceDef } from './content';
import type { FarmState, Placement } from './types';

/**
 * The farm grid: one flat layer of 1 m tiles on the north bank, past the river from the town.
 * Columns run west → east (+x), rows north → south (+z). Every tile the player can build or farm
 * on is at one height (y = 0).
 */
export const GRID = { x0: -22.5, z0: -39, cols: 45, rows: 16, cell: 1 };

export const tileIndex = (c: number, r: number) => r * GRID.cols + c;
export const inGrid = (c: number, r: number) => c >= 0 && r >= 0 && c < GRID.cols && r < GRID.rows;

/** World centre of a tile. */
export function tileCenter(c: number, r: number): [number, number] {
  return [GRID.x0 + (c + 0.5) * GRID.cell, GRID.z0 + (r + 0.5) * GRID.cell];
}

/** The tile under a world point (may be off the grid). */
export function tileAt(x: number, z: number): [number, number] {
  return [Math.floor((x - GRID.x0) / GRID.cell), Math.floor((z - GRID.z0) / GRID.cell)];
}

/** Old apple trees already standing in the orchard parcel; their tiles can't be farmed or built on. */
export const ORCHARD_TREES: [number, number][] = [
  [2, 3], [5, 2], [8, 3],
  [3, 7], [6, 6], [8, 8],
  [2, 11], [5, 10], [7, 13],
];

/** The farm gate, where the north road enters the grid, and where the hero wakes up. */
export const FARM_GATE: [number, number] = [18, 15];
export const WAKE_TILE: [number, number] = [18, 6];

export function parcelOf(c: number): string {
  if (c >= HOME_COLS[0] && c < HOME_COLS[1]) return 'home';
  return PARCELS.find((p) => c >= p.cols[0] && c < p.cols[1])?.id ?? 'none';
}

export function isOwned(farm: FarmState, c: number, r: number): boolean {
  if (inHouseArea(c, r)) return true;
  if (!inGrid(c, r)) return false;
  const parcel = parcelOf(c);
  return parcel === 'home' || farm.parcels.includes(parcel);
}

export function inVilla(farm: FarmState, c: number, r: number, tier = farm.villaTier): boolean {
  const v = villaTier(tier);
  return c >= v.c && c < v.c + v.w && r >= v.r && r < v.r + v.h;
}


/** The tiles an object covers, its footprint turned by `rot`. */
export function footprint(piece: PieceDef, c: number, r: number, rot: number): [number, number][] {
  if (piece.layer !== 'object') return [[c, r]];
  const [w, d] = piece.size ?? [1, 1];
  const [fw, fd] = rot % 2 === 0 ? [w, d] : [d, w];
  const out: [number, number][] = [];
  for (let i = 0; i < fw; i++) for (let j = 0; j < fd; j++) out.push([c + i, r + j]);
  return out;
}

/** World centre of a placement (its footprint's centre). */
export function placementCenter(p: Placement): [number, number] {
  const piece = PIECES[p.piece];
  const tiles = piece ? footprint(piece, p.c, p.r, p.rot) : [[p.c, p.r] as [number, number]];
  const cs = tiles.map(([c, r]) => tileCenter(c, r));
  return [cs.reduce((s, t) => s + t[0], 0) / cs.length, cs.reduce((s, t) => s + t[1], 0) / cs.length];
}

/** Which placements cover a tile, by layer. */
export function placementsAt(farm: FarmState, c: number, r: number): Placement[] {
  return farm.placements.filter((p) => {
    const piece = PIECES[p.piece];
    if (!piece) return false;
    return footprint(piece, p.c, p.r, p.rot).some(([fc, fr]) => fc === c && fr === r);
  });
}

/** The edge of tile (c, r) nearest a world point: 0 north, 1 east, 2 south, 3 west. */
export function nearestEdge(c: number, r: number, x: number, z: number): number {
  const [cx, cz] = tileCenter(c, r);
  const dx = x - cx;
  const dz = z - cz;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

/** The villa's extent on the grid, from its walls: columns [c0, c1), rows [r0, r1). Null if it has (almost) none. */
export function villaBounds(farm: FarmState): { c0: number; c1: number; r0: number; r1: number } | null {
  const v = villaTier(farm.villaTier);
  const walls = farm.placements.filter((p) => {
    const d = PIECES[p.piece];
    return d?.villa && d.layer === 'edge' && p.c >= v.c && p.c < v.c + v.w && p.r >= v.r && p.r < v.r + v.h;
  });
  if (walls.length < 3) return null;
  return {
    c0: Math.min(...walls.map((p) => p.c)),
    c1: Math.max(...walls.map((p) => p.c)) + 1,
    r0: Math.min(...walls.map((p) => p.r)),
    r1: Math.max(...walls.map((p) => p.r)) + 1,
  };
}

/** Unit normal pointing out of a tile through its edge `rot` (0 north, 1 east, 2 south, 3 west). */
export const EDGE_NORMAL: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface VillaDoor {
  placement: Placement;
  /** Where you stand to use it from each side, and which way you face after coming through. */
  inside: [number, number];
  /** Where you appear coming in: the deepest clear spot (up to 2.4 m in) along the doorway, so the camera sees you over the door frame. */
  arrive: [number, number];
  outside: [number, number];
  faceIn: number;
  faceOut: number;
}

/** Steps into the room from a door until a spot whose tile has nothing solid on it. */
function arrivalSpot(farm: FarmState, ex: number, ez: number, nx: number, nz: number): [number, number] {
  for (const d of [2.4, 2.0, 1.6, 1.2]) {
    // Clear where you'd stand and just beyond it (a body is about half a metre across).
    const clear = [d, d + 0.45].every((k) => {
      const [c, r] = tileAt(ex - nx * k, ez - nz * k);
      return !placementsAt(farm, c, r).some((p) => PIECES[p.piece].layer === 'object' && PIECES[p.piece].solid);
    });
    if (clear) return [ex - nx * d, ez - nz * d];
  }
  return [ex - nx * 0.9, ez - nz * 0.9];
}

/**
 * The villa's front doors: door walls on its outer edge (a door between two rooms inside isn't one).
 * Going through one is a transition, like entering a building in town.
 */
export function villaDoors(farm: FarmState): VillaDoor[] {
  const b = villaBounds(farm);
  if (!b) return [];
  const within = (c: number, r: number) => c >= b.c0 && c < b.c1 && r >= b.r0 && r < b.r1;
  return farm.placements
    .filter((p) => p.piece === 'wall-door')
    .flatMap((p) => {
      const [nx, nz] = EDGE_NORMAL[((p.rot % 4) + 4) % 4];
      // The tile it stands on is inside; the one across its edge is outside the villa.
      if (!within(p.c, p.r) || within(p.c + nx, p.r + nz)) return [];
      const [cx, cz] = tileCenter(p.c, p.r);
      const ex = cx + nx * 0.5;
      const ez = cz + nz * 0.5;
      return [
        {
          placement: p,
          inside: [ex - nx * 0.9, ez - nz * 0.9] as [number, number],
          arrive: arrivalSpot(farm, ex, ez, nx, nz),
          outside: [ex + nx * 0.85, ez + nz * 0.85] as [number, number],
          faceIn: Math.atan2(-nx, -nz),
          faceOut: Math.atan2(nx, nz),
        },
      ];
    });
}

/* ------------------------------------------------------------------ */
/* The house: a shell on the farm, its rooms in their own space        */
/* ------------------------------------------------------------------ */

/**
 * The inside of the house is its own space, like a building's interior in town: tiles in columns
 * from 160 up (off the map, past the east edge of the world), so placements there use the same
 * tile maths. It is bigger than the house looks from outside. The villa tiers' footprints live here.
 */
export const HOUSE_AREA = { c0: 160, c1: 186, r0: 0, r1: 13 };
export const inHouseArea = (c: number, r: number) => c >= HOUSE_AREA.c0 && c < HOUSE_AREA.c1 && r >= HOUSE_AREA.r0 && r < HOUSE_AREA.r1;

/** The house as it stands on the farm: its outside shell (tiles). */
export function houseShell(farm: FarmState) {
  return villaTier(farm.villaTier).ext;
}

/** Is a farm tile under the house's shell? */
export function underShell(farm: FarmState, c: number, r: number) {
  const e = houseShell(farm);
  return c >= e.c && c < e.c + e.w && r >= e.r && r < e.r + e.h;
}

export type HouseSide = 'front' | 'back';

export interface ShellDoor {
  side: HouseSide;
  /** The door's column (the shell is an odd number of tiles wide, so the door sits on the gate's column). */
  c: number;
  /** Where you stand outside to go in, and which way you face coming back out. */
  outside: [number, number];
  faceOut: number;
}

/**
 * The shell's doors: a double front door facing the gate, and a double back door when the rooms
 * inside have one on their north wall.
 */
export function shellDoors(farm: FarmState): ShellDoor[] {
  const e = houseShell(farm);
  const c = WAKE_TILE[0];
  const x = GRID.x0 + c + 0.5;
  const doors: ShellDoor[] = [{ side: 'front', c, outside: [x, GRID.z0 + e.r + e.h + 0.85], faceOut: 0 }];
  if (villaDoors(farm).some((d) => d.placement.rot % 4 === 0)) doors.push({ side: 'back', c, outside: [x, GRID.z0 + e.r - 0.85], faceOut: Math.PI });
  return doors;
}

/** Coming in through the shell's front or back door: the matching doorway inside (a double door's middle). */
export function houseEntry(farm: FarmState, side: HouseSide): { x: number; z: number; face: number } {
  const doors = villaDoors(farm);
  const rot = side === 'front' ? 2 : 0;
  const d = doors.find((q) => q.placement.rot % 4 === rot) ?? doors[0];
  if (!d) {
    const v = villaTier(farm.villaTier);
    return { x: GRID.x0 + v.c + v.w / 2, z: GRID.z0 + v.r + v.h / 2, face: Math.PI };
  }
  const pair = doors.find((q) => q !== d && q.placement.rot === d.placement.rot && q.placement.r === d.placement.r && q.placement.c === d.placement.c + 1);
  const pairV = doors.find((q) => q !== d && q.placement.rot === d.placement.rot && q.placement.c === d.placement.c && q.placement.r === d.placement.r + 1);
  const other = pair ?? pairV;
  const [x, z] = other ? [(d.arrive[0] + other.arrive[0]) / 2, (d.arrive[1] + other.arrive[1]) / 2] : d.arrive;
  return { x, z, face: d.faceIn };
}

/** Going out through a door inside: the shell's door on that side (the front one otherwise). */
export function houseExit(farm: FarmState, doorId: number | null): ShellDoor {
  const doors = shellDoors(farm);
  const p = farm.placements.find((q) => q.id === doorId);
  const side: HouseSide = p && p.rot % 4 === 0 ? 'back' : 'front';
  return doors.find((d) => d.side === side) ?? doors[0];
}
