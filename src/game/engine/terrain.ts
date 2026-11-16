import { CLEAR_ZONES, FARM, HOUSES, MEADOW, ORCHARD, RIDGE, SIGNPOSTS, TERRAIN, type Pt } from '@/game/data/terrain-plan';
import { GREENHOUSE_EXTERIOR } from '@/game/data/world-layout';

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

/**
 * Inside the walkable island, at least `margin` from its rim and from the ridge (the cutting through
 * the ridge narrows by `margin` too).
 */
export function inWalkableArea(x: number, z: number, margin = 0) {
  const { rimInner } = TERRAIN;
  if (Math.abs(x) >= rimInner.x - margin || z >= rimInner.z - margin || z <= -rimInner.north + margin) return false;
  return !(z > RIDGE.z[0] - margin && z < RIDGE.z[1] + margin && Math.abs(x - RIDGE.cut.x) >= RIDGE.cut.half - margin);
}

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
 * Keeps small props off the greenhouse floor. Applied after scattering, so the random
 * layout of everything else stays exactly as it was before the greenhouse existed.
 */
const offGreenhouse = (p: { x: number; z: number }) =>
  Math.abs(p.x - GREENHOUSE_EXTERIOR.x) > GREENHOUSE_EXTERIOR.w / 2 + 0.5 || Math.abs(p.z - GREENHOUSE_EXTERIOR.z) > GREENHOUSE_EXTERIOR.d / 2 + 0.5;

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

/** The raised rim round the island, and the ridge between the river and the north bank (but not its cutting). */
function isRim(x: number, z: number) {
  const { rimInner } = TERRAIN;
  if (Math.abs(x) > rimInner.x || z > rimInner.z || z < -rimInner.north) return true;
  return z > RIDGE.z[0] && z < RIDGE.z[1] && Math.abs(x - RIDGE.cut.x) >= RIDGE.cut.half;
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
    nx: Math.round((extent.x * 2) / cell),
    nz: Math.round((extent.north + extent.z) / cell),
    x0: -extent.x,
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

function lanternsAlongPaths(): ScatterItem[] {
  const out: ScatterItem[] = [];
  const near = (x: number, z: number) => out.some((l) => Math.hypot(l.x - x, l.z - z) < 3.2);
  TERRAIN.paths.forEach((path, pi) => {
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
        if (distToRiver(x, z) < TERRAIN.river.halfWidth + 0.8 || isRim(x, z) || inHouse(x, z, 0.6) || near(x, z)) continue;
        if (distToPaths(x, z) < 0.25 || distToWalkways(x, z) < 0.8) continue;
        out.push({ x, z, y: 0, s: 1, rot: 0, v: 0 });
      }
    }
  });
  // Ring of lanterns around the plaza, skipping path mouths.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    const r = TERRAIN.plaza.radius + 0.5;
    const x = TERRAIN.plaza.center[0] + Math.sin(a) * r;
    const z = TERRAIN.plaza.center[1] + Math.cos(a) * r;
    const onPath = TERRAIN.paths.some((p) => distToPolyline(x, z, p.points) < p.halfWidth + 0.4);
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

/** The orchard's apple trees, in staggered rows. */
function orchardTrees(): ScatterItem[] {
  const out: ScatterItem[] = [];
  for (let r = 0; r < ORCHARD.rows; r++) {
    for (let c = 0; c < ORCHARD.cols; c++) {
      out.push({
        x: ORCHARD.x + (c - (ORCHARD.cols - 1) / 2 + (r % 2 ? 0.5 : 0) - 0.25) * ORCHARD.gap,
        z: ORCHARD.z + (r - (ORCHARD.rows - 1) / 2) * ORCHARD.gap,
        y: 0,
        s: 0.85 + ((r * 7 + c * 3) % 4) * 0.05,
        rot: r * 1.3 + c * 2.1,
        v: (r + c) % 3,
      });
    }
  }
  return out;
}

const inOrchard = (x: number, z: number, margin: number) =>
  Math.abs(x - ORCHARD.x) < (ORCHARD.cols / 2 + 0.25) * ORCHARD.gap + margin && Math.abs(z - ORCHARD.z) < (ORCHARD.rows / 2) * ORCHARD.gap + margin;

let cached: TerrainData | null = null;

export function getTerrain(): TerrainData {
  if (cached) return cached;
  const g = makeGrid();
  const { river, extent } = TERRAIN;

  const isWater = (x: number, z: number) => distToRiver(x, z) < river.halfWidth;
  const land = buildMask(g, (x, z) => !isWater(x, z));
  const rim = buildMask(g, (x, z) => !isWater(x, z) && isRim(x, z));
  const paths = buildMask(g, (x, z) => !isWater(x, z) && !isRim(x, z) && distToPaths(x, z) < 0);
  const water = buildMask(g, (x, z) => isWater(x, z) && !onBridge(x, z, -0.15));

  const lanterns = lanternsAlongPaths().filter(clearOfSignposts(1.3));
  const coreRim = (x: number, z: number) => Math.abs(x) > CORE.rimX || Math.abs(z) > CORE.rimZ;
  const core = dress(
    mulberry32(11),
    {
      box: { cx: 0, cz: 0, hx: CORE.x - 0.8, hz: CORE.z - 0.8 },
      interior: (x, z) => !coreRim(x, z) && Math.abs(x) < CORE.x && Math.abs(z) < CORE.z,
      rim: (x, z) => coreRim(x, z) && Math.abs(x) < CORE.x - 0.9 && Math.abs(z) < CORE.z - 0.9,
      paths: TERRAIN.paths.filter((p) => southOfRidge(p.points)),
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
      box: { cx: 0, cz: (northZ - extent.north + 0.8) / 2, hx: extent.x - 0.8, hz: (northZ + extent.north - 0.8) / 2 },
      interior: (x, z) => z < northZ && !isRim(x, z) && !inOrchard(x, z, 0.6),
      rim: (x, z) => z < northZ && isRim(x, z) && Math.abs(x) < extent.x - 0.9 && z > -extent.north + 0.9,
      paths: TERRAIN.paths,
      walkways: TERRAIN.walkways,
      near: [...core.trees, ...orchard],
      count: { trees: 34, rimTrees: 24, pathHedges: 14, bushes: 22, flowers: 110, tufts: 150, rocks: 0, lilies: 0, cattails: 0 },
    },
    lanterns
  );
  // A wildflower meadow in the east corner, thick with flowers.
  const meadowRand = mulberry32(47);
  const meadow = scatter(
    meadowRand,
    { cx: MEADOW.x, cz: MEADOW.z, hx: MEADOW.r, hz: MEADOW.r },
    70,
    0.5,
    (x, z) => Math.hypot(x - MEADOW.x, z - MEADOW.z) < MEADOW.r && inWalkableArea(x, z, 0.4) && distToPaths(x, z) > 0.4 && !inHouse(x, z, 0.4),
    () => ({ s: 0.75 + meadowRand() * 0.6 }),
    [...north.trees, ...north.hedges]
  );

  const trees = [...core.trees.filter(clearOfCutting), ...north.trees, ...orchard];
  cached = {
    land: contours(g, land, 3),
    rim: contours(g, rim, 3),
    paths: contours(g, paths, 3),
    waterColliders: waterColliders(g, water),
    rimHeight: RIM_HEIGHT,
    scatter: {
      trees,
      hedges: [...core.hedges.filter(clearOfCutting), ...north.hedges],
      flowers: [...core.flowers, ...north.flowers, ...meadow].filter(offGreenhouse),
      tufts: [...core.tufts, ...north.tufts].filter(offGreenhouse),
      rocks: core.rocks,
      lanterns: lanterns.filter(offGreenhouse),
      lilies: core.lilies,
      cattails: core.cattails,
      // Every orchard tree has dropped one.
      apples: [...applesUnder(core.trees), ...applesUnder(north.trees), ...orchard.map((t, i) => ({ ...t, x: t.x + (i % 2 ? 0.7 : -0.6), z: t.z + 0.7, s: 1 }))],
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
