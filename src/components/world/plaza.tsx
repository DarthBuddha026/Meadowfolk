'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { Color, DoubleSide, InstancedMesh, MeshStandardMaterial, Object3D, type Group, type Mesh } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BENCHES, LANDMARKS } from '@/game/data';
import { PATH_TOP } from '@/game/engine/terrain';
import { getWorldMaterials } from './materials';

/**
 * The town plaza: a two-tier stone fountain in the middle (water spilling from bowl to bowl, a
 * little jet on top, ripples in the basin), a ring of paving stones round it, and iron lamp posts
 * beside the benches (see BENCHES) that light up at dusk with the town's lanterns.
 */

const STONE = new MeshStandardMaterial({ color: '#e3d5bd', roughness: 0.9 });
const STONE_LIGHT = new MeshStandardMaterial({ color: '#efe6d6', roughness: 0.85 });
const STONE_DARK = new MeshStandardMaterial({ color: '#cdbb9c', roughness: 0.9 });
const WATER = new MeshStandardMaterial({ color: '#7fc6d4', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: '#2e7f95', emissiveIntensity: 0.25 });
const FALL = new MeshStandardMaterial({ color: '#bfe8f0', roughness: 0.1, transparent: true, opacity: 0.38, side: DoubleSide, depthWrite: false });
const SPRAY = new MeshStandardMaterial({ color: '#e6f7fb', roughness: 0.1, transparent: true, opacity: 0.8 });
const IRON = new MeshStandardMaterial({ color: '#3d3a44', roughness: 0.55, metalness: 0.3 });
/** Ripples fade as they spread, each with its own material (made transparent up front). */
const RIPPLES = [0, 1, 2].map(() => new MeshStandardMaterial({ color: '#e6f7fb', roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false }));

const BASIN_R = 1.75;
const BASIN_H = 0.5;
const BOWL_Y = 1.3;
const TOP_Y = 1.95;

function Fountain() {
  const fall = useRef<Group>(null);
  const ripples = useRef<(Mesh | null)[]>([]);
  const drops = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // The falling curtains shimmer a little.
    if (fall.current) fall.current.children.forEach((c, i) => c.scale.set(1 + Math.sin(t * 6 + i) * 0.015, 1, 1 + Math.cos(t * 5 + i) * 0.015));
    // Rings spread out from where the water lands, and fade.
    ripples.current.forEach((m, i) => {
      if (!m) return;
      const k = (t * 0.45 + i / 3) % 1;
      const r = 1.0 + k * 0.6;
      m.scale.set(r, r, 1);
      RIPPLES[i].opacity = 0.5 * (1 - k);
    });
    // Droplets arc up from the jet and fall back into the top bowl.
    drops.current.forEach((m, i) => {
      if (!m) return;
      const k = (t * 0.9 + i / drops.current.length) % 1;
      const a = (i / drops.current.length) * Math.PI * 2;
      const d = 0.08 + k * 0.28;
      m.position.set(Math.cos(a) * d, TOP_Y + 0.45 + k * 0.5 - k * k * 0.85, Math.sin(a) * d);
    });
  });
  const [x, z] = LANDMARKS.fountain;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, PATH_TOP, z]}>
      <CylinderCollider args={[1.2, BASIN_R + 0.1]} position={[0, 1.2, 0]} />
      {/* The basin: a stone wall with a rounded lip, pebbles round its foot, and water inside. */}
      <mesh position={[0, BASIN_H / 2, 0]} material={STONE} castShadow receiveShadow>
        <cylinderGeometry args={[BASIN_R, BASIN_R + 0.08, BASIN_H, 40]} />
      </mesh>
      <mesh position={[0, BASIN_H, 0]} rotation={[Math.PI / 2, 0, 0]} material={STONE_LIGHT} castShadow>
        <torusGeometry args={[BASIN_R - 0.06, 0.13, 10, 48]} />
      </mesh>
      {Array.from({ length: 20 }).map((_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * (BASIN_R + 0.18), 0.08, Math.sin(a) * (BASIN_R + 0.18)]} rotation={[0, -a, 0]} scale={[0.3, 0.18, 0.24]} material={STONE_DARK} castShadow receiveShadow>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        );
      })}
      {/* The water sits on the basin's top, inside the raised lip. */}
      <mesh position={[0, BASIN_H + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={WATER}>
        <circleGeometry args={[BASIN_R - 0.14, 40]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => void (ripples.current[i] = m)} position={[0, BASIN_H + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={RIPPLES[i]}>
          <ringGeometry args={[0.92, 0.97, 40]} />
        </mesh>
      ))}
      {/* The column and the middle bowl, with its own water and a curtain spilling into the basin. */}
      <mesh position={[0, (BASIN_H + BOWL_Y) / 2, 0]} material={STONE} castShadow>
        <cylinderGeometry args={[0.22, 0.32, BOWL_Y - BASIN_H + 0.1, 20]} />
      </mesh>
      <mesh position={[0, BOWL_Y, 0]} material={STONE_LIGHT} castShadow receiveShadow>
        <cylinderGeometry args={[0.85, 0.32, 0.3, 32]} />
      </mesh>
      <mesh position={[0, BOWL_Y + 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} material={WATER}>
        <circleGeometry args={[0.76, 32]} />
      </mesh>
      {/* The top: a slimmer column, a small bowl, and the jet. */}
      <mesh position={[0, (BOWL_Y + TOP_Y) / 2, 0]} material={STONE} castShadow>
        <cylinderGeometry args={[0.11, 0.16, TOP_Y - BOWL_Y, 16]} />
      </mesh>
      <mesh position={[0, TOP_Y, 0]} material={STONE_LIGHT} castShadow>
        <cylinderGeometry args={[0.36, 0.14, 0.18, 24]} />
      </mesh>
      <mesh position={[0, TOP_Y + 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} material={WATER}>
        <circleGeometry args={[0.31, 24]} />
      </mesh>
      <mesh position={[0, TOP_Y + 0.25, 0]} material={SPRAY}>
        <cylinderGeometry args={[0.03, 0.05, 0.35, 8]} />
      </mesh>
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} ref={(m) => void (drops.current[i] = m)} material={SPRAY}>
          <sphereGeometry args={[0.04, 8, 6]} />
        </mesh>
      ))}
      <group ref={fall}>
        <mesh position={[0, (TOP_Y + BOWL_Y + 0.13) / 2, 0]} material={FALL}>
          <cylinderGeometry args={[0.34, 0.6, TOP_Y - BOWL_Y - 0.1, 24, 1, true]} />
        </mesh>
        <mesh position={[0, (BOWL_Y + BASIN_H) / 2, 0]} material={FALL}>
          <cylinderGeometry args={[0.86, 1.0, BOWL_Y - BASIN_H, 32, 1, true]} />
        </mesh>
      </group>
    </RigidBody>
  );
}

/** Concentric rings of paving stones round the fountain, a darker course at the edge. */
function Paving() {
  const mesh = useMemo(() => {
    const [cx, cz] = LANDMARKS.fountain;
    const stones: { x: number; z: number; rot: number; w: number; edge: boolean }[] = [];
    for (let r = 2.2, ring = 0; r <= 4.25; r += 0.46, ring++) {
      const edge = r + 0.46 > 4.25;
      const n = Math.round((Math.PI * 2 * r) / 0.5);
      for (let k = 0; k < n; k++) {
        const a = ((k + (ring % 2) * 0.5) / n) * Math.PI * 2;
        stones.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, rot: -a, w: (Math.PI * 2 * r) / n - 0.06, edge });
      }
    }
    const geo = new RoundedBoxGeometry(1, 0.05, 0.4, 2, 0.02);
    const inst = new InstancedMesh(geo, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), stones.length);
    const o = new Object3D();
    const c = new Color();
    const tones = ['#e8dcc6', '#ddcfb5', '#efe5d2', '#d6c7aa'];
    stones.forEach((s, i) => {
      o.position.set(s.x, PATH_TOP + 0.01, s.z);
      o.rotation.set(0, s.rot + Math.PI / 2, 0);
      o.scale.set(s.w, 1, 1);
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
      inst.setColorAt(i, c.set(s.edge ? '#bfa98a' : tones[(i * 7) % tones.length]));
    });
    inst.receiveShadow = true;
    return inst;
  }, []);
  return <primitive object={mesh} />;
}

/** An iron lamp post: a fluted pole on a plinth, a scrolled arm and a glowing lantern. */
function LampPost({ x, z, rot }: { x: number; z: number; rot: number }) {
  const m = getWorldMaterials();
  return (
    <RigidBody type="fixed" colliders={false} position={[x, PATH_TOP, z]} rotation={[0, rot, 0]}>
      <CylinderCollider args={[1.3, 0.16]} position={[0, 1.3, 0]} />
      <RoundedBox args={[0.34, 0.3, 0.34]} radius={0.05} position={[0, 0.15, 0]} material={IRON} castShadow />
      <mesh position={[0, 1.4, 0]} material={IRON} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 2.5, 10]} />
      </mesh>
      <mesh position={[0, 2.68, 0]} material={IRON}>
        <sphereGeometry args={[0.08, 10, 8]} />
      </mesh>
      {/* Two lanterns on a cross arm. */}
      <mesh position={[0, 2.55, 0]} rotation={[0, 0, Math.PI / 2]} material={IRON}>
        <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.42, 2.38, 0]}>
          <RoundedBox args={[0.24, 0.3, 0.24]} radius={0.04} material={m.lanternGlow} />
          <mesh position={[0, 0.2, 0]} material={IRON} castShadow>
            <coneGeometry args={[0.2, 0.14, 4]} />
          </mesh>
          <mesh position={[0, -0.17, 0]} material={IRON}>
            <cylinderGeometry args={[0.1, 0.06, 0.05, 8]} />
          </mesh>
          <mesh position={[0, 0.3, 0]} material={IRON}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 6]} />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

export function TownPlaza() {
  // A lamp post beside each bench (on its left as you sit), a little behind it.
  const lamps = BENCHES.map((b) => ({ x: b.x - Math.cos(b.rot) * 1.25 - Math.sin(b.rot) * 0.25, z: b.z + Math.sin(b.rot) * 1.25 - Math.cos(b.rot) * 0.25, rot: b.rot }));
  return (
    <>
      <Paving />
      <Fountain />
      {lamps.map((l, i) => (
        <LampPost key={i} {...l} />
      ))}
    </>
  );
}
