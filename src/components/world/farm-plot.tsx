'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { RoundedBox } from '@react-three/drei';
import { Color, CylinderGeometry, IcosahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, type Mesh } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CROPS, PARCELS } from '@/game/sim/content';
import { GRID, tileCenter } from '@/game/sim/farm-map';
import { cropStage, isRipe } from '@/game/sim/sim';
import type { FarmState } from '@/game/sim/types';
import { useFarm, useFarmState } from '@/game/state/farm-store';
import { useSession } from '@/game/state/session-store';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * The farm grid's soil and crops, drawn from the sim's state: tilled soil (darker when watered),
 * every crop at its growth stage in chunky clay shapes, the fences round land not yet bought,
 * and the cursor on the tile the hero faces.
 */

const dummy = new Object3D();
const SOIL_GEO = new RoundedBoxGeometry(0.94, 0.1, 0.94, 2, 0.04);
const BLOB_GEO = new IcosahedronGeometry(1, 2);
const STAKE_GEO = new CylinderGeometry(0.025, 0.03, 1, 6);
const SOIL_DRY = new Color('#b0815a');
const SOIL_WET = new Color('#6f4a33');
const SOIL_RICH = new Color('#8f6a4c');

function Soil({ farm, rev }: { farm: FarmState; rev: number }) {
  const mesh = useMemo(() => {
    const tilled = farm.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.tilled);
    const m = new InstancedMesh(SOIL_GEO, new MeshStandardMaterial({ roughness: 1 }), Math.max(1, tilled.length));
    m.count = tilled.length;
    tilled.forEach(([t, i], k) => {
      const [x, z] = tileCenter(i % GRID.cols, Math.floor(i / GRID.cols));
      dummy.position.set(x, 0.02, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      m.setColorAt(k, t.watered ? SOIL_WET : t.fertilized ? SOIL_RICH : SOIL_DRY);
    });
    m.receiveShadow = true;
    return m;
    // `rev` rebuilds it whenever the farm (mutated in place) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm, rev]);
  useEffect(() => () => mesh.dispose(), [mesh]);
  return <primitive object={mesh} />;
}

interface Part {
  geo: 'blob' | 'stake';
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
}

/** The clay parts one crop is made of at its stage. */
function cropParts(id: string, stage: number, ripe: boolean, x: number, z: number, seed: number): Part[] {
  const def = CROPS[id];
  const jitter = (k: number) => (((seed * 9301 + k * 49297) % 233280) / 233280 - 0.5) * 0.08;
  const parts: Part[] = [];
  const leaf = (dx: number, dy: number, dz: number, s: number, sy = s * 0.8) =>
    parts.push({ geo: 'blob', x: x + dx + jitter(1), y: dy, z: z + dz + jitter(2), sx: s, sy, sz: s, color: def.leaf });
  if (stage === 0) {
    parts.push({ geo: 'blob', x, y: 0.08, z, sx: 0.12, sy: 0.05, sz: 0.12, color: '#7a5235' });
    leaf(0, 0.12, 0, 0.035, 0.05);
    return parts;
  }
  if (stage === 1) {
    leaf(-0.05, 0.15, 0, 0.07, 0.04);
    leaf(0.05, 0.16, 0.02, 0.07, 0.04);
    return parts;
  }
  if (def.shape === 'vine') {
    parts.push({ geo: 'stake', x: x + 0.12, y: 0.42, z, sx: 1, sy: stage === 3 ? 0.75 : 0.6, sz: 1, color: '#a8754d' });
    const h = stage === 3 ? 0.62 : 0.45;
    for (let k = 0; k < 4; k++) leaf(Math.sin(k * 2.1) * 0.11, 0.18 + (k / 3) * (h - 0.18), Math.cos(k * 2.1) * 0.08, 0.1 - k * 0.012);
    if (ripe) for (let k = 0; k < 3; k++) parts.push({ geo: 'blob', x: x + Math.sin(k * 2.4 + 1) * 0.13, y: 0.25 + k * 0.12, z: z + 0.09, sx: 0.035, sy: 0.08, sz: 0.035, color: def.fruit });
    return parts;
  }
  if (def.shape === 'bush') {
    leaf(0, 0.2, 0, stage === 3 ? 0.22 : 0.16, stage === 3 ? 0.15 : 0.11);
    leaf(0.1, 0.17, 0.08, 0.12);
    leaf(-0.1, 0.17, -0.06, 0.12);
    if (ripe)
      for (let k = 0; k < 5; k++)
        parts.push({ geo: 'blob', x: x + Math.sin(k * 1.3) * 0.17, y: 0.18 + (k % 2) * 0.08, z: z + Math.cos(k * 1.3) * 0.15, sx: 0.05, sy: 0.055, sz: 0.05, color: def.fruit });
    return parts;
  }
  // Roots: a leafy top, and once ripe the root shows at the soil.
  const s = stage === 3 ? 1 : 0.75;
  leaf(-0.06, 0.26 * s, 0, 0.09 * s, 0.16 * s);
  leaf(0.07, 0.24 * s, 0.03, 0.08 * s, 0.14 * s);
  leaf(0, 0.28 * s, -0.06, 0.08 * s, 0.17 * s);
  if (ripe) parts.push({ geo: 'blob', x, y: 0.1, z, sx: 0.15, sy: 0.12, sz: 0.15, color: def.fruit });
  return parts;
}

function Crops({ farm, rev }: { farm: FarmState; rev: number }) {
  const meshes = useMemo(() => {
    const parts: Part[] = [];
    farm.tiles.forEach((t, i) => {
      if (!t.crop) return;
      const [x, z] = tileCenter(i % GRID.cols, Math.floor(i / GRID.cols));
      parts.push(...cropParts(t.crop.id, cropStage(t.crop), isRipe(t.crop), x, z, i));
    });
    const build = (geo: 'blob' | 'stake') => {
      const list = parts.filter((p) => p.geo === geo);
      const m = new InstancedMesh(geo === 'blob' ? BLOB_GEO : STAKE_GEO, new MeshStandardMaterial({ roughness: 0.85 }), Math.max(1, list.length));
      m.count = list.length;
      const c = new Color();
      list.forEach((p, k) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(p.sx, p.sy, p.sz);
        dummy.updateMatrix();
        m.setMatrixAt(k, dummy.matrix);
        m.setColorAt(k, c.set(p.color));
      });
      m.castShadow = true;
      return m;
    };
    return [build('blob'), build('stake')];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm, rev]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

/** A post-and-rail fence down a parcel's edge, with a "for sale" sign, until it is bought. */
function ParcelFence({ x, sign }: { x: number; sign: string }) {
  const m = getWorldMaterials();
  const z0 = GRID.z0;
  const len = GRID.rows * GRID.cell;
  const posts = Math.round(len / 1.6) + 1;
  const tex = useCanvasTexture(
    256,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#e9d2a6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5a3a22';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.fillText('FOR SALE', w / 2, h * 0.36, w - 20);
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText(sign, w / 2, h * 0.72, w - 20);
    },
    'sale-' + sign
  );
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z0 + len / 2]}>
      <CuboidCollider args={[0.08, 0.6, len / 2]} position={[0, 0.6, 0]} />
      {Array.from({ length: posts }, (_, i) => (
        <mesh key={i} position={[0, 0.38, -len / 2 + (i * len) / (posts - 1)]} material={m.wood} castShadow>
          <boxGeometry args={[0.12, 0.76, 0.12]} />
        </mesh>
      ))}
      {[0.28, 0.58].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={m.wood} castShadow>
          <boxGeometry args={[0.05, 0.08, len]} />
        </mesh>
      ))}
      <group position={[0.2, 0, len / 2 - 1.6]}>
        <mesh position={[0, 0.55, 0]} material={m.woodDark}>
          <cylinderGeometry args={[0.05, 0.06, 1.1, 8]} />
        </mesh>
        <RoundedBox args={[0.9, 0.48, 0.06]} radius={0.03} position={[0, 0.95, 0.05]} material={m.wood} castShadow />
        <mesh position={[0, 0.95, 0.085]}>
          <planeGeometry args={[0.82, 0.41]} />
          <meshStandardMaterial map={tex} roughness={0.8} />
        </mesh>
      </group>
    </RigidBody>
  );
}

/** A soft outline on the tile the hero is facing. */
function Cursor() {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const t = useSession.getState().target;
    m.visible = !!t;
    if (!t) return;
    const [x, z] = tileCenter(t[0], t[1]);
    m.position.set(x, 0.09, z);
    m.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 5) * 0.03);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.42, 0.5, 4, 1, Math.PI / 4]} />
      <meshBasicMaterial color="#fff8e7" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

export function FarmPlot() {
  const farm = useFarmState();
  const rev = useFarm((s) => s.rev);
  if (!farm) return <Cursor />;
  return (
    <>
      <Soil farm={farm} rev={rev} />
      <Crops farm={farm} rev={rev} />
      {PARCELS.filter((p) => !farm.parcels.includes(p.id)).map((p) => {
        // The fence stands on the edge the parcel shares with the home plot.
        const edge = p.cols[0] === 0 ? p.cols[1] : p.cols[0];
        return <ParcelFence key={p.id} x={GRID.x0 + edge * GRID.cell} sign={`${p.price}g · Carpenter`} />;
      })}
      <Cursor />
    </>
  );
}
