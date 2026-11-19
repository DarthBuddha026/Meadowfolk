import { TERRAIN, type Pt } from './terrain-plan';
import { SHOP_SPOTS } from './world-layout';

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
  /** 1 = adult (adults spend the evening at the tavern); kids are smaller. */
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

/** The tavern's doorstep, where the evening's regulars go in and come back out (a spur off the field road). */
export const TAVERN_DOOR: Pt = [SHOP_SPOTS.tavern.counter[0], SHOP_SPOTS.tavern.counter[1] + 0.2];

/**
 * Where the regulars stand inside the tavern, as offsets from the room's centre (see SHOP_ROOMS),
 * and the point each faces: either side of the table by the fire (the adult villagers, in order),
 * then the bar (the shopkeepers, see TAVERN_PATRONS), then the east table.
 */
export const TAVERN_SPOTS: { at: Pt; look: Pt }[] = [
  { at: [-2.0, 1.25], look: [-3.8, 1.25] },
  { at: [-3.8, 1.25], look: [-2.0, 1.25] },
  { at: [-1.52, -0.85], look: [-1.52, -2.6] },
  { at: [1.52, -0.85], look: [1.52, -2.6] },
  { at: [2.25, 1.0], look: [3.1, 0.3] },
];

/**
 * Regulars who don't walk the town: Rosa and Bram, done with their shops for the day, come straight
 * to the tavern and stand at the bar (their spot in TAVERN_SPOTS) for their own hours (`tavernVisit`).
 */
export const TAVERN_PATRONS: { id: string; name: string; model: string; spot: number }[] = [
  { id: 'rosa', name: 'Rosa', model: SHOP_SPOTS.store.model, spot: 2 },
  { id: 'bram', name: 'Bram', model: SHOP_SPOTS.carpenter.model, spot: 3 },
];

/** The regulars' evening at the tavern: from 6 PM to 10 PM (in-game minutes since 6:00). */
export const TAVERN_EVENING = { from: 720, to: 960 };

/**
 * When a regular heads for the tavern and when they leave, on a given day: random, but the same all
 * day (and for everyone on the farm, since it comes from the day). They set off between 6 and 7 PM
 * and leave between 8:45 and 10 PM: even a long walk across town gets them there by about 8, so from
 * then until 8:45 PM everyone is in at once.
 */
export function tavernVisit(id: string, day: string): { go: number; leave: number } {
  let h = 2166136261;
  for (const ch of id + '@' + day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const { from, to } = TAVERN_EVENING;
  const go = from + Math.round(rand() * 60);
  const leave = to - 75 + Math.round(rand() * 75);
  return { go, leave };
}

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
    // Up from the field road to the tavern's door.
    [[TAVERN_DOOR[0], 10.5], TAVERN_DOOR],
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
