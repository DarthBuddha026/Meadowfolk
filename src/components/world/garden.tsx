'use client';

import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import {
  CatmullRomCurve3,
  CylinderGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
} from 'three';
import { GARDEN, GREENHOUSE, getSurface, type Vec3 } from '@/game/data';
import { pumpRunning } from '@/game/data/mission-2/challenge';
import { setAmbient } from '@/game/engine/sound';
import { playerState } from '@/game/engine/world-state';
import { useSession } from '@/game/state/session-store';
import { useDeviceFields, useMissionContext } from '@/game/state/use-mission';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * Mika's greenhouse floor (Mission 2, The Pump That Won't Quit), laid out to her plan:
 * two farm areas, the water tank and pump between them at the back, puddles down the
 * aisle, and the tech area by the door with the control box on its post — the TRIOE board and an active-LOW relay module. The pump
 * runs whenever the sketch on the board says so *in the relay's language*: the world
 * follows `pumpRunning()` from the mission's challenge, never the sketch's comments.
 */

const FONT = '"JetBrains Mono", "Cascadia Code", Consolas, monospace';
const dummy = new Object3D();

/** Is the pump running right now? Shared by every garden prop through a frame-updated ref. */
export function usePumpState() {
  const fields = useDeviceFields('mission-2');
  const current = useMissionContext((c) => c.missionId) === 'mission-2';
  const bootedAt = useSession((s) => (current ? s.bootedAt : 0));
  const state = useRef({ running: false });
  useFrame(() => {
    const t = bootedAt > 0 ? (performance.now() - bootedAt) / 1000 : Infinity;
    state.current.running = pumpRunning(fields, t);
  });
  return state;
}

export type PumpState = ReturnType<typeof usePumpState>;

/** One crop: lettuce (three leafy balls) or a staked tomato. */
interface Crop {
  x: number;
  z: number;
  kind: 'lettuce' | 'tomato';
  s: number;
}

const SOIL_TOP = 0.35;

/**
 * A farm area: a big raised plot of soaked soil planted in rows along its length,
 * alternating lettuce and tomatoes. Crops are instanced — one mesh per part for every plot.
 */
function FarmPlot({ center, size }: { center: Vec3; size: [number, number] }) {
  const m = getWorldMaterials();
  const [w, d] = size;
  return (
    <RigidBody type="fixed" colliders={false} position={center}>
      <CuboidCollider args={[w / 2, 0.2, d / 2]} position={[0, 0.2, 0]} />
      <RoundedBox args={[w, 0.34, d]} radius={0.05} position={[0, 0.17, 0]} material={m.woodDark} castShadow receiveShadow />
      {/* Soaked soil: dark and glossy */}
      <RoundedBox args={[w - 0.16, 0.06, d - 0.16]} radius={0.02} position={[0, 0.32, 0]} receiveShadow>
        <meshStandardMaterial color="#3d2a1c" roughness={0.35} />
      </RoundedBox>
    </RigidBody>
  );
}

/** Every crop in both farm areas, as a handful of instanced meshes. */
function Crops() {
  const meshes = useMemo(() => {
    const crops: Crop[] = [];
    GARDEN.farms.forEach(({ center, size: [w, d] }, f) => {
      const cols = Math.max(2, Math.round((w - 0.5) / 0.75) + 1);
      const rows = Math.max(2, Math.round((d - 0.5) / 0.62) + 1);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = center[0] - w / 2 + 0.3 + (c * (w - 0.6)) / (cols - 1);
          const z = center[2] - d / 2 + 0.3 + (r * (d - 0.6)) / (rows - 1);
          // Leave room for the sprinklers, the sensors, the test pot, the sensor cable and the hoses.
          if (GARDEN.sprinklers.some(([sx, , sz]) => Math.hypot(sx - x, sz - z) < 0.45)) continue;
          if ([...GARDEN.sensors, GARDEN.dryPot].some(([sx, , sz]) => Math.hypot(sx - x, sz - z) < 0.4)) continue;
          if (Math.abs(z - GARDEN.sensors[0][2]) < 0.3 && Math.abs(x - GARDEN.center[0]) < Math.abs(GARDEN.sensors[0][0] - GARDEN.center[0])) continue;
          if (GARDEN.sprinklers.some(([sx, , sz]) => Math.abs(sx - x) < 0.2 && z < sz)) continue;
          crops.push({ x, z, kind: (c + f) % 2 === 0 ? 'lettuce' : 'tomato', s: 0.85 + ((c * 7 + r * 3) % 5) * 0.06 });
        }
      }
    });
    const lettuce = crops.filter((p) => p.kind === 'lettuce');
    const tomatoes = crops.filter((p) => p.kind === 'tomato');
    const make = (geo: SphereGeometry | CylinderGeometry, color: string, count: number, place: (i: number, o: Object3D) => void, shadow = true) => {
      const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ color, roughness: 0.8 }), count);
      for (let i = 0; i < count; i++) {
        place(i, dummy);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      return mesh;
    };
    const ball = new SphereGeometry(1, 10, 8);
    const stick = new CylinderGeometry(1, 1, 1, 5);
    const leafOffsets = [0, 2.1, 4.2];
    return [
      // Lettuce: three overlapping leafy balls each
      make(ball, '#8fcb55', lettuce.length * 3, (i, o) => {
        const p = lettuce[Math.floor(i / 3)];
        const a = leafOffsets[i % 3] + p.x;
        o.position.set(p.x + Math.cos(a) * 0.06 * p.s, SOIL_TOP + 0.07 * p.s, p.z + Math.sin(a) * 0.06 * p.s);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(0.1 * p.s);
      }),
      // Tomatoes: a stake, a bushy top, three fruits
      make(stick, '#7a4a2a', tomatoes.length, (i, o) => {
        const p = tomatoes[i];
        o.position.set(p.x, SOIL_TOP + 0.3 * p.s, p.z);
        o.rotation.set(0, 0, 0);
        o.scale.set(0.012, 0.6 * p.s, 0.012);
      }, false),
      make(ball, '#5f9a3e', tomatoes.length, (i, o) => {
        const p = tomatoes[i];
        o.position.set(p.x, SOIL_TOP + 0.26 * p.s, p.z);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(0.14 * p.s);
      }),
      make(ball, '#e8473a', tomatoes.length * 3, (i, o) => {
        const p = tomatoes[Math.floor(i / 3)];
        const k = i % 3;
        o.position.set(p.x + Math.cos(k * 2.1) * 0.12 * p.s, SOIL_TOP + (0.19 + k * 0.06) * p.s, p.z + Math.sin(k * 2.1) * 0.12 * p.s);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(0.036 * p.s);
      }, false),
    ];
  }, []);
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  );
}

/** The tech area: a wooden deck across the front of the greenhouse. */
function TechDeck() {
  const m = getWorldMaterials();
  const {
    center,
    size: [w, d],
  } = GARDEN.techArea;
  const planks = Math.round(w / 0.5);
  return (
    <group position={center}>
      {Array.from({ length: planks }, (_, i) => (
        <RoundedBox
          key={i}
          args={[w / planks - 0.03, 0.04, d]}
          radius={0.015}
          smoothness={2}
          position={[-w / 2 + (w / planks) * (i + 0.5), 0.02, 0]}
          material={i % 3 === 1 ? m.woodDark : m.wood}
          receiveShadow
        />
      ))}
    </group>
  );
}

/** The flood: puddles that grow while the pump runs and dry up once it stops. */
export function Puddles({ pump, puddles = GARDEN.puddles }: { pump: PumpState; puddles?: [Vec3, number][] }) {
  const wet = useRef(1);
  const meshes = useRef<(Mesh | null)[]>([]);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#7fb8d8', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72, depthWrite: false }),
    []
  );
  useFrame((_, dt) => {
    wet.current = Math.min(1, Math.max(0, wet.current + (pump.current.running ? dt * 0.08 : -dt * 0.06)));
    meshes.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = Math.max(0.001, wet.current * (0.9 + Math.sin(performance.now() / 900 + i) * 0.03));
      mesh.scale.set(s, 1, s * 0.8);
      mesh.visible = wet.current > 0.02;
    });
  });
  return (
    <>
      {puddles.map(([[x, , z], r], i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            meshes.current[i] = mesh;
          }}
          position={[x, 0.025, z]}
          rotation={[-Math.PI / 2, 0, i * 0.7]}
          material={material}
          receiveShadow
        >
          <circleGeometry args={[r, 28]} />
        </mesh>
      ))}
    </>
  );
}

const DROPS = 90;

/** Water tank → pump → hoses → a sprinkler in each farm area, spraying while the pump runs. */
function Irrigation({ pump }: { pump: PumpState }) {
  const m = getWorldMaterials();
  const motor = useRef<Group>(null);
  const sprays = useRef<(InstancedMesh | null)[]>([]);
  const drops = useMemo(
    () => Array.from({ length: DROPS }, (_, i) => ({ a: (i / DROPS) * Math.PI * 2 * 5.3, speed: 1.4 + ((i * 37) % 10) / 9, phase: (i * 0.137) % 1 })),
    []
  );
  const dropGeo = useMemo(() => new SphereGeometry(1, 6, 5), []);
  const dropMat = useMemo(() => new MeshBasicMaterial({ color: '#cfeeff', transparent: true, opacity: 0.85 }), []);
  const hoses = useMemo(() => {
    const [px, , pz] = GARDEN.pump;
    const [tx, , tz] = GARDEN.tank;
    const [ox, , oz] = GARDEN.center;
    // The tank's outlet feeds the pump from behind.
    const feed = pathGeometry(
      [
        [tx, 0.12, tz + 0.74],
        [px, 0.06, tz + 0.95],
        [px, 0.12, pz - 0.2],
      ],
      0.03
    );
    // Out of each side of the pump, up the aisle, along the back wall, then into the farm to its sprinkler.
    const farmBack = GARDEN.farms[0].center[2] - GARDEN.farms[0].size[1] / 2;
    const toFarm = ([sx, , sz]: Vec3) => {
      const side = Math.sign(sx - ox);
      const aisle = ox + side * GARDEN.hoseX;
      const back = oz + GARDEN.hoseBackZ;
      return pathGeometry(
        [
          [px + side * 0.24, 0.12, pz],
          [aisle, 0.03, pz],
          [aisle, 0.03, back],
          [sx, 0.03, back],
          [sx, 0.42, farmBack + 0.04],
          [sx, SOIL_TOP + 0.03, farmBack + 0.3],
          [sx, SOIL_TOP + 0.03, sz - 0.12],
          [sx, SOIL_TOP + 0.08, sz],
        ],
        0.03,
        0.18
      );
    };
    return [feed, ...GARDEN.sprinklers.map(toFarm)];
  }, []);

  useFrame(({ clock }) => {
    const running = pump.current.running;
    const t = clock.elapsedTime;
    if (motor.current) motor.current.position.y = running ? Math.sin(t * 90) * 0.004 : 0;
    sprays.current.forEach((mesh, s) => {
      if (!mesh) return;
      mesh.visible = running;
      if (!running) return;
      drops.forEach((d, i) => {
        const k = (d.phase + t * 0.9 + s * 0.37) % 1;
        const a = d.a + t * 0.6 + s;
        const r = k * d.speed;
        dummy.position.set(Math.cos(a) * r, 0.95 + k * 1.1 - k * k * 1.9, Math.sin(a) * r);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.022 * (1 - k * 0.5));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  const [tx, , tz] = GARDEN.tank;
  const [px, , pz] = GARDEN.pump;
  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[tx, 0, tz]}>
        <CylinderCollider args={[0.6, 0.75]} position={[0, 0.6, 0]} />
        <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.72, 0.75, 1.2, 28]} />
          <meshStandardMaterial color="#3f7fc0" roughness={0.6} />
        </mesh>
        {[0.28, 0.92].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <torusGeometry args={[0.735, 0.03, 6, 32]} />
            <meshStandardMaterial color="#2c5f94" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 1.22, 0]} castShadow>
          <cylinderGeometry args={[0.74, 0.74, 0.06, 28]} />
          <meshStandardMaterial color="#2c5f94" roughness={0.6} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders={false} position={[px, 0, pz]}>
        <CuboidCollider args={[0.25, 0.15, 0.2]} position={[0, 0.15, 0]} />
        <RoundedBox args={[0.5, 0.06, 0.4]} radius={0.02} position={[0, 0.03, 0]} material={m.stone} receiveShadow />
        <group ref={motor}>
          <mesh position={[0, 0.16, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.26, 16]} />
            <meshStandardMaterial color="#5d6470" metalness={0.4} roughness={0.45} />
          </mesh>
          <RoundedBox args={[0.14, 0.18, 0.16]} radius={0.02} position={[0, 0.15, 0.08]} castShadow>
            <meshStandardMaterial color="#e8594a" roughness={0.5} />
          </RoundedBox>
        </group>
      </RigidBody>
      {hoses.map((geo, i) => (
        <mesh key={i} geometry={geo} castShadow>
          <meshStandardMaterial color="#3f8a4f" roughness={0.6} />
        </mesh>
      ))}
      {GARDEN.sprinklers.map(([sx, , sz], s) => (
        <group key={s} position={[sx, SOIL_TOP, sz]}>
          <mesh position={[0, 0.4, 0]} material={m.woodDark} castShadow>
            <cylinderGeometry args={[0.025, 0.035, 0.8, 8]} />
          </mesh>
          <mesh position={[0, 0.83, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.08, 12]} />
            <meshStandardMaterial color="#c8ccd2" metalness={0.7} roughness={0.3} />
          </mesh>
          <instancedMesh
            ref={(mesh) => {
              sprays.current[s] = mesh;
            }}
            args={[dropGeo, dropMat, DROPS]}
            position={[0, -0.12, 0]}
            frustumCulled={false}
            visible={false}
          />
        </group>
      ))}
    </>
  );
}

/*
 * Inside the control box, in box-local coordinates (x right, y up, z out of the back panel).
 * The TRIOE board stands upright on the left; the relay module sits on the right.
 */
const MOUNT_Z = -0.066;
/** Where the box sits on its post (post-local). */
const BOX_Y = 1.12;
const BOX_Z = 0.06;
/** Cable glands through the box floor, right above the post so every cable drops straight onto it (box-local x). */
const GLAND = { pump: -0.07, usb: -0.035, supply: 0, sensorLeft: 0.035, sensorRight: 0.07 };
const CABLE = '#33363e';
const BOARD_AT: [number, number] = [-0.15, -0.005];
const BOARD_R = 0.115;
const HEADER_LEN = 0.14;
const PIN_OFFSETS = Array.from({ length: 8 }, (_, i) => -0.06 + i * (0.12 / 7));
/** The two headers run along the slanted sides, inset toward the centre. */
const BOARD_HEADERS = [1, -1].map((side) => {
  const corner: [number, number] = [side * BOARD_R * Math.sin(Math.PI / 3), -BOARD_R / 2];
  const len = Math.hypot(corner[0], BOARD_R - corner[1]);
  const d: [number, number] = [-corner[0] / len, (BOARD_R - corner[1]) / len];
  const inward: [number, number] = [-side * d[1], side * d[0]];
  const mid: [number, number] = [corner[0] / 2, (corner[1] + BOARD_R) / 2];
  return {
    base: [mid[0] + inward[0] * 0.018, mid[1] + inward[1] * 0.018] as [number, number],
    d,
    angle: Math.atan2(d[1], d[0]),
  };
});
const RELAY_AT: [number, number] = [0.13, 0];
const RELAY_W = 0.26;
const RELAY_H = 0.18;
/** DC+, DC-, IN — top to bottom down the relay's left edge. */
const RELAY_PINS: [number, number][] = [
  [0.022, 0.03],
  [0.022, 0],
  [0.022, -0.03],
];

type P3 = [number, number, number];

/**
 * A cable or hose laid along a polyline: each corner gets a short lead-in and lead-out
 * so the curve turns tightly instead of bulging, like a real cable pulled straight.
 */
function pathGeometry(points: P3[], radius: number, inset = 0.1) {
  const v = points.map(([x, y, z]) => new Vector3(x, y, z));
  const out: Vector3[] = [v[0]];
  for (let i = 1; i < v.length - 1; i++) {
    const toPrev = v[i - 1].clone().sub(v[i]);
    const toNext = v[i + 1].clone().sub(v[i]);
    out.push(v[i].clone().add(toPrev.setLength(Math.min(inset, toPrev.length() / 3))), v[i], v[i].clone().add(toNext.setLength(Math.min(inset, toNext.length() / 3))));
  }
  out.push(v[v.length - 1]);
  const curve = new CatmullRomCurve3(out, false, 'centripetal');
  return new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 30)), radius, 6);
}

/** A wire through these points (short runs inside the box), as a tube. */
function wireGeometry(points: P3[], radius = 0.0035) {
  return new TubeGeometry(new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z))), 32, radius, 6);
}

/** The weatherproof control box on its post: the TRIOE board and the relay module, lid open. */
function ControlBox({ pump }: { pump: PumpState }) {
  const m = getWorldMaterials();
  const relayLed = useRef<MeshStandardMaterial>(null);
  const armature = useRef<Mesh>(null);
  const label = useCanvasTexture(
    512,
    354,
    (ctx, w, h) => {
      ctx.fillStyle = '#1d5fc4';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f5f5f0';
      ctx.font = 'bold 40px Arial, sans-serif';
      ctx.fillText('RELAY MODULE', 132, 58);
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillText('IN · Trigger: LOW level', 132, 102);
      // Labels beside the input header pins (DC+, DC-, IN, top to bottom)
      ctx.font = 'bold 26px Arial, sans-serif';
      RELAY_PINS.forEach(([, py], i) => ctx.fillText(['DC+', 'DC-', 'IN'][i], 66, ((RELAY_H / 2 - py) / RELAY_H) * h + 9));
      ctx.font = 'bold 22px Arial, sans-serif';
      // Terminal labels beside the screws (NO, COM, NC, top to bottom)
      ctx.font = 'bold 19px Arial, sans-serif';
      [0, -0.03, -0.06].forEach((sy, i) => ctx.fillText(['NO', 'COM', 'NC'][i], 408, ((RELAY_H / 2 - sy) / RELAY_H) * h + 7));
    },
    ''
  );
  const wires = useMemo(() => {
    const z = MOUNT_Z;
    const header = BOARD_HEADERS[0]; // the right-hand header
    const boardPin = (k: number): [number, number, number] => [
      BOARD_AT[0] + header.base[0] + header.d[0] * PIN_OFFSETS[k],
      BOARD_AT[1] + header.base[1] + header.d[1] * PIN_OFFSETS[k],
      z + 0.04,
    ];
    return (['#e8594a', '#2b2b33', '#ffd166'] as const).map((color, i) => {
      // Highest board pin to the top relay pin, so the jumpers run side by side without crossing.
      const from = boardPin(4 - i * 2);
      const [px, py] = RELAY_PINS[i];
      const to: [number, number, number] = [px, py, z + 0.029];
      return {
        color,
        geometry: wireGeometry([from, [from[0] + 0.02, from[1], z + 0.055], [(from[0] + px) / 2, (from[1] + py) / 2 - 0.01, z + 0.06], [px - 0.02, py, z + 0.045], to]),
      };
    });
  }, []);

  /*
   * Every cable that leaves the box, in post-local coordinates. Each one runs from its
   * connection inside the box, out through a gland in the box floor, and on to what it
   * powers or reads: the soil sensor in the far bed, the pump, and the power box on the
   * post (which is itself plugged into the outlet on the greenhouse wall).
   */
  const cables = useMemo(() => {
    const z = MOUNT_Z;
    const B = (x: number, y: number, bz: number): [number, number, number] => [x, y + BOX_Y, bz + BOX_Z];
    const [cx, , cz] = GARDEN.controlPost;
    const local = (p: Vec3, dx: number, y: number, dz: number): [number, number, number] => [p[0] - cx + dx, y, p[2] - cz + dz];
    const below = (gx: number) => B(gx, -0.27, -0.02);
    // Greenhouse-local floor points, as post-local.
    const floor = (x: number, fz: number, y = 0.015): [number, number, number] => [GREENHOUSE.origin[0] + x - cx, y, GREENHOUSE.origin[2] + fz - cz];
    const leftHeader = BOARD_HEADERS[1];
    const leftPin = (k: number): [number, number, number] => [
      BOARD_AT[0] + leftHeader.base[0] + leftHeader.d[0] * PIN_OFFSETS[k],
      BOARD_AT[1] + leftHeader.base[1] + leftHeader.d[1] * PIN_OFFSETS[k],
      z + 0.04,
    ];
    const wallX = GREENHOUSE.origin[0] + GREENHOUSE.size[0] / 2 - cx;
    const list: { color: string; geometry: TubeGeometry }[] = [];
    const add = (color: string, points: [number, number, number][], radius?: number) => list.push({ color, geometry: wireGeometry(points, radius) });

    const s = GARDEN.sensors;
    const soil = SOIL_TOP + 0.02;
    const [lx, rx] = [GARDEN.farms[0].center[0] + GARDEN.farms[0].size[0] / 2, GARDEN.farms[1].center[0] - GARDEN.farms[1].size[0] / 2];
    const farmFront = GARDEN.farms[0].center[2] + GARDEN.farms[0].size[1] / 2;
    const [ox, , oz] = GREENHOUSE.origin;
    const gx = (x: number) => x - ox;
    const gz = (fz: number) => fz - oz;

    // Soil sensors: one cable from each, like the plan's red wire — through the soil to the farm's aisle
    // edge and over it, across to the aisle lane at sensorCableX (left cable west of the right one, so they
    // never cross), down the aisle to the tech area, east to the post, round its right side and up into
    // the box. Their cores plug into the board's left header.
    const toPost = (dx: number): P3[] => [
      [0.02 + dx, 0.015, -0.3],
      [0.02 + dx, 0.015, -0.14],
      [0.02 + dx, 0.08, -0.128],
      [0.02 + dx, 0.7, -0.128],
      [0.093, 0.76, -0.1],
      [0.09, 0.82, 0],
    ];
    const sensorCable = (from: Vec3, gland: number, dx: number) => {
      const edge = from === s[0] ? lx : rx;
      const out = Math.sign(edge - from[0]); // toward the aisle
      const rowZ = gz(from[2]) + 0.04;
      const laneZ = gz(farmFront) + 0.25 - dx;
      list.push({
        color: CABLE,
        geometry: pathGeometry(
          [
            local(from, 0, 0.53, 0),
            local(from, out * 0.08, soil + 0.06, 0.04),
            local(from, out * 0.2, soil, 0.04),
            floor(gx(edge) - out * 0.15, rowZ, soil),
            floor(gx(edge), rowZ, 0.4),
            floor(gx(edge) + out * 0.12, rowZ),
            floor(GARDEN.sensorCableX + dx, rowZ),
            floor(GARDEN.sensorCableX + dx, laneZ),
            floor(gx(GARDEN.controlPost[0]) + dx, laneZ),
            ...toPost(dx),
            below(gland),
            B(gland, -0.2, -0.02),
          ],
          0.007,
          0.06
        ),
      });
    };
    sensorCable(s[0], GLAND.sensorLeft, -0.03);
    sensorCable(s[1], GLAND.sensorRight, 0.03);
    // Inside the box: three cores per sensor (VCC, GND, signal) to the board's left header.
    [
      { gland: GLAND.sensorLeft, pins: [0, 1, 2], colors: ['#e8594a', '#2b2b33', '#4f86b8'] },
      { gland: GLAND.sensorRight, pins: [4, 5, 6], colors: ['#f2a03c', '#6b5444', '#3fae6f'] },
    ].forEach(({ gland, pins, colors }) =>
      pins.forEach((k, i) => {
        const pin = leftPin(k);
        add(colors[i], [B(gland, -0.2, -0.02), B(gland - 0.02, -0.17, z + 0.03), B(-0.05, -0.15, z + 0.035 + i * 0.004), B(-0.25, -0.1, z + 0.05), B(pin[0] - 0.02, pin[1] - 0.01, z + 0.06), B(...pin)]);
      })
    );

    // Board power: USB from the board's flat edge, out of the box, into the power box.
    add(CABLE, [
      B(BOARD_AT[0], BOARD_AT[1] - BOARD_R / 2 - 0.012, z + 0.012),
      B(BOARD_AT[0], -0.12, z + 0.025),
      B(GLAND.usb, -0.19, -0.02),
      below(GLAND.usb),
      [-0.04, 0.8, 0.045],
      [-0.04, 0.72, 0.055],
      [-0.04, 0.585, 0.07],
    ], 0.005);

    // Pump circuit: the 12 V supply into the relay's COM terminal, and NO out to the pump.
    add('#e8594a', [B(0.244, -0.03, z + 0.045), B(0.215, -0.13, z + 0.04), B(0.08, -0.18, z + 0.03), B(GLAND.supply, -0.2, -0.02)]);
    add(CABLE, [B(GLAND.supply, -0.2, -0.02), below(GLAND.supply), [0.03, 0.8, 0.045], [0.04, 0.72, 0.055], [0.04, 0.585, 0.07]], 0.006);
    add('#e8594a', [B(0.244, 0, z + 0.045), B(0.27, -0.08, z + 0.05), B(0.05, -0.17, z + 0.03), B(GLAND.pump, -0.2, -0.02)]);
    // The pump cable: down the post's left side, west across the tech area, then straight up the aisle to the pump.
    list.push({
      color: CABLE,
      geometry: pathGeometry(
        [
          B(GLAND.pump, -0.2, -0.02),
          below(GLAND.pump),
          [-0.088, 0.78, 0.01],
          [-0.088, 0.06, 0.01],
          [-0.16, 0.015, 0.01],
          floor(gx(GARDEN.pump[0]), gz(GARDEN.controlPost[2]) + 0.01),
          floor(gx(GARDEN.pump[0]), gz(GARDEN.pump[2]) + 0.4),
          local(GARDEN.pump, 0, 0.05, 0.26),
          local(GARDEN.pump, 0, 0.14, 0.12),
        ],
        0.007,
        0.12
      ),
    });

    // Mains: from the power box down to the floor and east to the plug on the greenhouse wall.
    list.push({
      color: '#d9a441',
      geometry: pathGeometry(
        [
          [0, 0.34, 0.06],
          [0, 0.1, 0.1],
          [0.12, 0.015, 0.1],
          [wallX - 0.05, 0.015, 0.1],
          [wallX - 0.03, 0.22, 0.0],
        ],
        0.007
      ),
    });
    return { list, wallX };
  }, []);
  useFrame(() => {
    const on = pump.current.running;
    if (relayLed.current) relayLed.current.emissiveIntensity = on ? 5 : 0.05;
    if (armature.current) armature.current.position.z = on ? 0.012 : 0;
  });
  const [x, , z] = GARDEN.controlPost;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <CuboidCollider args={[0.12, 0.7, 0.12]} position={[0, 0.7, 0]} />
      {/* Post (stops under the box so it never hides what is inside) */}
      <mesh position={[0, 0.45, -0.04]} material={m.woodDark} castShadow>
        <boxGeometry args={[0.14, 0.9, 0.14]} />
      </mesh>
      {/* Box (open toward the path) */}
      <group position={[0, BOX_Y, BOX_Z]}>
        <RoundedBox args={[0.62, 0.46, 0.06]} radius={0.02} position={[0, 0, -0.1]} castShadow>
          <meshStandardMaterial color="#8d939c" roughness={0.6} />
        </RoundedBox>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.3, 0, -0.02]}>
            <boxGeometry args={[0.03, 0.46, 0.16]} />
            <meshStandardMaterial color="#8d939c" roughness={0.6} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, s * 0.215, -0.02]}>
            <boxGeometry args={[0.62, 0.03, 0.16]} />
            <meshStandardMaterial color="#8d939c" roughness={0.6} />
          </mesh>
        ))}
        {/* Lid, swung open */}
        <mesh position={[0, 0.3, 0.1]} rotation={[-1.1, 0, 0]}>
          <boxGeometry args={[0.62, 0.02, 0.4]} />
          <meshStandardMaterial color="#b9d6e6" roughness={0.2} transparent opacity={0.55} />
        </mesh>
        {/* TRIOE board (left), mounted upright: apex up, headers along the slanted sides, USB at the flat edge */}
        <group position={[BOARD_AT[0], BOARD_AT[1], MOUNT_Z + 0.006]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[BOARD_R, BOARD_R, 0.012, 3]} />
            <meshStandardMaterial color="#1d5fc4" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <boxGeometry args={[0.042, 0.042, 0.008]} />
            <meshStandardMaterial color="#7d828b" roughness={0.45} />
          </mesh>
          {BOARD_HEADERS.map((h, i) => (
            <group key={i} position={[h.base[0], h.base[1], 0.012]} rotation={[0, 0, h.angle]}>
              <mesh>
                <boxGeometry args={[HEADER_LEN, 0.012, 0.012]} />
                <meshStandardMaterial color="#1b1b1f" roughness={0.6} />
              </mesh>
              {PIN_OFFSETS.map((s) => (
                <mesh key={s} position={[s, 0, 0.014]}>
                  <boxGeometry args={[0.004, 0.004, 0.018]} />
                  <meshStandardMaterial color="#e6c35c" metalness={0.8} roughness={0.3} />
                </mesh>
              ))}
            </group>
          ))}
          <mesh position={[0.03, -0.035, 0.009]}>
            <boxGeometry args={[0.012, 0.008, 0.006]} />
            <meshStandardMaterial color="#ff6b6b" emissive="#ff2a2a" emissiveIntensity={4} toneMapped={false} />
          </mesh>
          <mesh position={[0, -BOARD_R / 2 - 0.004, 0.006]}>
            <boxGeometry args={[0.03, 0.014, 0.012]} />
            <meshStandardMaterial color="#c8ccd2" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
        {/* Relay module (right): blue PCB with its label, input header, relay can, screw terminal */}
        <mesh position={[RELAY_AT[0], RELAY_AT[1], MOUNT_Z + 0.004]}>
          <boxGeometry args={[RELAY_W, RELAY_H, 0.008]} />
          <meshStandardMaterial color="#1d5fc4" roughness={0.6} />
        </mesh>
        <mesh position={[RELAY_AT[0], RELAY_AT[1], MOUNT_Z + 0.0085]}>
          <planeGeometry args={[RELAY_W, RELAY_H]} />
          <meshStandardMaterial map={label} roughness={0.6} />
        </mesh>
        {RELAY_PINS.map(([px, py]) => (
          <mesh key={py} position={[px, py, MOUNT_Z + 0.018]}>
            <boxGeometry args={[0.005, 0.005, 0.02]} />
            <meshStandardMaterial color="#e6c35c" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
        <RoundedBox ref={armature} args={[0.085, 0.065, 0.055]} radius={0.008} position={[0.165, -0.035, MOUNT_Z + 0.036]} castShadow>
          <meshStandardMaterial color="#202024" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0.244, -0.03, MOUNT_Z + 0.025]}>
          <boxGeometry args={[0.028, 0.1, 0.034]} />
          <meshStandardMaterial color="#3b8f5a" roughness={0.6} />
        </mesh>
        {[-0.06, -0.03, 0].map((sy) => (
          <mesh key={sy} position={[0.244, sy, MOUNT_Z + 0.043]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.004, 10]} />
            <meshStandardMaterial color="#c8ccd2" metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        <mesh position={[0.03, 0.07, MOUNT_Z + 0.012]}>
          <boxGeometry args={[0.012, 0.008, 0.006]} />
          <meshStandardMaterial ref={relayLed} color="#ff6b6b" emissive="#ff2020" emissiveIntensity={0.05} toneMapped={false} />
        </mesh>
        {/* Jumpers: board pins → relay inputs */}
        {wires.map((w) => (
          <mesh key={w.color + w.geometry.uuid} geometry={w.geometry}>
            <meshStandardMaterial color={w.color} roughness={0.6} />
          </mesh>
        ))}
        {/* Cable glands in the box floor */}
        {Object.values(GLAND).map((gx) => (
          <mesh key={gx} position={[gx, -0.215, -0.02]}>
            <cylinderGeometry args={[0.014, 0.014, 0.05, 12]} />
            <meshStandardMaterial color="#202024" roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* Every cable in and out of the box */}
      {cables.list.map((w) => (
        <mesh key={w.color + w.geometry.uuid} geometry={w.geometry} castShadow>
          <meshStandardMaterial color={w.color} roughness={0.6} />
        </mesh>
      ))}
      {/* Power box on the post: the board's USB charger and the pump's 12 V adapter */}
      <RoundedBox args={[0.18, 0.22, 0.06]} radius={0.015} position={[0, 0.46, 0.06]} castShadow>
        <meshStandardMaterial color="#d9dbe0" roughness={0.5} />
      </RoundedBox>
      {[-0.045, 0.045].map((sx) => (
        <mesh key={sx} position={[sx, 0.5, 0.095]}>
          <boxGeometry args={[0.06, 0.07, 0.02]} />
          <meshStandardMaterial color="#2b2b33" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0.06, 0.4, 0.092]}>
        <boxGeometry args={[0.012, 0.008, 0.004]} />
        <meshStandardMaterial color="#5dffa8" emissive="#2bd67b" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {/* Wall outlet on the greenhouse's side wall */}
      <group position={[cables.wallX - 0.01, 0.27, 0]}>
        <mesh>
          <boxGeometry args={[0.03, 0.14, 0.1]} />
          <meshStandardMaterial color="#f4f2ec" roughness={0.5} />
        </mesh>
        <mesh position={[-0.017, 0.02, 0]}>
          <boxGeometry args={[0.004, 0.04, 0.05]} />
          <meshStandardMaterial color="#2b2b33" />
        </mesh>
      </group>
      {/* Project Bantay alert light on top */}
      <mesh position={[0, 1.43, 0.0]}>
        <sphereGeometry args={[0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ffcf6a" emissive="#ffb020" emissiveIntensity={0.4} roughness={0.3} />
      </mesh>
    </RigidBody>
  );
}

/** Mika's potted flowers: a tall sunflower-yellow one and two smaller daisies. */
const POT_FLOWERS = [
  { x: 0, z: 0, h: 0.5, r: 0.08, tilt: 0.05, yaw: 0, petal: '#ffcc33', center: '#7a4a2a' },
  { x: -0.08, z: 0.05, h: 0.36, r: 0.06, tilt: 0.3, yaw: 0.9, petal: '#fffaf0', center: '#f5c242' },
  { x: 0.08, z: 0.06, h: 0.3, r: 0.055, tilt: -0.25, yaw: -0.7, petal: '#ff9fb8', center: '#f5c242' },
];

/** The tech area's deck surface, where the pot stands. */
const DECK_TOP = 0.04;

/** A soil moisture sensor in each farm (cables come from the control box), and Mika's dry test pot. */
function SoilSensors() {
  const [dx, , dz] = GARDEN.dryPot;
  return (
    <>
      {GARDEN.sensors.map(([x, , z], i) => (
        <group key={i} position={[x, 0.34, z]}>
          {[-0.025, 0.025].map((o) => (
            <mesh key={o} position={[o, 0.05, 0]}>
              <boxGeometry args={[0.018, 0.16, 0.006]} />
              <meshStandardMaterial color="#d6b04a" metalness={0.5} roughness={0.35} />
            </mesh>
          ))}
          <RoundedBox args={[0.1, 0.08, 0.03]} radius={0.01} position={[0, 0.16, 0]} castShadow>
            <meshStandardMaterial color="#1d5fc4" roughness={0.5} />
          </RoundedBox>
        </group>
      ))}
      {/* The dry test pot: a potted flower in dry, crumbly soil, on the deck beside the control box */}
      <RigidBody type="fixed" colliders={false} position={[dx, DECK_TOP, dz]}>
        <CylinderCollider args={[0.17, 0.2]} position={[0, 0.17, 0]} />
        <mesh position={[0, 0.17, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.2, 0.14, 0.34, 18]} />
          <meshStandardMaterial color="#c96f45" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.33, 0]}>
          <torusGeometry args={[0.195, 0.022, 8, 24]} />
          <meshStandardMaterial color="#b85f38" roughness={0.85} />
        </mesh>
        {/* Dry soil: pale, with a few clumps */}
        <mesh position={[0, 0.315, 0]} scale={[1, 0.18, 1]}>
          <sphereGeometry args={[0.18, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#a88563" roughness={1} />
        </mesh>
        {[[0.08, 0.04], [-0.07, 0.09], [0.02, -0.1], [-0.1, -0.04]].map(([cx, cz], i) => (
          <mesh key={i} position={[cx, 0.335, cz]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.025 + (i % 2) * 0.01, 6, 5]} />
            <meshStandardMaterial color="#937052" roughness={1} />
          </mesh>
        ))}
        {/* Flowers */}
        {POT_FLOWERS.map((f, i) => (
          <group key={i} position={[f.x, 0.32, f.z]} rotation={[f.tilt, f.yaw, 0]}>
            <mesh position={[0, f.h / 2, 0]}>
              <cylinderGeometry args={[0.008, 0.01, f.h, 6]} />
              <meshStandardMaterial color="#4f8a3a" roughness={0.8} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * 0.045, f.h * 0.4, 0]} rotation={[0, 0, -s * 0.9]} scale={[1, 0.35, 0.55]}>
                <sphereGeometry args={[0.05, 8, 6]} />
                <meshStandardMaterial color="#5f9a3e" roughness={0.8} />
              </mesh>
            ))}
            <group position={[0, f.h, 0]} rotation={[-0.5, 0, 0]}>
              {Array.from({ length: 8 }, (_, k) => (
                <group key={k} rotation={[0, 0, (k / 8) * Math.PI * 2]}>
                  <mesh position={[0, f.r * 0.9, 0]} scale={[0.45, 1, 0.25]}>
                    <sphereGeometry args={[f.r * 0.55, 8, 6]} />
                    <meshStandardMaterial color={f.petal} roughness={0.6} />
                  </mesh>
                </group>
              ))}
              <mesh position={[0, 0, 0.012]} scale={[1, 1, 0.5]}>
                <sphereGeometry args={[f.r * 0.5, 10, 8]} />
                <meshStandardMaterial color={f.center} roughness={0.7} />
              </mesh>
            </group>
          </group>
        ))}
      </RigidBody>
    </>
  );
}

const TABLET_LINES = getSurface('mission-2', 'tablet')!.tabs[0].items.filter((l) => /RELAY|moisture|setup|loop/.test(l.text));

/** A long work table: top, four legs, a shelf — and a collider. */
function WorkTable({ center, size, height = 0.72, children }: { center: Vec3; size: [number, number]; height?: number; children?: React.ReactNode }) {
  const m = getWorldMaterials();
  const [w, d] = size;
  return (
    <RigidBody type="fixed" colliders={false} position={center}>
      <CuboidCollider args={[w / 2, height / 2, d / 2]} position={[0, height / 2, 0]} />
      <RoundedBox args={[w, 0.05, d]} radius={0.015} position={[0, height - 0.025, 0]} material={m.wood} castShadow receiveShadow />
      <RoundedBox args={[w - 0.12, 0.03, d - 0.1]} radius={0.01} position={[0, 0.2, 0]} material={m.woodDark} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (w / 2 - 0.06), (height - 0.05) / 2, sz * (d / 2 - 0.06)]} material={m.woodDark} castShadow>
            <boxGeometry args={[0.05, height - 0.05, 0.05]} />
          </mesh>
        ))
      )}
      <group position={[0, height, 0]}>{children}</group>
    </RigidBody>
  );
}

/** The device table: Mika's tablet with the garden sketch, a spare sensor and her notebook. */
function DeviceTable() {
  const current = useMissionContext((c) => c.missionId) === 'mission-2';
  const editing = useSession((s) => s.sketch);
  const device = useDeviceFields('mission-2');
  const fields = current ? editing : device;
  const screen = useCanvasTexture(
    512,
    340,
    (ctx, w) => {
      ctx.fillStyle = '#1d1b2c';
      ctx.fillRect(0, 0, w, 340);
      ctx.fillStyle = '#19b3a6';
      ctx.fillRect(0, 0, w, 30);
      ctx.fillStyle = '#0d2b2a';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('garden.ino', 12, 21);
      ctx.font = `14px ${FONT}`;
      TABLET_LINES.forEach((line, i) => {
        const text = line.text.replace(/\{([A-Z]+)\}/g, (_, f: string) => fields[f] ?? f);
        ctx.fillStyle = text.includes('//') && !text.includes('digitalWrite') ? '#7f8ca3' : /digitalWrite/.test(text) ? '#ffd166' : '#f2efe6';
        ctx.fillText(text.trimEnd().slice(0, 52), 12, 54 + i * 21);
      });
    },
    `${fields.START}|${fields.ON}|${fields.OFF}`
  );
  const { center, size } = GARDEN.deviceTable;
  // The tablet's spot, relative to the table top.
  const [tx, , tz] = [GARDEN.tablet[0] - center[0], 0, GARDEN.tablet[2] - center[2]];
  return (
    <WorkTable center={center} size={size}>
      {/* Tablet leaning back on its kickstand, bottom edge on the table, facing the door */}
      <mesh position={[tx, 0.05, tz - 0.1]} rotation={[0.55, 0, 0]}>
        <boxGeometry args={[0.14, 0.11, 0.012]} />
        <meshStandardMaterial color="#2b2b33" roughness={0.5} />
      </mesh>
      <group position={[tx, 0.085, tz]} rotation={[-1.05, 0, 0]}>
        <RoundedBox args={[0.46, 0.32, 0.02]} radius={0.015} castShadow>
          <meshStandardMaterial color="#2b2b33" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0, 0.011]}>
          <planeGeometry args={[0.42, 0.28]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      </group>
      {/* A spare soil sensor and Mika's notebook */}
      <group position={[-0.55, 0.01, 0.02]} rotation={[0, 0.4, 0]}>
        <mesh position={[0, 0.006, 0]}>
          <boxGeometry args={[0.1, 0.012, 0.03]} />
          <meshStandardMaterial color="#1d5fc4" roughness={0.5} />
        </mesh>
        <mesh position={[0.08, 0.004, 0]}>
          <boxGeometry args={[0.1, 0.006, 0.02]} />
          <meshStandardMaterial color="#d6b04a" metalness={0.5} roughness={0.35} />
        </mesh>
      </group>
      <mesh position={[-0.2, 0.01, 0.05]} rotation={[0, -0.25, 0]}>
        <boxGeometry args={[0.26, 0.02, 0.34]} />
        <meshStandardMaterial color="#e58c5a" roughness={0.8} />
      </mesh>
    </WorkTable>
  );
}

/** Sacks of soil and fertilizer, slumped against each other. */
function Sacks() {
  const label = (text: string, color: string) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#d8bf91';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(14, h / 2 - 34, w - 28, 68);
    ctx.fillStyle = '#fff8ec';
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2, w - 40);
  };
  const soil = useCanvasTexture(256, 256, label('SOIL', '#6b4a2f'), 'sack-soil');
  const fert = useCanvasTexture(256, 256, label('FERTILIZER', '#3f8a4f'), 'sack-fert');
  const [x, , z] = GARDEN.sacks;
  const sacks: { dx: number; tex: typeof soil; rot: number; s: number }[] = [
    { dx: -0.75, tex: soil, rot: 0.15, s: 1 },
    { dx: -0.1, tex: soil, rot: -0.1, s: 0.95 },
    { dx: 0.55, tex: fert, rot: 0.12, s: 0.9 },
  ];
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <CuboidCollider args={[1.1, 0.35, 0.25]} position={[0, 0.35, 0]} />
      {sacks.map(({ dx, tex, rot, s }) => (
        <group key={dx} position={[dx, 0, 0]} rotation={[0, rot, 0.05]} scale={s}>
          <RoundedBox args={[0.55, 0.62, 0.34]} radius={0.12} smoothness={3} position={[0, 0.31, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#c9a777" roughness={1} />
          </RoundedBox>
          <mesh position={[0, 0.66, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.12, 0.1, 10]} />
            <meshStandardMaterial color="#b8955f" roughness={1} />
          </mesh>
          <mesh position={[0, 0.32, 0.172]}>
            <planeGeometry args={[0.4, 0.4]} />
            <meshStandardMaterial map={tex} roughness={1} />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

/** The planting tools table: trowels, a hand fork, shears and gloves — a rake and a spade lean on it. */
function PlantingTools() {
  const m = getWorldMaterials();
  const steel = { color: '#c8ccd2', metalness: 0.7, roughness: 0.3 };
  return (
    <WorkTable center={GARDEN.tools} size={[2.3, 0.5]}>
      {[-0.8, -0.45].map((dx, i) => (
        <group key={dx} position={[dx, 0.012, 0]} rotation={[0, 0.3 + i * 0.4, 0]}>
          <mesh position={[0, 0, -0.08]} material={m.woodDark}>
            <boxGeometry args={[0.03, 0.025, 0.14]} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[0.06, 0.008, 0.12]} />
            <meshStandardMaterial {...steel} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0.012, 0]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 0, -0.08]} material={m.woodDark}>
          <boxGeometry args={[0.03, 0.025, 0.14]} />
        </mesh>
        {[-0.02, 0, 0.02].map((o) => (
          <mesh key={o} position={[o, 0, 0.05]}>
            <boxGeometry args={[0.008, 0.008, 0.11]} />
            <meshStandardMaterial {...steel} />
          </mesh>
        ))}
      </group>
      {[-0.03, 0.03].map((o, i) => (
        <mesh key={o} position={[0.42 + o, 0.012, 0.02]} rotation={[0, i ? 0.35 : -0.35, 0]}>
          <boxGeometry args={[0.02, 0.012, 0.18]} />
          <meshStandardMaterial color={i ? '#e8594a' : '#c8ccd2'} metalness={i ? 0 : 0.7} roughness={0.4} />
        </mesh>
      ))}
      {[0.75, 0.88].map((dx) => (
        <mesh key={dx} position={[dx, 0.02, 0]} rotation={[0, 0.2, 0]}>
          <boxGeometry args={[0.1, 0.03, 0.18]} />
          <meshStandardMaterial color="#4fae8a" roughness={0.9} />
        </mesh>
      ))}
      {/* Rake and spade leaning against the table's front */}
      {[
        { dx: -1.0, head: [0.3, 0.03, 0.05] as P3, color: '#5d6470' },
        { dx: 1.05, head: [0.18, 0.24, 0.02] as P3, color: '#8d939c' },
      ].map(({ dx, head, color }) => (
        <group key={dx} position={[dx, -0.72, 0.32]} rotation={[0.28, 0, 0]}>
          <mesh position={[0, 0.7, 0]} material={m.woodDark} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 1.3, 6]} />
          </mesh>
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={head} />
            <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </WorkTable>
  );
}

/** How far away (m) the pump and the sprinklers fade to silence. */
const HEARING = 11;

/**
 * The pump's hum and the sprinklers' hiss: playing only while the pump really runs, and
 * louder the closer the hero stands. Outside the greenhouse, both fall silent.
 */
function WaterSounds({ pump }: { pump: PumpState }) {
  useFrame(() => {
    const s = useSession.getState();
    const on = pump.current.running && s.map === 'greenhouse' && s.screen === 'play';
    const { x, z } = playerState.position;
    const near = ([px, , pz]: Vec3) => Math.max(0, 1 - Math.hypot(x - px, z - pz) / HEARING) ** 1.5;
    // Kept low: background texture, never louder than the dialogue blips.
    setAmbient('pump', on ? 0.02 + 0.05 * near(GARDEN.pump) : 0);
    setAmbient('sprinkler', on ? 0.012 + 0.04 * Math.max(...GARDEN.sprinklers.map(near)) : 0);
  });
  useEffect(
    () => () => {
      setAmbient('pump', 0);
      setAmbient('sprinkler', 0);
    },
    []
  );
  return null;
}

/** Mika's beds and watering rig — Mission 2's set, inside the greenhouse. */
export function Garden({ sounds = true }: { sounds?: boolean }) {
  const pump = usePumpState();
  return (
    <group>
      {GARDEN.farms.map((f, i) => (
        <FarmPlot key={i} center={f.center} size={f.size} />
      ))}
      <Crops />
      <TechDeck />
      <Puddles pump={pump} />
      <Irrigation pump={pump} />
      {sounds && <WaterSounds pump={pump} />}
      <ControlBox pump={pump} />
      <SoilSensors />
      <DeviceTable />
      <Sacks />
      <PlantingTools />
    </group>
  );
}
