'use client';

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARPENTER_HOUSE, HOUSES, TERRAIN } from '@/game/data';
import { distToPaths, distToRiver, getRiverCourse, getTerrain, inWalkableArea, WATER_LEVEL, type ScatterItem } from '@/game/engine/terrain';
import { playerState } from '@/game/engine/world-state';

/**
 * Junction's wildlife: duck families paddling the river, frogs hopping between
 * lily pads and the banks, birds crossing the sky in every direction, and
 * butterflies drifting over the flower beds.
 *
 * Every species is a handful of InstancedMeshes (one per animated body part),
 * so the whole menagerie costs a few dozen draw calls. Each simulation is a
 * plain object updated from `useFrame`; models face +Z with feet/belly at y = 0.
 */

/* ------------------------------------------------------------------ */
/* Instanced rig helpers                                               */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];
type Piece = { geo: BufferGeometry; color?: string; pos?: V3; scale?: V3; rot?: V3 };

/** Merge primitive pieces into one geometry with baked vertex colours. */
function build(pieces: Piece[]): BufferGeometry {
  const c = new Color();
  const geos = pieces.map(({ geo, color = '#ffffff', pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0] }) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as BufferGeometry;
    g.scale(...scale);
    g.rotateX(rot[0]);
    g.rotateY(rot[1]);
    g.rotateZ(rot[2]);
    g.translate(...pos);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    c.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return g;
  });
  return mergeGeometries(geos)!;
}

const ball = (r = 1, w = 12, h = 9) => new SphereGeometry(r, w, h);

interface PartDef {
  geometry: BufferGeometry;
  /** Per-instance tint (multiplies the baked vertex colours). */
  tints?: string[];
  shadow?: boolean;
  doubleSide?: boolean;
  roughness?: number;
}

/** One InstancedMesh per body part; `put` writes root × local into an instance. */
class Rig {
  meshes: InstancedMesh[];
  private m = new Matrix4();

  constructor(parts: PartDef[], count: number) {
    this.meshes = parts.map((p) => {
      const material = new MeshStandardMaterial({
        vertexColors: true,
        roughness: p.roughness ?? 0.8,
        ...(p.doubleSide ? { side: DoubleSide } : {}),
      });
      const mesh = new InstancedMesh(p.geometry, material, count);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      // Instances move every frame, so a static bounding sphere would cull them wrongly.
      mesh.frustumCulled = false;
      mesh.castShadow = p.shadow ?? true;
      mesh.receiveShadow = true;
      if (p.tints) {
        const c = new Color();
        for (let i = 0; i < count; i++) mesh.setColorAt(i, c.set(p.tints[i % p.tints.length]));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      return mesh;
    });
  }

  put(part: number, index: number, root: Matrix4, local?: Matrix4) {
    this.meshes[part].setMatrixAt(index, local ? this.m.multiplyMatrices(root, local) : root);
  }

  commit() {
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    }
  }
}

const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

/** Compose a transform: translate, then yaw/pitch/roll (YXZ), then scale. */
function tr(out: Matrix4, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
  _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
  return out.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function angleTo(from: number, to: number, k: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

const ROOT = new Matrix4();
const LOCAL = new Matrix4();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Mount a simulation's meshes and step it every frame. */
function useCritters(create: () => { rig: Rig; update: (t: number, dt: number) => void }) {
  const sim = useMemo(() => create(), [create]);
  useEffect(() => () => sim.rig.dispose(), [sim]);
  useFrame((state, dt) => {
    sim.update(state.clock.elapsedTime, Math.min(dt, 1 / 20));
    sim.rig.commit();
  });
  return sim.rig.meshes;
}

function Meshes({ meshes }: { meshes: InstancedMesh[] }) {
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ducks                                                               */
/* ------------------------------------------------------------------ */

const DUCK_GEO = {
  body: () =>
    build([
      { geo: ball(0.16, 16, 12), scale: [0.85, 0.62, 1.2], pos: [0, 0.05, 0] },
      { geo: new ConeGeometry(0.07, 0.16, 8), rot: [-1.0, 0, 0], pos: [0, 0.1, -0.2] },
      // Folded wings, a shade darker than the body.
      ...[-1, 1].map((s) => ({ geo: ball(0.1, 10, 8), color: '#d6d2c8', scale: [0.35, 0.5, 1.15] as V3, pos: [s * 0.11, 0.09, -0.03] as V3 })),
    ]),
  head: () => build([{ geo: ball(0.095, 14, 10) }, { geo: ball(0.05, 8, 6), pos: [0, -0.06, -0.03], scale: [1, 1.4, 1] }]),
  face: () =>
    build([
      { geo: ball(0.05, 10, 6), color: '#f29a2e', scale: [0.9, 0.35, 1.3], pos: [0, -0.015, 0.1] },
      ...[-1, 1].map((s) => ({ geo: ball(0.016, 8, 6), color: '#1d1626', pos: [s * 0.06, 0.025, 0.07] as V3 })),
    ]),
};

/** Where the ducks are this frame, so frogs can hop out of their way. */
const duckWake: { x: number; z: number }[] = [];

interface Duck {
  scale: number;
  lag: number;
  dip: number;
  nextDip: number;
  yaw: number;
}

interface Family {
  s0: number;
  s1: number;
  theta: number;
  speed: number;
  ducks: Duck[];
}

function createDucks() {
  const river = getRiverCourse();
  const rand = mulberry32(7);
  // Each family loops a stretch of river clear of the bridge: down one side, back up the other.
  const plans = [
    { x0: 1.5, x1: 20, tints: { body: ['#fbf8f1', '#ffd84a', '#ffd84a', '#ffd84a'], head: ['#fbf8f1', '#ffd84a', '#ffd84a', '#ffd84a'] }, sizes: [1, 0.55, 0.55, 0.5] },
    { x0: -21, x1: -8.5, tints: { body: ['#c9c3b6', '#a47c55'], head: ['#2f7d4a', '#a47c55'] }, sizes: [1.05, 0.95] },
  ];
  const families: Family[] = plans.map((p) => ({
    s0: river.sAtX(p.x0),
    s1: river.sAtX(p.x1),
    theta: rand() * Math.PI * 2,
    speed: 0.42 + rand() * 0.1,
    ducks: p.sizes.map((scale, i) => ({ scale, lag: i, dip: 0, nextDip: 4 + rand() * 8, yaw: 0 })),
  }));
  const bodyTints = plans.flatMap((p) => p.tints.body);
  const headTints = plans.flatMap((p) => p.tints.head);
  const count = bodyTints.length;
  const rig = new Rig(
    [
      { geometry: DUCK_GEO.body(), tints: bodyTints },
      { geometry: DUCK_GEO.head(), tints: headTints },
      { geometry: DUCK_GEO.face(), shadow: false, roughness: 0.5 },
    ],
    count
  );

  const LATERAL = 0.65;
  const posAt = (f: Family, theta: number) => {
    const s = f.s0 + ((f.s1 - f.s0) * (1 - Math.cos(theta))) / 2;
    const p = river.at(s);
    const off = Math.sin(theta) * LATERAL;
    // Left-hand normal of the downstream tangent.
    return { x: p.x - p.tz * off, z: p.z + p.tx * off };
  };
  const rate = (f: Family, theta: number) => {
    const a = posAt(f, theta - 0.01);
    const b = posAt(f, theta + 0.01);
    return Math.max(0.05, Math.hypot(b.x - a.x, b.z - a.z) / 0.02);
  };

  const update = (t: number, dt: number) => {
    let idx = 0;
    duckWake.length = 0;
    for (const f of families) {
      // Constant swimming speed along the loop, whatever its shape.
      f.theta += (dt * f.speed) / rate(f, f.theta);
      let theta = f.theta;
      for (const d of f.ducks) {
        if (d.lag > 0) theta -= (0.42 * (d.scale + 0.5)) / rate(f, theta);
        const p = posAt(f, theta);
        const q = posAt(f, theta + 0.02);
        duckWake.push(p);
        d.yaw = angleTo(d.yaw, Math.atan2(q.x - p.x, q.z - p.z), 1 - Math.exp(-dt * 6));
        // Dabbling: tip forward, head under, now and then.
        if (t > d.nextDip) {
          d.dip = 1.4;
          d.nextDip = t + 7 + Math.random() * 10;
        }
        d.dip = Math.max(0, d.dip - dt);
        const dipAmt = d.dip > 0 ? Math.sin((d.dip / 1.4) * Math.PI) : 0;
        const bob = Math.sin(t * 2.3 + idx * 1.7) * 0.012;
        const roll = Math.sin(t * 1.9 + idx) * 0.04;
        tr(ROOT, p.x, WATER_LEVEL + bob - 0.02, p.z, d.yaw, dipAmt * 0.5, roll, d.scale);
        rig.put(0, idx, ROOT);
        // Ducklings have proportionally bigger heads.
        const hs = d.scale < 0.7 ? 1.25 : 1;
        tr(LOCAL, 0, 0.21 - dipAmt * 0.12, 0.15 + dipAmt * 0.05, Math.sin(t * 0.8 + idx * 2) * 0.35 * (1 - dipAmt), dipAmt * 1.1, 0, hs);
        rig.put(1, idx, ROOT, LOCAL);
        rig.put(2, idx, ROOT, LOCAL);
        idx++;
      }
    }
  };
  return { rig, update };
}

function Ducks() {
  return <Meshes meshes={useCritters(createDucks)} />;
}

/* ------------------------------------------------------------------ */
/* Frogs                                                               */
/* ------------------------------------------------------------------ */

const FROG_GEO = {
  body: () =>
    build([
      { geo: ball(0.1, 14, 10), scale: [1.05, 0.62, 1.15], pos: [0, 0.06, 0] },
      { geo: ball(0.075, 12, 8), color: '#f2f0c8', scale: [1, 0.5, 1.1], pos: [0, 0.035, 0.03] },
      // Haunches and feet.
      ...[-1, 1].flatMap((s) => [
        { geo: ball(0.05, 10, 8), scale: [0.9, 0.75, 1.5] as V3, pos: [s * 0.09, 0.04, -0.05] as V3 },
        { geo: ball(0.03, 8, 6), scale: [1.3, 0.4, 1.6] as V3, pos: [s * 0.11, 0.01, 0.03] as V3 },
        { geo: ball(0.022, 8, 6), scale: [1, 0.5, 1.5] as V3, pos: [s * 0.06, 0.01, 0.11] as V3 },
      ]),
      // Eye bumps.
      ...[-1, 1].map((s) => ({ geo: ball(0.035, 10, 8), pos: [s * 0.05, 0.11, 0.06] as V3 })),
    ]),
  eyes: () =>
    build(
      [-1, 1].flatMap((s) => [
        { geo: ball(0.026, 10, 8), color: '#fffbe8', pos: [s * 0.055, 0.125, 0.075] as V3 },
        { geo: ball(0.014, 8, 6), color: '#141018', pos: [s * 0.062, 0.13, 0.095] as V3 },
      ])
    ),
  sac: () => build([{ geo: ball(0.045, 12, 8), scale: [1, 0.8, 0.9] }]),
};

interface Spot {
  x: number;
  y: number;
  z: number;
  taken: boolean;
}

interface Frog {
  spot: Spot;
  from: { x: number; y: number; z: number };
  hop: number;
  yaw: number;
  nextHop: number;
  nextCroak: number;
  croak: number;
}

function createFrogs() {
  const { scatter } = getTerrain();
  const rand = mulberry32(5);
  const river = getRiverCourse();
  const hw = TERRAIN.river.halfWidth;
  const bridge = TERRAIN.bridges[0];

  // Lily pads plus a string of spots on both banks, just above the waterline.
  const spots: Spot[] = scatter.lilies.map((l) => ({ x: l.x, y: l.y + 0.005, z: l.z, taken: false }));
  for (let s = 2; s < river.length - 2; s += 1.6) {
    const p = river.at(s);
    for (const side of [-1, 1]) {
      const off = (hw + 0.5) * side;
      const x = p.x - p.tz * off;
      const z = p.z + p.tx * off;
      const interior = inWalkableArea(x, z, 0.5);
      const clearOfBridge = Math.abs(x - bridge.center[0]) > bridge.width / 2 + 1.2;
      if (interior && clearOfBridge && distToPaths(x, z) > 0.3 && distToRiver(x, z) > hw + 0.1 && rand() < 0.6) spots.push({ x, y: 0, z, taken: false });
    }
  }
  const FROGS = 7;
  const frogs: Frog[] = [];
  for (let i = 0; i < FROGS && i < spots.length; i++) {
    const spot = spots[Math.floor(((i + rand() * 0.8) / FROGS) * spots.length)];
    if (spot.taken) continue;
    spot.taken = true;
    frogs.push({ spot, from: { ...spot }, hop: 0, yaw: rand() * Math.PI * 2, nextHop: 2 + rand() * 6, nextCroak: 1 + rand() * 5, croak: 0 });
  }

  const tints = ['#5d9c3e', '#76a83f', '#4d8a52', '#8aa83a'];
  const rig = new Rig(
    [
      { geometry: FROG_GEO.body(), tints },
      { geometry: FROG_GEO.eyes(), shadow: false, roughness: 0.3 },
      { geometry: FROG_GEO.sac(), tints: ['#e8efb0'], shadow: false, roughness: 0.4 },
    ],
    frogs.length
  );

  const HOP = 0.55;
  const hopTo = (f: Frog, t: number, away?: { x: number; z: number }) => {
    const options = spots.filter((s) => !s.taken && Math.hypot(s.x - f.spot.x, s.z - f.spot.z) < 2.8 && Math.hypot(s.x - f.spot.x, s.z - f.spot.z) > 0.5);
    if (!options.length) {
      f.nextHop = t + 2;
      return;
    }
    const pick = away
      ? options.reduce((a, b) => (Math.hypot(b.x - away.x, b.z - away.z) > Math.hypot(a.x - away.x, a.z - away.z) ? b : a))
      : options[Math.floor(Math.random() * options.length)];
    f.from = { x: f.spot.x, y: f.spot.y, z: f.spot.z };
    f.spot.taken = false;
    pick.taken = true;
    f.spot = pick;
    f.hop = HOP;
    f.yaw = Math.atan2(pick.x - f.from.x, pick.z - f.from.z);
    f.nextHop = t + HOP + 4 + Math.random() * 8;
  };

  const update = (t: number, dt: number) => {
    frogs.forEach((f, i) => {
      // Hop away from the hero, or from a duck paddling up to its lily pad.
      const duck = f.spot.y < 0 ? duckWake.find((d) => Math.hypot(d.x - f.spot.x, d.z - f.spot.z) < 0.75) : undefined;
      const hero = Math.hypot(playerState.position.x - f.spot.x, playerState.position.z - f.spot.z) < 1.5 ? playerState.position : undefined;
      const threat = hero ?? duck;
      if (f.hop <= 0 && (t > f.nextHop || threat)) hopTo(f, t, threat);

      let x = f.spot.x;
      let y = f.spot.y;
      let z = f.spot.z;
      let pitch = 0;
      let squash = 1;
      if (f.hop > 0) {
        f.hop = Math.max(0, f.hop - dt);
        const k = 1 - f.hop / HOP;
        const d = Math.hypot(f.spot.x - f.from.x, f.spot.z - f.from.z);
        x = f.from.x + (f.spot.x - f.from.x) * k;
        z = f.from.z + (f.spot.z - f.from.z) * k;
        y = f.from.y + (f.spot.y - f.from.y) * k + Math.sin(k * Math.PI) * (0.35 + d * 0.12);
        pitch = (0.5 - k) * 1.1;
        squash = 1.15;
      } else if (t > f.nextCroak) {
        f.croak = 1.2;
        f.nextCroak = t + 3 + Math.random() * 6;
      }
      f.croak = Math.max(0, f.croak - dt);
      const breathe = 1 + Math.sin(t * 3 + i) * 0.02;
      tr(ROOT, x, y, z, f.yaw, -pitch, 0, 1.15, (1.15 / squash) * breathe, 1.15 * squash);
      rig.put(0, i, ROOT);
      rig.put(1, i, ROOT);
      // Throat sac: three quick puffs per croak.
      const puff = f.croak > 0 ? Math.max(0, Math.sin(f.croak * Math.PI * 2.5)) : 0;
      if (puff > 0.02) {
        tr(LOCAL, 0, 0.045, 0.1, 0, 0, 0, 0.4 + puff * 0.9);
        rig.put(2, i, ROOT, LOCAL);
      } else rig.put(2, i, HIDDEN);
    });
  };
  return { rig, update };
}

function Frogs() {
  return <Meshes meshes={useCritters(createFrogs)} />;
}

/* ------------------------------------------------------------------ */
/* Birds                                                               */
/* ------------------------------------------------------------------ */

const BIRD_GEO = {
  body: () =>
    build([
      { geo: ball(0.07, 14, 10), scale: [0.9, 0.85, 1.9] },
      { geo: ball(0.055, 12, 10), pos: [0, 0.035, 0.13] },
      { geo: new ConeGeometry(0.018, 0.06, 6), color: '#f0a030', rot: [Math.PI / 2, 0, 0], pos: [0, 0.03, 0.2] },
      ...[-1, 1].map((s) => ({ geo: ball(0.01, 6, 5), color: '#141018', pos: [s * 0.04, 0.05, 0.165] as V3 })),
      { geo: ball(0.06, 10, 6), color: '#d9dde2', scale: [0.9, 0.18, 1.4], pos: [0, 0.01, -0.17] },
    ]),
  /** Right wing, hinged at x = 0; the left wing is its mirror. */
  wing: (side: 1 | -1) =>
    build([
      { geo: ball(0.1, 12, 8), scale: [1.3, 0.16, 0.75], pos: [side * 0.12, 0, 0] },
      { geo: ball(0.08, 12, 8), color: '#8f969e', scale: [1.4, 0.13, 0.55], pos: [side * 0.3, 0, -0.015] },
    ]),
};

interface Flock {
  x: number;
  y: number;
  z: number;
  heading: number;
  turn: number;
  speed: number;
  birds: { dx: number; dz: number; dy: number; phase: number }[];
}

const SKY_RADIUS = 38;

function createBirds() {
  const rand = mulberry32(3);
  const sizes = [3, 1, 2, 1, 3, 1];
  const flocks: Flock[] = [];
  const launch = (f: Flock, fromEdge: boolean, r: () => number) => {
    f.heading = r() * Math.PI * 2;
    f.turn = (r() - 0.5) * 0.12;
    f.speed = 3.6 + r() * 2.2;
    f.y = 4.6 + r() * 3.2;
    if (fromEdge) {
      // Enter from the far side of the heading, passing somewhere over the island.
      const side = (r() - 0.5) * 30;
      f.x = -Math.sin(f.heading) * SKY_RADIUS + Math.cos(f.heading) * side;
      f.z = -Math.cos(f.heading) * SKY_RADIUS - Math.sin(f.heading) * side;
    } else {
      f.x = (r() - 0.5) * 50;
      f.z = (r() - 0.5) * 42;
    }
  };
  for (const n of sizes) {
    const f: Flock = { x: 0, y: 0, z: 0, heading: 0, turn: 0, speed: 0, birds: [] };
    launch(f, false, rand);
    // A loose V behind the leader.
    for (let k = 0; k < n; k++) {
      const row = Math.ceil(k / 2);
      const side = k % 2 ? -1 : 1;
      f.birds.push({ dx: side * row * 0.8, dz: -row * 0.75, dy: row * 0.12, phase: rand() * 6 });
    }
    flocks.push(f);
  }
  const count = flocks.reduce((n, f) => n + f.birds.length, 0);
  const tints = ['#ffffff', '#f4efe6', '#8fb2d9', '#ffffff', '#c9a27a'];
  const rig = new Rig(
    [
      { geometry: BIRD_GEO.body(), tints },
      { geometry: BIRD_GEO.wing(1), tints },
      { geometry: BIRD_GEO.wing(-1), tints },
    ],
    count
  );

  const update = (t: number, dt: number) => {
    let idx = 0;
    for (const f of flocks) {
      f.heading += f.turn * dt + Math.sin(t * 0.25 + f.speed) * 0.04 * dt;
      f.x += Math.sin(f.heading) * f.speed * dt;
      f.z += Math.cos(f.heading) * f.speed * dt;
      if (Math.hypot(f.x, f.z) > SKY_RADIUS + 2) launch(f, true, Math.random);
      const c = Math.cos(f.heading);
      const s = Math.sin(f.heading);
      for (const b of f.birds) {
        const x = f.x + b.dx * c + b.dz * s;
        const z = f.z - b.dx * s + b.dz * c;
        // Bursts of flapping, then a glide.
        const cycle = (t * 0.35 + b.phase) % 3;
        const flapping = cycle < 1.9;
        const flap = flapping ? Math.sin(t * 13 + b.phase * 3) : 0;
        const wing = flapping ? flap * 0.75 : 0.12 + Math.sin(t * 2 + b.phase) * 0.05;
        const y = f.y + b.dy + flap * 0.04 + Math.sin(t * 0.9 + b.phase) * 0.15;
        tr(ROOT, x, y, z, f.heading, -flap * 0.05, -f.turn * 3, 0.9);
        rig.put(0, idx, ROOT);
        tr(LOCAL, 0.04, 0.02, 0.02, 0, 0, wing);
        rig.put(1, idx, ROOT, LOCAL);
        tr(LOCAL, -0.04, 0.02, 0.02, 0, 0, -wing);
        rig.put(2, idx, ROOT, LOCAL);
        idx++;
      }
    }
  };
  return { rig, update };
}

function Birds() {
  return <Meshes meshes={useCritters(createBirds)} />;
}

/* ------------------------------------------------------------------ */
/* Butterflies                                                         */
/* ------------------------------------------------------------------ */

const BUTTERFLY_GEO = {
  body: () =>
    build([
      { geo: new CapsuleGeometry(0.014, 0.08, 4, 6), color: '#2b2230', rot: [Math.PI / 2, 0, 0] },
      ...[-1, 1].map((s) => ({ geo: new CapsuleGeometry(0.003, 0.06, 2, 4), color: '#2b2230', rot: [0.9, 0, s * 0.35] as V3, pos: [s * 0.012, 0.025, 0.06] as V3 })),
    ]),
  /** Fore + hind wing on one side, lying flat in XZ, hinged at x = 0. */
  wing: (side: 1 | -1) =>
    build([
      { geo: new CircleGeometry(1, 18), rot: [-Math.PI / 2, 0, 0], scale: [0.1, 0.075, 1], pos: [side * 0.085, 0, 0.035] },
      { geo: new CircleGeometry(1, 16), rot: [-Math.PI / 2, 0, 0], scale: [0.075, 0.06, 1], pos: [side * 0.065, -0.001, -0.045] },
      // Dark wing tips and a spot.
      { geo: new CircleGeometry(1, 12), color: '#2b2230', rot: [-Math.PI / 2, 0, 0], scale: [0.035, 0.03, 1], pos: [side * 0.15, 0.002, 0.055] },
      { geo: new CircleGeometry(1, 10), color: '#fff8e8', rot: [-Math.PI / 2, 0, 0], scale: [0.016, 0.016, 1], pos: [side * 0.07, 0.002, -0.045] },
    ]),
};

interface Butterfly {
  x: number;
  y: number;
  z: number;
  home: ScatterItem;
  tx: number;
  ty: number;
  tz: number;
  yaw: number;
  rest: number;
  phase: number;
}

/** Inside a house, or out over the raised rim or the ridge — places a low-flying butterfly must not go. */
function blocked(x: number, z: number) {
  if (!inWalkableArea(x, z, 0.6)) return true;
  const houses = [...HOUSES, { ...CARPENTER_HOUSE, rot: 0 }];
  return houses.some((h) => {
    const turned = Math.abs(Math.sin(h.rot)) > 0.5;
    const hw = (turned ? h.d : h.w) / 2 + 0.7;
    const hd = (turned ? h.w : h.d) / 2 + 0.7;
    return Math.abs(x - h.x) < hw && Math.abs(z - h.z) < hd;
  });
}

function createButterflies() {
  const { scatter } = getTerrain();
  const rand = mulberry32(13);
  const flowers = scatter.flowers;
  const COUNT = Math.min(16, flowers.length);
  const butterflies: Butterfly[] = Array.from({ length: COUNT }, (_, i) => {
    const homes = flowers.filter((f) => !blocked(f.x, f.z));
    const home = homes[Math.floor(((i + rand()) / COUNT) * homes.length)];
    return { x: home.x, y: 1, z: home.z, home, tx: home.x, ty: 1, tz: home.z, yaw: rand() * 6, rest: 0, phase: rand() * 10 };
  });
  const tints = ['#ffd23f', '#ff8a3d', '#ffffff', '#7fc8f8', '#ff9ec7', '#c39bff', '#fff3a0'];
  const rig = new Rig(
    [
      { geometry: BUTTERFLY_GEO.body(), shadow: false },
      { geometry: BUTTERFLY_GEO.wing(1), tints, shadow: false, doubleSide: true, roughness: 0.6 },
      { geometry: BUTTERFLY_GEO.wing(-1), tints, shadow: false, doubleSide: true, roughness: 0.6 },
    ],
    COUNT
  );

  const near = (home: ScatterItem) => flowers.filter((f) => Math.hypot(f.x - home.x, f.z - home.z) < 5 && !blocked(f.x, f.z));
  const nearby = butterflies.map((b) => near(b.home));

  const retarget = (b: Butterfly, i: number, fleeFrom?: { x: number; z: number }) => {
    if (fleeFrom) {
      const a = Math.atan2(b.x - fleeFrom.x, b.z - fleeFrom.z) + (Math.random() - 0.5);
      b.tx = b.x + Math.sin(a) * 3;
      b.tz = b.z + Math.cos(a) * 3;
      if (blocked(b.tx, b.tz)) {
        b.tx = b.home.x;
        b.tz = b.home.z;
      }
      b.ty = 1.4 + Math.random() * 0.8;
      return;
    }
    const options = nearby[i];
    if (options.length && Math.random() < 0.35) {
      // Head for a flower and settle on it.
      const f = options[Math.floor(Math.random() * options.length)];
      b.tx = f.x;
      b.tz = f.z;
      b.ty = 0.2 * f.s + 0.02;
      return;
    }
    for (let tries = 0; tries < 6; tries++) {
      b.tx = b.home.x + (Math.random() - 0.5) * 7;
      b.tz = b.home.z + (Math.random() - 0.5) * 7;
      if (!blocked(b.tx, b.tz) && !blocked((b.x + b.tx) / 2, (b.z + b.tz) / 2)) break;
      b.tx = b.home.x;
      b.tz = b.home.z;
    }
    b.ty = 0.5 + Math.random() * 1.4;
  };

  const update = (t: number, dt: number) => {
    butterflies.forEach((b, i) => {
      const pdx = b.x - playerState.position.x;
      const pdz = b.z - playerState.position.z;
      const startled = Math.hypot(pdx, pdz) < 1.3;
      let wing: number;
      if (b.rest > 0 && !startled) {
        // Perched: wings slowly fold and open.
        b.rest -= dt;
        wing = 1.1 + Math.sin(t * 2.2 + b.phase) * 0.35;
        if (b.rest <= 0) retarget(b, i);
      } else {
        if (startled && b.rest > 0) {
          b.rest = 0;
          retarget(b, i, playerState.position);
        }
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const dz = b.tz - b.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.12 && Math.abs(dy) < 0.12) {
          // Arrived: perch if it was a flower, otherwise wander on.
          if (b.ty < 0.4) b.rest = 2 + Math.random() * 4;
          else retarget(b, i);
        }
        if (dist < 0.45) {
          // Final approach: home straight in so it can actually land.
          const k = 1 - Math.exp(-dt * 4);
          b.x += dx * k;
          b.z += dz * k;
        } else {
          const desired = Math.atan2(dx, dz) + Math.sin(t * 1.7 + b.phase) * 0.6;
          b.yaw = angleTo(b.yaw, desired, 1 - Math.exp(-dt * 3));
          const speed = Math.min(1.5, dist * 1.5 + 0.25);
          b.x += Math.sin(b.yaw) * speed * dt;
          b.z += Math.cos(b.yaw) * speed * dt;
        }
        b.y += dy * (1 - Math.exp(-dt * 1.8));
        wing = Math.sin(t * 26 + b.phase) * 0.95 + 0.25;
      }
      const flutter = b.rest > 0 ? 0 : Math.sin(t * 26 + b.phase) * 0.03;
      tr(ROOT, b.x, b.y + flutter, b.z, b.yaw, b.rest > 0 ? 0 : -0.25, 0, 1);
      rig.put(0, i, ROOT);
      tr(LOCAL, 0.008, 0, 0, 0, 0, wing);
      rig.put(1, i, ROOT, LOCAL);
      tr(LOCAL, -0.008, 0, 0, 0, 0, -wing);
      rig.put(2, i, ROOT, LOCAL);
    });
  };
  // Start everyone mid-wander rather than all at once.
  butterflies.forEach((b, i) => {
    retarget(b, i);
    b.y = 0.6 + rand();
  });
  return { rig, update };
}

function Butterflies() {
  return <Meshes meshes={useCritters(createButterflies)} />;
}

export function Wildlife() {
  return (
    <>
      <Ducks />
      <Frogs />
      <Birds />
      <Butterflies />
    </>
  );
}
