'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { LatheGeometry, Vector2 } from 'three';
import { TAVERN } from '@/game/data';
import { Cottage } from './cottage';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/** A barrel's bulging side, lathed round y (height 1, widest 1 at the middle). */
const BARREL_GEO = (() => {
  const pts: Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new Vector2(0.82 + Math.sin(t * Math.PI) * 0.18, t - 0.5));
  }
  return new LatheGeometry(pts, 18);
})();

/** An oak barrel with two dark hoops. Stands on end; `lying` turns it on its side (axis along x). */
export function Barrel({ position, radius = 0.3, height = 0.7, lying = false }: { position: [number, number, number]; radius?: number; height?: number; lying?: boolean }) {
  const m = getWorldMaterials();
  return (
    <group position={position} rotation={lying ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
      <mesh geometry={BARREL_GEO} scale={[radius, height, radius]} material={m.wood} castShadow receiveShadow />
      {/* Lids */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, (s * height) / 2, 0]} material={m.woodDark}>
          <cylinderGeometry args={[radius * 0.82, radius * 0.82, 0.02, 18]} />
        </mesh>
      ))}
      {[-0.3, 0.3].map((t) => (
        <mesh key={t} position={[0, t * height, 0]}>
          <cylinderGeometry args={[radius * 0.97, radius * 0.97, 0.05, 18, 1, true]} />
          <meshStandardMaterial color="#3a3440" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** A picnic table with a bench either side and two mugs of cider on it. */
function PicnicTable({ x, z }: { x: number; z: number }) {
  const m = getWorldMaterials();
  return (
    <group position={[x, 0, z]}>
      <CuboidCollider args={[0.62, 0.4, 0.62]} position={[0, 0.4, 0]} />
      <RoundedBox args={[1.25, 0.07, 0.62]} radius={0.025} position={[0, 0.7, 0]} material={m.wood} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.48, 0.34, 0]} material={m.woodDark} castShadow>
            <boxGeometry args={[0.07, 0.68, 0.5]} />
          </mesh>
          <RoundedBox args={[1.25, 0.06, 0.24]} radius={0.02} position={[0, 0.4, s * 0.5]} material={m.wood} castShadow receiveShadow />
          {/* A mug: amber cider under a white head of foam */}
          <group position={[s * 0.3, 0.74, s * 0.1]}>
            <mesh position={[0, 0.07, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.13, 12]} />
              <meshStandardMaterial color="#e3a03a" roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.145, 0]}>
              <sphereGeometry args={[0.052, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#fff8ea" roughness={0.9} />
            </mesh>
            <mesh position={[0.065, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.035, 0.012, 6, 12]} />
              <meshStandardMaterial color="#e3a03a" roughness={0.35} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/** The tavern's hanging sign: a frothy mug on a board, swinging from an iron bracket off the corner. */
function HangingSign({ x, y, z }: { x: number; y: number; z: number }) {
  const m = getWorldMaterials();
  const art = useCanvasTexture(
    256,
    220,
    (ctx, w, h) => {
      ctx.fillStyle = '#7a4a32';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5e3624';
      ctx.fillRect(10, 10, w - 20, h - 20);
      // The mug: amber body, handle, foam
      ctx.fillStyle = '#f2b544';
      ctx.fillRect(78, 74, 86, 104);
      ctx.strokeStyle = '#f2b544';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(170, 126, 26, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.fillStyle = '#fff4dc';
      for (const [cx, r] of [
        [86, 24],
        [116, 28],
        [148, 24],
      ]) {
        ctx.beginPath();
        ctx.arc(cx, 70, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(92, 92, 12, 70);
    },
    'tavern-sign'
  );
  return (
    <group position={[x, y, z]}>
      {/* Bracket out from the wall, and the two chains */}
      <mesh position={[0.4, 0, 0]}>
        <boxGeometry args={[0.85, 0.05, 0.05]} />
        <meshStandardMaterial color="#3a3440" metalness={0.4} roughness={0.5} />
      </mesh>
      {[0.2, 0.62].map((cx) => (
        <mesh key={cx} position={[cx, -0.1, 0]}>
          <boxGeometry args={[0.02, 0.2, 0.02]} />
          <meshStandardMaterial color="#3a3440" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <RoundedBox args={[0.6, 0.52, 0.06]} radius={0.03} position={[0.41, -0.46, 0]} material={m.woodDark} castShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.41, -0.46, s * 0.032]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <planeGeometry args={[0.52, 0.44]} />
          <meshStandardMaterial map={art} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The tavern on the lot beside the tractor: a two-storey town building with a shopfront, a mug on
 * a hanging sign, barrels by the door and picnic tables out front by the field road.
 */
export function Tavern() {
  const m = getWorldMaterials();
  const { x, z, w, d, rot } = TAVERN;
  const stones = useMemo(() => [d / 2 + 0.75, d / 2 + 1.45], [d]);
  return (
    <>
      <Cottage plan={TAVERN} />
      <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, rot, 0]}>
        <HangingSign x={w / 2 + 0.02} y={2.75} z={d / 2 - 0.35} />
        {[-1, 1].map((s) => (
          <group key={s}>
            <CuboidCollider args={[0.3, 0.35, 0.3]} position={[s * (w / 2 - 0.3), 0.35, d / 2 + 0.32]} />
            <Barrel position={[s * (w / 2 - 0.3), 0.35, d / 2 + 0.32]} />
            <PicnicTable x={s * 1.5} z={d / 2 + 1.2} />
          </group>
        ))}
        {stones.map((sz, i) => (
          <mesh key={i} position={[i ? 0.12 : -0.1, 0.06, sz]} scale={[0.42, 0.07, 0.3]} material={m.stone} receiveShadow>
            <sphereGeometry args={[1, 16, 8]} />
          </mesh>
        ))}
      </RigidBody>
    </>
  );
}
