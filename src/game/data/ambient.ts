import { TERRAIN, type Pt } from './terrain-plan';

/**
 * Ambient life in Junction: villagers who wander the paths, each wearing its own
 * low-poly villager model. They are set dressing only — no dialogue, no interact
 * point, no name tag. (Rosa and Bram, the shopkeepers, stand at their shops instead.) They roam the whole
 * path network (`WANDER`): roads, the bridge and the stepping stones to the houses.
 */

export interface VillagerPlan {
  id: string;
  /** Rigged model (GLB url), built by scripts/build-pack-villager.py. */
  model: string;
  /** 1 = adult; kids are smaller. */
  scale?: number;
  /** Where they start; they set off from the nearest point of the path network. */
  start: Pt;
  /** Strolling speed (the hero walks at 3.8). */
  speed: number;
  /** Seconds spent idling when they stop (at a dead end, or now and then at a junction): [min, max]. */
  pause: [number, number];
}

/** Two path points closer than this are the same point; a point this near a segment joins it. */
const MERGE = 0.3;
const JOIN = 1.6;
/** Radius of the ring the roads meet on round the plaza (clear of the fountain and inside the benches). */
const PLAZA_RING = 3.8;

/**
 * The network villagers wander: every road, the bridge, and the stepping-stone walkways, as points
 * (`nodes`) and which of them are joined by a walkable straight line (`links`). Built from the
 * terrain plan: a walkway that starts just off a road is joined to the nearest point on it.
 */
function buildWander() {
  // Roads leaving the plaza start on a ring round it instead of at its centre, where the fountain
  // stands; the ring is walked as short chords between them.
  const [pcx, pcz] = TERRAIN.plaza.center;
  const ringAt = (a: number): Pt => [pcx + Math.cos(a) * PLAZA_RING, pcz + Math.sin(a) * PLAZA_RING];
  const exits: number[] = [];
  const roads = TERRAIN.paths.map((p) => {
    const pts = [...p.points];
    if (Math.hypot(pts[0][0] - pcx, pts[0][1] - pcz) < 0.1) {
      const a = Math.atan2(pts[1][1] - pcz, pts[1][0] - pcx);
      exits.push(a);
      pts[0] = ringAt(a);
    }
    return pts;
  });
  exits.sort((x, y) => x - y);
  const ring: Pt[] = [];
  exits.forEach((a, i) => {
    const b = i + 1 < exits.length ? exits[i + 1] : exits[0] + Math.PI * 2;
    const steps = Math.max(1, Math.ceil((b - a) / (Math.PI / 4)));
    for (let k = 0; k < steps; k++) ring.push(ringAt(a + ((b - a) * k) / steps));
  });
  ring.push(ring[0]);
  const lines: Pt[][] = [
    ...roads,
    ring,
    ...TERRAIN.walkways,
    // Across the bridge, between the two ends of the north path.
    [[-4, -11], [-4, -15.2]],
  ];
  const nodes: Pt[] = [];
  const node = (p: Pt) => {
    const i = nodes.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < MERGE);
    if (i >= 0) return i;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };
  let segs: [number, number][] = lines.flatMap((l) => l.slice(1).map((p, i) => [node(l[i]), node(p)] as [number, number]));
  // A point lying on (or just beside) a segment splits it there, so branches meet their road.
  for (let n = 0; n < nodes.length; n++) {
    const [px, pz] = nodes[n];
    const next: [number, number][] = [];
    for (const [a, b] of segs) {
      const [ax, az] = nodes[a];
      const [bx, bz] = nodes[b];
      const dx = bx - ax;
      const dz = bz - az;
      const t = ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz);
      const qx = ax + dx * t;
      const qz = az + dz * t;
      if (a !== n && b !== n && t > 0.02 && t < 0.98 && Math.hypot(px - qx, pz - qz) < JOIN) {
        const q = node([qx, qz]);
        next.push([a, q], [q, b]);
        if (q !== n) next.push([q, n]);
      } else next.push([a, b]);
    }
    segs = next;
  }
  const links: number[][] = nodes.map(() => []);
  for (const [a, b] of segs) {
    if (a === b || links[a].includes(b)) continue;
    links[a].push(b);
    links[b].push(a);
  }
  // A dead end just short of another path's end (a walkway starting past a road's end) joins it.
  nodes.forEach(([x, z], n) => {
    if (links[n].length !== 1) return;
    const m = nodes.findIndex(([mx, mz], i) => i !== n && !links[n].includes(i) && Math.hypot(mx - x, mz - z) < JOIN);
    if (m >= 0 && !links[m].includes(n)) {
      links[n].push(m);
      links[m].push(n);
    }
  });
  return { nodes, links };
}

export const WANDER = buildWander();

/** Each villager's own model, named after it. */
const model = (id: string) => `/models/villager-${id}.glb`;

export const VILLAGERS: VillagerPlan[] = [
  {
    id: 'fisher',
    model: model('fisher'),
    start: [-7.5, 0],
    speed: 1.3,
    pause: [3, 6],
  },
  {
    id: 'student',
    model: model('student'),
    scale: 0.86,
    start: [9, -1.4],
    speed: 1.9,
    pause: [1.5, 3],
  },
  {
    id: 'pond-walker',
    model: model('pond-walker'),
    scale: 0.86,
    start: [8.5, 12.8],
    speed: 1.2,
    pause: [2.5, 5],
  },
  {
    id: 'traveller',
    model: model('traveller'),
    start: [-4, -16.4],
    speed: 1.6,
    pause: [2, 4],
  },
];
