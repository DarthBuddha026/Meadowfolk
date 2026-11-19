import { CLEAR_ZONES, FARM, FARM_FRONT, FORESTS, HOUSES, LATE_PATHS, RETIRED_PATHS, RIDGE, SIGNPOSTS, TERRAIN, type Pt } from '@/game/data/terrain-plan';
import { GREEN_LOT } from '@/game/data/world-layout';
import { GRID, ORCHARD_TREES, tileCenter } from '@/game/sim/farm-map';

/**
 * Terrain engine — turns the authored terrain plan into:
 *  - smooth outline loops (land, rim, paths) for clay-like extruded geometry
 *  - merged water colliders
 *  - deterministic scatter of scenery props
 * Framework-agnostic: no React, no three.js.
 */

export type Loop = Pt[];

export interface ScatterItem {
  x: number;
  z: number;
  y: number;
  s: number;
  rot: number;
  v: number;
}

export interface TerrainData {
  land: Loop[];
  /** The sand of the beaches, down to the waterline. */
  beach: Loop[];
  rim: Loop[];
  paths: Loop[];
  waterColliders: { x: number; z: number; hx: number; hz: number }[];
  rimHeight: number;
  scatter: {
    trees: ScatterItem[];
    hedges: ScatterItem[];
    flowers: ScatterItem[];
    tufts: ScatterItem[];
    rocks: ScatterItem[];
    lanterns: ScatterItem[];
    lilies: ScatterItem[];
    cattails: ScatterItem[];
    apples: ScatterItem[];
  };
}

export const RIM_HEIGHT = 1.5;

/** Height of the river/sea surface. */
export const WATER_LEVEL = -0.5;

/** The sand paths and plaza: a thin slab whose top stands this far above the grass (y = 0)… */
export const PATH_TOP = 0.045;
/** …with a rounded edge this wide that drops this far. */
export const PATH_BEVEL = 0.16;
export const PATH_BEVEL_DROP = 0.035;
/** Top of the bridge deck's planks. */
export const BRIDGE_TOP = 0.09;
/** Stepping stones: flattened domes, centred this high, this tall, these radii (times each stone's size). */
export const STONE = { y: 0.035, rise: 0.06, rx: 0.3, rz: 0.26 };

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function distToSegment(px: number, pz: number, a: Pt, b: Pt) {
  const vx = b[0] - a[0];
  const vz = b[1] - a[1];
  const len2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / len2));
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t));
}

export function distToPolyline(px: number, pz: number, pts: Pt[]) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, pz, pts[i], pts[i + 1]));
  return d;
}

export function distToRiver(x: number, z: number) {
  return distToPolyline(x, z, TERRAIN.river.points);
}

type Path = (typeof TERRAIN.paths)[number];

export function distToPaths(x: number, z: number, paths: readonly Path[] = TERRAIN.paths) {
  let d = Math.hypot(x - TERRAIN.plaza.center[0], z - TERRAIN.plaza.center[1]) - TERRAIN.plaza.radius;
  for (const p of paths) d = Math.min(d, distToPolyline(x, z, p.points) - p.halfWidth);
  return d;
}

export function distToWalkways(x: number, z: number, walkways: readonly Pt[][] = TERRAIN.walkways) {
  return Math.min(...walkways.map((w) => distToPolyline(x, z, w)));
}

/** Inside a house's footprint (or the farm's), plus a margin. */
function inHouse(x: number, z: number, margin: number) {
  if (Math.abs(x - FARM.x) < FARM.w / 2 + margin && Math.abs(z - FARM.z) < FARM.d / 2 + margin) return true;
  return HOUSES.some((h) => {
    const r = Math.max(h.w, h.d) / 2 + margin;
    return Math.abs(x - h.x) < r && Math.abs(z - h.z) < r;
  });
}

/** Inside the walkable island, at least `margin` from its rim (and short of the waterline). */
export function inWalkableArea(x: number, z: number, margin = 0) {
  const { rimInner, beach } = TERRAIN;
  return !(x <= -rimInner.west + margin || x >= rimInner.east - margin || z <= -rimInner.north + margin || z >= beach.shore - 0.8 - margin);
}

/**
 * Where the ridge between the river and the farm stood (west of the river's turn, but not its
 * cutting). It's gone now; only the scatter still asks, so its layout stays as it was.
 */
function onRidge(x: number, z: number, margin = 0) {
  return z > RIDGE.z[0] - margin && z < RIDGE.z[1] + margin && x < RIDGE.east + margin && Math.abs(x - RIDGE.cut.x) >= RIDGE.cut.half - margin;
}

/** Where the grass gives way to the beach's sand (a gentle wave across the map). */
export function beachEdge(x: number) {
  return TERRAIN.beach.from + Math.sin(x * 0.31) * 0.7 + Math.sin(x * 0.12 + 1) * 0.5;
}

/** The waterline, where the beach meets the ocean. */
export function shoreAt(x: number) {
  return TERRAIN.beach.shore + Math.sin(x * 0.19 + 0.5) * 0.6 + Math.sin(x * 0.07) * 0.4;
}

/** On the beach's sand. */
export const isBeach = (x: number, z: number) => z >= beachEdge(x) && z < shoreAt(x);

/** In one of the thick woods (round the statue, behind the town hall). */
export const inForest = (x: number, z: number) => FORESTS.some((f) => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1);

/** Open ground a villager can stroll to: inside the rim, clear of the river, the pond, houses and the farm. */
export function isOpenGround(x: number, z: number) {
  const { river, pond } = TERRAIN;
  return (
    inWalkableArea(x, z, 1.5) &&
    distToRiver(x, z) > river.halfWidth + 1.4 &&
    Math.hypot(x - pond.center[0], z - pond.center[1]) > pond.radius + 1.2 &&
    !inHouse(x, z, 0.8)
  );
}

/** Keeps props from growing through a signpost board (filtered after scatter so the rest of the layout stays put). */
const clearOfSignposts = (gap: number) => (p: { x: number; z: number }) => SIGNPOSTS.every((s) => Math.hypot(p.x - s.x, p.z - s.z) > gap);

/**
 * Keeps small props off the empty lot. Applied after scattering, so the random layout of
 * everything else stays exactly as it was.
 */
const offGreenhouse = (p: { x: number; z: number }) =>
  Math.abs(p.x - GREEN_LOT.x) > GREEN_LOT.w / 2 + 0.5 || Math.abs(p.z - GREEN_LOT.z) > GREEN_LOT.d / 2 + 0.5;

/** On (or within `margin` of) the farm grid, which stays clear for crops and building. */
export function onFarmGrid(x: number, z: number, margin = 0) {
  return x > GRID.x0 - margin && x < GRID.x0 + GRID.cols * GRID.cell + margin && z > GRID.z0 - margin && z < GRID.z0 + GRID.rows * GRID.cell + margin;
}

function inClearZone(x: number, z: number, extra = 0) {
  return CLEAR_ZONES.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + extra);
}

function onBridge(x: number, z: number, margin = 0) {
  return TERRAIN.bridges.some((b) => {
    const dx = x - b.center[0];
    const dz = z - b.center[1];
    const c = Math.cos(b.rotation);
    const s = Math.sin(b.rotation);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) < b.width / 2 + margin && Math.abs(lz) < b.length / 2 + margin;
  });
}

/** The raised rim round the island (west, north and east). */
export function isRim(x: number, z: number) {
  const { rimInner } = TERRAIN;
  return x < -rimInner.west || x > rimInner.east || z < -rimInner.north;
}

/** The rim as the scatter knew it, with the old ridge: props are laid out against this, then the ridge's are dropped. */
const wasRim = (x: number, z: number) => isRim(x, z) || onRidge(x, z);

/** The paths props are scattered round: all but the late ones (which they're cleared off afterwards). */
const SCATTER_PATHS = TERRAIN.paths.filter((p) => !LATE_PATHS.includes(p));

/** The path list as the town's scatter has always known it: retired paths back in their old slots. */
const FROZEN_PATHS = (() => {
  const list: Path[] = [...SCATTER_PATHS];
  for (const r of RETIRED_PATHS) list.splice(r.index, 0, r.path as Path);
  return list;
})();

/** Where the river runs at x (its centreline, for the stretch west of where it turns south). */
function riverZAt(x: number) {
  const pts = TERRAIN.river.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    if (x >= ax && x <= bx) return az + ((bz - az) * (x - ax)) / (bx - ax || 1);
  }
  return pts[0][1];
}

/** In the strip between the farm's front and the river, west of the forest (laid out by hand: FARM_FRONT). */
const inFarmFront = (x: number, z: number) => x > -TERRAIN.rimInner.west - 1 && x < FARM_FRONT.east && z > FARM_FRONT.z0 && z < riverZAt(x);

/** A steady pseudo-random number in [0, 1) from two numbers. */
const hash2 = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** The farm front's trees: the forest block west of the road (a jittered grid) and the two tree lines east of it. */
function farmFrontTrees(lamps: ScatterItem[]): ScatterItem[] {
  const out: ScatterItem[] = [];
  const clear = (x: number, z: number, gap: number) =>
    distToRiver(x, z) > TERRAIN.river.halfWidth + gap && distToPaths(x, z) > 0.9 && lamps.every((l) => Math.hypot(l.x - x, l.z - z) > 1.3);
  const { forest, treeLines } = FARM_FRONT;
  for (let x = forest.x0; x <= forest.x1; x += forest.spacing) {
    for (let z = FARM_FRONT.z0 + 0.8, row = 0; z < -12; z += forest.spacing * 0.87, row++) {
      const jx = x + (row % 2 ? forest.spacing / 2 : 0) + (hash2(x, z) - 0.5) * 0.8;
      const jz = z + (hash2(z, x) - 0.5) * 0.6;
      if (jx > forest.x1 + 0.4 || !clear(jx, jz, 1.2)) continue;
      out.push({ x: jx, z: jz, y: 0, s: 0.85 + hash2(jx, jz) * 0.3, rot: hash2(jz, jx) * Math.PI * 2, v: Math.floor(hash2(jx + 1, jz) * 3) });
    }
  }
  for (const z of treeLines.z) {
    for (let x = treeLines.x0; x <= treeLines.x1; x += treeLines.spacing) {
      if (!clear(x, z, 1)) continue;
      out.push({ x, z, y: 0, s: 0.92, rot: hash2(x, z) * Math.PI * 2, v: 1 });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Walking surface                                                     */
/* ------------------------------------------------------------------ */

let stones: [number, number, number, number][] | null = null;

/** Flat stepping stones along the walkways from the roads to the houses' doors: [x, z, size, yaw]. */
export function getSteppingStones() {
  if (stones) return stones;
  stones = [];
  for (const line of TERRAIN.walkways) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 0.62));
      // Skip k = 0 after the first segment so corners don't get a doubled stone.
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        const j = stones.length;
        const side = ((j * 37) % 5) / 5 - 0.4;
        stones.push([ax + (bx - ax) * t + ((bz - az) / len) * side * 0.18, az + (bz - az) * t - ((bx - ax) / len) * side * 0.18, 0.85 + ((j * 13) % 4) * 0.08, j * 1.7]);
      }
    }
  }
  return stones;
}

/**
 * Height of what a character standing at (x, z) has under its feet. The physics ground is flat
 * at y = 0 (the grass, and every interior floor); the sand paths and plaza, the bridge deck and
 * the stepping stones stand a little proud of it, so character models are lifted by this much.
 */
export function groundHeight(x: number, z: number): number {
  if (onBridge(x, z)) return BRIDGE_TOP;
  let h = 0;
  if (!isRim(x, z) && distToRiver(x, z) >= TERRAIN.river.halfWidth) {
    const d = distToPaths(x, z);
    if (d < PATH_BEVEL) {
      const t = Math.max(0, d) / PATH_BEVEL;
      h = PATH_TOP - PATH_BEVEL_DROP * t * t * (3 - 2 * t);
    }
  }
  if (distToWalkways(x, z) < 0.6) {
    for (const [sx, sz, s, r] of getSteppingStones()) {
      const dx = x - sx;
      const dz = z - sz;
      const lx = (dx * Math.cos(r) - dz * Math.sin(r)) / (STONE.rx * s);
      const lz = (dx * Math.sin(r) + dz * Math.cos(r)) / (STONE.rz * s);
      const q = lx * lx + lz * lz;
      if (q < 1) h = Math.max(h, STONE.y + STONE.rise * Math.sqrt(1 - q));
    }
  }
  return h;
}

/* ------------------------------------------------------------------ */
/* Masks → contour loops                                               */
/* ------------------------------------------------------------------ */

interface Grid {
  nx: number;
  nz: number;
  x0: number;
  z0: number;
  cell: number;
}

function makeGrid(): Grid {
  const { extent, cell } = TERRAIN;
  return {
    nx: Math.round((extent.west + extent.east) / cell),
    nz: Math.round((extent.north + extent.south) / cell),
    x0: -extent.west,
    z0: -extent.north,
    cell,
  };
}

function buildMask(g: Grid, test: (x: number, z: number) => boolean): Uint8Array {
  const mask = new Uint8Array(g.nx * g.nz);
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + (i + 0.5) * g.cell;
      const z = g.z0 + (j + 0.5) * g.cell;
      mask[j * g.nx + i] = test(x, z) ? 1 : 0;
    }
  }
  return mask;
}

/** Trace the boundary of a cell mask into closed loops of grid-vertex coords. */
function traceLoops(mask: Uint8Array, g: Grid): Pt[][] {
  const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < g.nx && j < g.nz ? mask[j * g.nx + i] : 0);
  const key = (i: number, j: number) => j * (g.nx + 1) + i;
  const edges = new Map<number, [number, number][]>();
  const add = (ai: number, aj: number, bi: number, bj: number) => {
    const k = key(ai, aj);
    const list = edges.get(k) ?? [];
    list.push([bi, bj]);
    edges.set(k, list);
  };
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add(i + 1, j, i, j);
      if (!at(i, j + 1)) add(i, j + 1, i + 1, j + 1);
      if (!at(i - 1, j)) add(i, j, i, j + 1);
      if (!at(i + 1, j)) add(i + 1, j + 1, i + 1, j);
    }
  }
  const loops: Pt[][] = [];
  for (const [startKey, list] of edges) {
    while (list.length) {
      const si = startKey % (g.nx + 1);
      const sj = Math.floor(startKey / (g.nx + 1));
      const loop: Pt[] = [[si, sj]];
      let [ci, cj] = list.pop()!;
      let guard = 0;
      while (!(ci === si && cj === sj) && guard++ < 200000) {
        loop.push([ci, cj]);
        const next = edges.get(key(ci, cj));
        if (!next || !next.length) break;
        [ci, cj] = next.pop()!;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

/** Edge midpoints turn grid staircases into straight diagonals; Chaikin rounds corners. */
function smooth(loop: Pt[], iterations: number): Pt[] {
  let pts: Pt[] = loop.map((p, i) => {
    const q = loop[(i + 1) % loop.length];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  });
  // Drop collinear points to keep vertex counts low.
  pts = pts.filter((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6;
  });
  for (let k = 0; k < iterations; k++) {
    const next: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    pts = next;
  }
  return pts;
}

function toWorld(loop: Pt[], g: Grid): Pt[] {
  return loop.map(([i, j]) => [g.x0 + i * g.cell, g.z0 + j * g.cell]);
}

function contours(g: Grid, mask: Uint8Array, iterations = 3): Loop[] {
  return traceLoops(mask, g).map((l) => toWorld(smooth(l, iterations), g));
}

/* ------------------------------------------------------------------ */
/* Water colliders (run-length merged per row)                         */
/* ------------------------------------------------------------------ */

function waterColliders(g: Grid, water: Uint8Array) {
  const out: TerrainData['waterColliders'] = [];
  for (let j = 0; j < g.nz; j++) {
    let start = -1;
    for (let i = 0; i <= g.nx; i++) {
      const on = i < g.nx && water[j * g.nx + i] === 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        const x0 = g.x0 + start * g.cell;
        const x1 = g.x0 + i * g.cell;
        out.push({ x: (x0 + x1) / 2, z: g.z0 + (j + 0.5) * g.cell, hx: (x1 - x0) / 2, hz: g.cell / 2 });
        start = -1;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scatter                                                             */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where a scatter pass draws its points: centre ± half size. */
interface Box {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

function scatter(
  rand: () => number,
  box: Box,
  count: number,
  spacing: number,
  ok: (x: number, z: number) => boolean,
  make: (x: number, z: number) => Partial<ScatterItem> = () => ({}),
  existing: ScatterItem[] = []
): ScatterItem[] {
  const items: ScatterItem[] = [];
  for (let guard = 0; items.length < count && guard < count * 300; guard++) {
    const x = box.cx + (rand() * 2 - 1) * box.hx;
    const z = box.cz + (rand() * 2 - 1) * box.hz;
    if (!ok(x, z)) continue;
    if ([...items, ...existing].some((t) => Math.hypot(t.x - x, t.z - z) < spacing)) continue;
    items.push({ x, z, y: 0, s: 1, rot: rand() * Math.PI * 2, v: Math.floor(rand() * 3), ...make(x, z) });
  }
  return items;
}

/**
 * Lanterns every so often beside the paths. By default along the frozen path list, exactly as the town
 * has always had them; given LATE_PATHS, just those paths' own (spaced from `others`).
 */
function lanternsAlongPaths(paths: readonly Path[] = FROZEN_PATHS, rimAt = wasRim, others: ScatterItem[] = []): ScatterItem[] {
  const late = paths === LATE_PATHS;
  const out: ScatterItem[] = [];
  const near = (x: number, z: number) => [...others, ...out].some((l) => Math.hypot(l.x - x, l.z - z) < 3.2);
  paths.forEach((path, pi) => {
    let side = pi % 2 === 0 ? 1 : -1;
    for (let s = 0; s < path.points.length - 1; s++) {
      const [ax, az] = path.points[s];
      const [bx, bz] = path.points[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let d = 3; d < len; d += 6.5) {
        const off = path.halfWidth + 0.55;
        const x = ax + ((bx - ax) * d) / len + nx * off * side;
        const z = az + ((bz - az) * d) / len + nz * off * side;
        side *= -1;
        if (Math.hypot(x, z) < TERRAIN.plaza.radius + 0.3) continue;
        if (distToRiver(x, z) < TERRAIN.river.halfWidth + 0.8 || rimAt(x, z) || inHouse(x, z, 0.6) || near(x, z)) continue;
        if (distToPaths(x, z, late ? TERRAIN.paths : FROZEN_PATHS) < 0.25 || distToWalkways(x, z) < 0.8) continue;
        out.push({ x, z, y: 0, s: 1, rot: 0, v: 0 });
      }
    }
  });
  // Ring of lanterns around the plaza, skipping path mouths.
  if (late) return out;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    const r = TERRAIN.plaza.radius + 0.5;
    const x = TERRAIN.plaza.center[0] + Math.sin(a) * r;
    const z = TERRAIN.plaza.center[1] + Math.cos(a) * r;
    const onPath = FROZEN_PATHS.some((p) => distToPolyline(x, z, p.points) < p.halfWidth + 0.4);
    if (!onPath && !near(x, z)) out.push({ x, z, y: 0, s: 1, rot: 0, v: 0 });
  }
  return out;
}

/** One scatter region: where it draws, what counts as its open ground and its rim, and how much of each prop it gets. */
interface Region {
  box: Box;
  /** Open, walkable ground. */
  interior: (x: number, z: number) => boolean;
  /** Raised rim a tree may stand on. */
  rim: (x: number, z: number) => boolean;
  /** The roads and walkways its props keep off. */
  paths: readonly Path[];
  walkways: readonly Pt[][];
  /** Props it must keep its spacing from (another region's, along their shared edge). */
  near: ScatterItem[];
  count: { trees: number; rimTrees: number; pathHedges: number; bushes: number; flowers: number; tufts: number; rocks: number; lilies: number; cattails: number };
}

/** A region's trees, hedges, flowers, tufts and riverside props, drawn from `rand` in a fixed order. */
function dress(rand: () => number, r: Region, lanterns: ScatterItem[]) {
  const { river } = TERRAIN;
  const isWater = (x: number, z: number) => distToRiver(x, z) < river.halfWidth;
  const freeGround = (x: number, z: number, pathGap: number, waterGap: number) =>
    r.interior(x, z) &&
    distToPaths(x, z, r.paths) > pathGap &&
    distToWalkways(x, z, r.walkways) > pathGap + 0.35 &&
    distToRiver(x, z) > river.halfWidth + waterGap &&
    !onBridge(x, z, 1);

  const trees = [
    ...scatter(rand, r.box, r.count.trees, 2.5, (x, z) => freeGround(x, z, 1.3, 1.4) && !inHouse(x, z, 1.8) && !inClearZone(x, z, 0.4), undefined, r.near),
    ...scatter(
      rand,
      r.box,
      r.count.rimTrees,
      2.4,
      (x, z) => r.rim(x, z) && !isWater(x, z) && distToRiver(x, z) > river.halfWidth + 1.2,
      () => ({ y: RIM_HEIGHT, s: 1.1 }),
      r.near
    ),
  ].filter(clearOfSignposts(2.6));
  const pathHedges = scatter(
    rand,
    r.box,
    r.count.pathHedges,
    1.8,
    (x, z) => freeGround(x, z, 0.5, 1) && !inHouse(x, z, 1.2) && !inClearZone(x, z) && distToPaths(x, z, r.paths) < 2.4,
    () => ({ s: 0.8 + rand() * 0.4 }),
    [...trees, ...lanterns, ...r.near]
  );
  // Bushes filling the open lawns between the trees.
  const bushes = scatter(
    rand,
    r.box,
    r.count.bushes,
    1.7,
    (x, z) => freeGround(x, z, 0.8, 1) && !inHouse(x, z, 1.2) && !inClearZone(x, z),
    () => ({ s: 0.7 + rand() * 0.5 }),
    [...trees, ...lanterns, ...pathHedges, ...r.near]
  );
  const hedges = [...pathHedges, ...bushes].filter(clearOfSignposts(2));
  const flowers = scatter(
    rand,
    r.box,
    r.count.flowers,
    0.8,
    (x, z) => freeGround(x, z, 0.35, 0.5) && !inHouse(x, z, 0.4),
    () => ({ s: 0.7 + rand() * 0.6 }),
    [...trees, ...hedges, ...lanterns, ...r.near]
  );
  const tufts = scatter(
    rand,
    r.box,
    r.count.tufts,
    0.55,
    (x, z) => freeGround(x, z, 0.15, 0.2) && !inHouse(x, z, 0.2),
    () => ({ s: 0.6 + rand() * 0.7 }),
    [...trees, ...r.near]
  );
  const rocks = scatter(
    rand,
    r.box,
    r.count.rocks,
    1,
    (x, z) => {
      const d = distToRiver(x, z) - river.halfWidth;
      return r.interior(x, z) && d > 0.15 && d < 1.3 && !onBridge(x, z, 0.8);
    },
    () => ({ s: 0.5 + rand() * 0.6 })
  );
  const lilies = scatter(
    rand,
    r.box,
    r.count.lilies,
    1.4,
    (x, z) => distToRiver(x, z) < river.halfWidth - 0.45 && !onBridge(x, z, 1) && r.interior(x, z),
    () => ({ y: WATER_LEVEL + 0.04, s: 0.7 + rand() * 0.5 })
  );
  const cattails = scatter(
    rand,
    r.box,
    r.count.cattails,
    1.6,
    (x, z) => {
      const d = distToRiver(x, z) - river.halfWidth;
      return d > -0.5 && d < -0.15 && !onBridge(x, z, 1) && r.interior(x, z);
    },
    () => ({ s: 0.8 + rand() * 0.4 })
  );
  return { trees, hedges, flowers, tufts, rocks, lilies, cattails };
}

/** Apples in the grass under every fourth tree of a list. */
function applesUnder(trees: ScatterItem[]) {
  return trees
    .filter((t, i) => t.y === 0 && i % 4 === 0)
    .map((t, i) => ({ ...t, x: t.x + (i % 2 ? 0.9 : -0.8), z: t.z + 0.7, s: 1 }))
    .filter((a) => distToPaths(a.x, a.z) > 0.2);
}

/**
 * The island as it was before the north bank (and the roads and walkways wholly south of the ridge).
 * Its props are drawn exactly as they always were — same seed, same tests, same order — so the
 * north bank never moves a tree in Junction.
 */
const CORE = { x: 26, z: 22, rimX: 24, rimZ: 20 };
const southOfRidge = (pts: readonly Pt[]) => pts.every(([, z]) => z > RIDGE.z[1]);

/** Keeps props out of the ridge's cutting, where the road and the gate go. */
const clearOfCutting = (p: { x: number; z: number }) =>
  Math.abs(p.x - RIDGE.cut.x) > RIDGE.cut.half + 1 || p.z < RIDGE.z[0] - 1 || p.z > RIDGE.z[1] + 0.5;

/** The old apple trees in the orchard, each standing on its own farm tile. */
function orchardTrees(): ScatterItem[] {
  return ORCHARD_TREES.map(([c, r], i) => {
    const [x, z] = tileCenter(c, r);
    return { x, z, y: 0, s: 0.62 + (i % 3) * 0.04, rot: i * 1.7, v: i % 3 };
  });
}

let cached: TerrainData | null = null;

export function getTerrain(): TerrainData {
  if (cached) return cached;
  const g = makeGrid();
  const { river, extent } = TERRAIN;

  const isWater = (x: number, z: number) => distToRiver(x, z) < river.halfWidth;
  const land = buildMask(g, (x, z) => !isWater(x, z) && z < beachEdge(x));
  const sand = buildMask(g, (x, z) => !isWater(x, z) && isBeach(x, z));
  const rim = buildMask(g, (x, z) => !isWater(x, z) && isRim(x, z) && z < beachEdge(x));
  const paths = buildMask(g, (x, z) => !isWater(x, z) && !isRim(x, z) && distToPaths(x, z) < 0 && z < beachEdge(x) + 1.2);
  const water = buildMask(g, (x, z) => isWater(x, z) && !onBridge(x, z, -0.15) && z < shoreAt(x));
  /** Props stay on the grass, off the beach (and rim trees only on the rim as it is now). */
  const onGrass = (p: ScatterItem) => p.z < beachEdge(p.x) - 0.6 && (p.y === 0 || isRim(p.x, p.z));

  // Lanterns as the town's scatter has always known them (retired paths and all); their final list
  // drops the retired paths' own and adds the late paths'.
  const lanterns = lanternsAlongPaths().filter(clearOfSignposts(1.3));
  const coreRim = (x: number, z: number) => Math.abs(x) > CORE.rimX || Math.abs(z) > CORE.rimZ;
  const core = dress(
    mulberry32(11),
    {
      box: { cx: 0, cz: 0, hx: CORE.x - 0.8, hz: CORE.z - 0.8 },
      interior: (x, z) => !coreRim(x, z) && Math.abs(x) < CORE.x && Math.abs(z) < CORE.z,
      rim: (x, z) => coreRim(x, z) && Math.abs(x) < CORE.x - 0.9 && Math.abs(z) < CORE.z - 0.9,
      paths: SCATTER_PATHS.filter((p) => southOfRidge(p.points)),
      walkways: TERRAIN.walkways.filter(southOfRidge),
      near: [],
      count: { trees: 80, rimTrees: 44, pathHedges: 30, bushes: 45, flowers: 260, tufts: 320, rocks: 46, lilies: 22, cattails: 16 },
    },
    lanterns
  );

  // The north bank, past the ridge: its own seed, so the island south of it keeps its layout.
  const orchard = orchardTrees();
  const northZ = RIDGE.z[0];
  const north = dress(
    mulberry32(29),
    {
      box: { cx: -0.4, cz: (northZ - extent.north + 0.8) / 2, hx: 25, hz: (northZ + extent.north - 0.8) / 2 },
      interior: (x, z) => z < northZ && x < RIDGE.east && !wasRim(x, z) && !onFarmGrid(x, z, 0.4),
      rim: (x, z) => z < northZ && x < RIDGE.east && wasRim(x, z) && x > -extent.west + 0.9 && z > -extent.north + 0.9,
      paths: FROZEN_PATHS,
      walkways: TERRAIN.walkways,
      near: [...core.trees, ...orchard],
      count: { trees: 4, rimTrees: 26, pathHedges: 2, bushes: 6, flowers: 30, tufts: 40, rocks: 0, lilies: 0, cattails: 0 },
    },
    lanterns
  );

  // (The orchard's apple trees are farm trees now — see FarmTrees — so they can be chopped.)
  // East of the river: each region its own seed. The woods are thick; the town hall's lawns open.
  const eastPaths = FROZEN_PATHS;
  // (The forest grew north with the farm; the regions beside it keep spacing from it as it was.)
  const forestOn = (paths: readonly Path[], box: Box = { cx: 50.5, cz: -27.5, hx: 26.3, hz: 17.3 }) =>
    dress(
      mulberry32(41),
      {
        box,
        interior: (x, z) => x > RIDGE.east + 0.4 && z < -11 && inWalkableArea(x, z) && !onFarmGrid(x, z, 1),
        rim: (x, z) => isRim(x, z) && z < -11 && x > RIDGE.east && x < extent.east - 0.9 && z > -extent.north + 0.9,
        paths,
        walkways: TERRAIN.walkways,
        near: [...north.trees],
        count: { trees: 150, rimTrees: 34, pathHedges: 6, bushes: 34, flowers: 90, tufts: 130, rocks: 12, lilies: 0, cattails: 8 },
      },
      lanterns
    );
  // The forest grows over the retired path to it (so no bare lane is left); the regions beside it
  // keep their spacing from the forest as it was, so they don't move.
  const forest = forestOn(SCATTER_PATHS);
  const forestAsWas = forestOn(FROZEN_PATHS, { cx: 50.5, cz: -25.5, hx: 26.3, hz: 15.3 });
  const eastTown = dress(
    mulberry32(53),
    {
      box: { cx: 53, cz: 4, hx: 24, hz: 16 },
      interior: (x, z) => x > 29 && z > -11 && z < beachEdge(x) - 1 && inWalkableArea(x, z) && !inForest(x, z),
      rim: (x, z) => isRim(x, z) && x > 29 && z > -11 && z < beachEdge(x) - 0.5 && x < extent.east - 0.9,
      paths: eastPaths,
      walkways: TERRAIN.walkways,
      near: [...forestAsWas.trees],
      count: { trees: 10, rimTrees: 16, pathHedges: 10, bushes: 16, flowers: 90, tufts: 110, rocks: 10, lilies: 6, cattails: 8 },
    },
    lanterns
  );
  const backWood = dress(
    mulberry32(67),
    {
      box: { cx: 68.5, cz: 4, hx: 7.5, hz: 15 },
      interior: (x, z) => inForest(x, z) && z > -11 && z < beachEdge(x) - 1.5 && inWalkableArea(x, z),
      rim: () => false,
      paths: eastPaths,
      walkways: TERRAIN.walkways,
      near: [...forestAsWas.trees, ...eastTown.trees],
      count: { trees: 44, rimTrees: 0, pathHedges: 0, bushes: 10, flowers: 30, tufts: 50, rocks: 0, lilies: 0, cattails: 0 },
    },
    lanterns
  );
  const east = [forest, eastTown, backWood];
  // The late paths' lanterns, and props cleared off those paths (and the old ridge's rim trees,
  // which `onGrass` drops now that the ridge is level ground).
  const offRetired = (p: ScatterItem) => RETIRED_PATHS.every((r) => distToPolyline(p.x, p.z, r.path.points) > r.path.halfWidth + 1);
  const keptLanterns = lanterns.filter(offRetired);
  const lateLanterns = lanternsAlongPaths(LATE_PATHS, isRim, keptLanterns).filter(clearOfSignposts(1.3));
  const offLate = (p: ScatterItem) =>
    LATE_PATHS.every((lp) => distToPolyline(p.x, p.z, lp.points) > lp.halfWidth + 0.9) && lateLanterns.every((l) => Math.hypot(l.x - p.x, l.z - p.z) > 1);
  // The farm front is laid out by hand: its scattered trees and bushes give way to planted rows.
  const front = farmFrontTrees([...keptLanterns, ...lateLanterns]);
  const offFront = (p: ScatterItem) => !inFarmFront(p.x, p.z);
  const clearOfFront = (p: ScatterItem) => front.every((t) => Math.hypot(t.x - p.x, t.z - p.z) > 0.8);
  const trees = [...[...core.trees.filter(clearOfCutting), ...north.trees, ...east.flatMap((r) => r.trees)].filter(onGrass).filter(offLate).filter(offFront), ...front];
  cached = {
    land: contours(g, land, 3),
    beach: contours(g, sand, 3),
    rim: contours(g, rim, 3),
    paths: contours(g, paths, 3),
    waterColliders: waterColliders(g, water),
    rimHeight: RIM_HEIGHT,
    scatter: {
      trees,
      hedges: [...core.hedges.filter(clearOfCutting), ...north.hedges, ...east.flatMap((r) => r.hedges)].filter(onGrass).filter(offLate).filter(offFront),
      flowers: [...core.flowers, ...north.flowers, ...east.flatMap((r) => r.flowers)].filter(offGreenhouse).filter(onGrass).filter(offLate).filter(clearOfFront),
      tufts: [...core.tufts, ...north.tufts, ...east.flatMap((r) => r.tufts)].filter(offGreenhouse).filter(onGrass).filter(offLate).filter(clearOfFront),
      rocks: [...core.rocks, ...east.flatMap((r) => r.rocks)].filter(onGrass).filter(offLate).filter(offFront),
      lanterns: [...keptLanterns, ...lateLanterns].filter((l) => offGreenhouse(l) && !onFarmGrid(l.x, l.z, 0.5) && l.z < beachEdge(l.x) - 0.6),
      lilies: [...core.lilies, ...east.flatMap((r) => r.lilies)],
      cattails: [...core.cattails, ...east.flatMap((r) => r.cattails)],
      apples: [...applesUnder(core.trees), ...applesUnder(north.trees), ...applesUnder(eastTown.trees)].filter(onGrass).filter(offLate).filter(offFront),
    },
  };
  return cached;
}

/* ------------------------------------------------------------------ */
/* River course (for wildlife that follows the water)                  */
/* ------------------------------------------------------------------ */

export interface RiverCourse {
  /** Total arc length of the smoothed centreline. */
  length: number;
  /** Point and unit tangent (downstream, +x) at arc length `s`. */
  at(s: number): { x: number; z: number; tx: number; tz: number };
  /** Arc length where the centreline crosses world x. */
  sAtX(x: number): number;
}

let course: RiverCourse | null = null;

export function getRiverCourse(): RiverCourse {
  if (course) return course;
  // Chaikin-smooth the authored polyline (open, endpoints kept) so offsets from it stay smooth.
  let pts: Pt[] = TERRAIN.river.points;
  for (let k = 0; k < 4; k++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = cum[cum.length - 1];

  const at = (s: number) => {
    const d = Math.max(0, Math.min(length, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const [a, b] = [pts[i - 1], pts[i]];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (d - cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / seg, tz: (b[1] - a[1]) / seg };
  };
  const sAtX = (x: number) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= x) {
        const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1);
        return cum[i - 1] + (cum[i] - cum[i - 1]) * Math.max(0, Math.min(1, t));
      }
    }
    return length;
  };
  course = { length, at, sAtX };
  return course;
}
