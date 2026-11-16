'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { DoubleSide, MeshStandardMaterial, Shape, ShapeGeometry } from 'three';
import { GREENHOUSE, GREENHOUSE_EXTERIOR, type Vec3 } from '@/game/data';
import { Garden, Puddles, usePumpState } from './garden';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * Mika's greenhouse (Mission 2). Outside, in Junction: a glass house with its door
 * on the path. Inside — its own map, entered through that door like the Circuit
 * Club — the beds, the watering rig and the control box (`garden.tsx`).
 */

/** Glass and white frames, shared by both sides of the door. Transparent from creation (WebGPU). */
function useGreenhouseMaterials() {
  return useMemo(
    () => ({
      glass: new MeshStandardMaterial({
        color: '#d6f2ea',
        roughness: 0.05,
        metalness: 0.1,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: DoubleSide,
      }),
      frame: new MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.5 }),
      brick: new MeshStandardMaterial({ color: '#c98d5c', roughness: 0.9 }),
    }),
    []
  );
}

/** A straight run of glass between two points on the floor plan, with white mullions every ~1.2 m. */
function GlassWall({
  from,
  to,
  bottom,
  top,
  mats,
}: {
  from: [number, number];
  to: [number, number];
  bottom: number;
  top: number;
  mats: ReturnType<typeof useGreenhouseMaterials>;
}) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const h = top - bottom;
  const posts = Math.max(1, Math.round(len / 1.2));
  return (
    <group position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation={[0, -angle, 0]}>
      <mesh position={[0, bottom + h / 2, 0]} material={mats.glass}>
        <planeGeometry args={[len, h]} />
      </mesh>
      {Array.from({ length: posts + 1 }, (_, i) => (
        <mesh key={i} position={[-len / 2 + (i * len) / posts, bottom + h / 2, 0]} material={mats.frame} castShadow>
          <boxGeometry args={[0.06, h, 0.06]} />
        </mesh>
      ))}
      {[bottom + 0.03, bottom + h * 0.55, top - 0.03].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={mats.frame}>
          <boxGeometry args={[len, 0.05, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** A potted seedling. */
function Pot({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.08, 0.18, 12]} />
        <meshStandardMaterial color="#c96f45" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.24, 0]} castShadow>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial color="#7fbf4d" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** A potting bench along a wall, crowded with seedlings. */
function PottingBench({ position, length, rotY = 0 }: { position: Vec3; length: number; rotY?: number }) {
  const m = getWorldMaterials();
  const pots = Math.floor(length / 0.36);
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, rotY, 0]}>
      <CuboidCollider args={[length / 2, 0.4, 0.28]} position={[0, 0.4, 0]} />
      <RoundedBox args={[length, 0.06, 0.56]} radius={0.02} position={[0, 0.72, 0]} material={m.wood} castShadow receiveShadow />
      <RoundedBox args={[length - 0.1, 0.04, 0.5]} radius={0.015} position={[0, 0.22, 0]} material={m.woodDark} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (length / 2 - 0.08), 0.36, sz * 0.22]} material={m.woodDark} castShadow>
            <boxGeometry args={[0.06, 0.72, 0.06]} />
          </mesh>
        ))
      )}
      {Array.from({ length: pots }, (_, i) => (
        <Pot key={i} position={[-length / 2 + 0.22 + i * 0.36, 0.75, (i % 2) * 0.12 - 0.06]} scale={0.8 + (i % 3) * 0.12} />
      ))}
    </RigidBody>
  );
}

/* ------------------------------------------------------------------ */
/* Inside — its own map                                                */
/* ------------------------------------------------------------------ */

function GreenhouseRoom() {
  const m = getWorldMaterials();
  const mats = useGreenhouseMaterials();
  const [W, D] = GREENHOUSE.size;
  const H = GREENHOUSE.wallHeight;
  const T = 0.25;
  const KNEE = 0.55;
  const frontLen = W / 2 + T - 0.85;
  const outside = useMemo(() => new MeshStandardMaterial({ color: '#fff7dc', emissive: '#fff1c8', emissiveIntensity: 1.5, toneMapped: false }), []);

  return (
    <>
      {/* Gravel floor and a stepping-stone path from the door */}
      <RoundedBox args={[W + T * 2, 0.4, D + T * 2]} radius={0.08} position={[0, -0.2, 0]} receiveShadow>
        <meshStandardMaterial color="#cdbf9f" roughness={1} />
      </RoundedBox>
      {[4.6, 3.7, 2.8].map((z, i) => (
        <mesh key={z} position={[(i % 2 ? 0.15 : -0.1), 0.02, z]} scale={[0.45, 0.05, 0.32]} material={m.stone} receiveShadow>
          <sphereGeometry args={[1, 16, 8]} />
        </mesh>
      ))}

      {/* Brick knee walls, glass above */}
      <RoundedBox args={[W + T * 2, KNEE, T]} radius={0.05} position={[0, KNEE / 2, -D / 2 - T / 2]} material={mats.brick} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[T, KNEE, D + T * 2]} radius={0.05} position={[s * (W / 2 + T / 2), KNEE / 2, 0]} material={mats.brick} castShadow receiveShadow />
      ))}
      <GlassWall from={[-W / 2 - T / 2, -D / 2 - T / 2]} to={[W / 2 + T / 2, -D / 2 - T / 2]} bottom={KNEE} top={H} mats={mats} />
      <GlassWall from={[-W / 2 - T / 2, D / 2]} to={[-W / 2 - T / 2, -D / 2 - T / 2]} bottom={KNEE} top={H} mats={mats} />
      <GlassWall from={[W / 2 + T / 2, -D / 2 - T / 2]} to={[W / 2 + T / 2, D / 2]} bottom={KNEE} top={H} mats={mats} />

      {/* Low front wall (cut away for the camera) with the doorway in the middle */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[frontLen, KNEE, T]} radius={0.05} position={[s * (0.85 + frontLen / 2), KNEE / 2, D / 2 + T / 2]} material={mats.brick} castShadow receiveShadow />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.85, 1.15, D / 2 + T / 2]} material={mats.frame} castShadow>
          <boxGeometry args={[0.12, 2.3, 0.12]} />
        </mesh>
      ))}
      <mesh position={[0, 2.32, D / 2 + T / 2]} material={mats.frame} castShadow>
        <boxGeometry args={[1.82, 0.12, 0.12]} />
      </mesh>
      <mesh position={[0, 1.12, D / 2 + T + 0.05]} material={outside}>
        <planeGeometry args={[1.58, 2.2]} />
      </mesh>

      {/* Table with plants, along the left wall of the tech area */}
      <PottingBench position={[-5.29, 0, 3.6]} length={2.15} rotY={Math.PI / 2} />
      {/* Hanging baskets */}
      {[-3.6, 3.8].map((x) => (
        <group key={x} position={[x, 2.05, -4.6]}>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.5, 4]} />
            <meshStandardMaterial color="#5a5170" />
          </mesh>
          <mesh castShadow>
            <sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <meshStandardMaterial color="#a46a3f" roughness={0.9} side={DoubleSide} />
          </mesh>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[Math.cos(k * 1.6) * 0.14, -0.12 - (k % 2) * 0.12, Math.sin(k * 1.6) * 0.14]}>
              <sphereGeometry args={[0.08, 8, 6]} />
              <meshStandardMaterial color="#6f9c43" roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** Walls of the room for physics, including an invisible blocker in the doorway (the door is an interaction). */
function GreenhouseColliders() {
  const [W, D] = GREENHOUSE.size;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[W / 2 + 0.5, 0.5, D / 2 + 0.5]} position={[0, -0.5, 0]} />
      <CuboidCollider args={[W / 2 + 0.3, 1.5, 0.15]} position={[0, 1.5, -D / 2 - 0.15]} />
      <CuboidCollider args={[0.15, 1.5, D / 2 + 0.3]} position={[-W / 2 - 0.15, 1.5, 0]} />
      <CuboidCollider args={[0.15, 1.5, D / 2 + 0.3]} position={[W / 2 + 0.15, 1.5, 0]} />
      <CuboidCollider args={[W / 2 + 0.3, 1.5, 0.15]} position={[0, 1.5, D / 2 + 0.15]} />
    </RigidBody>
  );
}

/** The greenhouse interior map, where Mission 2 takes place. */
export function GreenhouseInterior() {
  return (
    <group>
      <group position={GREENHOUSE.origin}>
        <GreenhouseRoom />
        <GreenhouseColliders />
      </group>
      <Garden />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Outside — in Junction                                               */
/* ------------------------------------------------------------------ */

const EAVE = 2.0;
/** The interior set's scale inside the exterior: its 12 m width into the glass house (a little taller, so it reads). */
const INSIDE = (GREENHOUSE_EXTERIOR.w - 0.3) / GREENHOUSE.size[0];
const RISE = 1.1;

/** Mika's greenhouse as seen from the path: a glass house with a gabled glass roof. */
export function GreenhouseExterior() {
  const m = getWorldMaterials();
  const mats = useGreenhouseMaterials();
  const pump = usePumpState();
  const { x, z, w, d } = GREENHOUSE_EXTERIOR;
  const half = d / 2;
  const slope = Math.hypot(half, RISE);
  const angle = Math.atan2(RISE, half);
  const gable = useMemo(() => {
    const s = new Shape();
    s.moveTo(-half, 0);
    s.lineTo(half, 0);
    s.lineTo(0, RISE);
    s.lineTo(-half, 0);
    const geo = new ShapeGeometry(s);
    geo.rotateY(Math.PI / 2);
    return geo;
  }, [half]);
  const sign = useCanvasTexture(
    512,
    116,
    (ctx, cw, ch) => {
      ctx.fillStyle = '#4fae8a';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#fff8ec';
      ctx.font = 'bold 50px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("MIKA'S GREENHOUSE", cw / 2, ch / 2 + 3, cw - 30);
    },
    'greenhouse-sign'
  );
  const doorGap = 0.55;
  const frontPiece = w / 2 - doorGap;

  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
        <CuboidCollider args={[w / 2 + 0.1, 1.5, d / 2 + 0.1]} position={[0, 1.5, 0]} />
        {/* Floor and brick base */}
        <RoundedBox args={[w, 0.1, d]} radius={0.03} position={[0, 0.05, 0]} receiveShadow>
          <meshStandardMaterial color="#cdbf9f" roughness={1} />
        </RoundedBox>
        <RoundedBox args={[w + 0.2, 0.5, 0.2]} radius={0.04} position={[0, 0.25, -half]} material={mats.brick} castShadow receiveShadow />
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[0.2, 0.5, d + 0.2]} radius={0.04} position={[s * (w / 2), 0.25, 0]} material={mats.brick} castShadow receiveShadow />
        ))}
        {[-1, 1].map((s) => (
          <RoundedBox
            key={s}
            args={[frontPiece, 0.5, 0.2]}
            radius={0.04}
            position={[s * (doorGap + frontPiece / 2), 0.25, half]}
            material={mats.brick}
            castShadow
            receiveShadow
          />
        ))}
        {/* Glass walls */}
        <GlassWall from={[-w / 2, -half]} to={[w / 2, -half]} bottom={0.5} top={EAVE} mats={mats} />
        <GlassWall from={[-w / 2, half]} to={[-w / 2, -half]} bottom={0.5} top={EAVE} mats={mats} />
        <GlassWall from={[w / 2, -half]} to={[w / 2, half]} bottom={0.5} top={EAVE} mats={mats} />
        <GlassWall from={[-w / 2, half]} to={[-doorGap, half]} bottom={0.5} top={EAVE} mats={mats} />
        <GlassWall from={[doorGap, half]} to={[w / 2, half]} bottom={0.5} top={EAVE} mats={mats} />
        {/* Door: white frame, glass door standing ajar */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * doorGap, 1.0, half]} material={mats.frame} castShadow>
            <boxGeometry args={[0.08, 2.0, 0.1]} />
          </mesh>
        ))}
        <mesh position={[0, 1.96, half]} material={mats.frame}>
          <boxGeometry args={[doorGap * 2 + 0.08, 0.08, 0.1]} />
        </mesh>
        <group position={[-doorGap, 0, half]} rotation={[0, -0.5, 0]}>
          <mesh position={[doorGap, 1.0, 0]} material={mats.glass}>
            <planeGeometry args={[doorGap * 2 - 0.06, 1.86]} />
          </mesh>
          <mesh position={[doorGap, 1.0, 0]} material={mats.frame}>
            <boxGeometry args={[doorGap * 2 - 0.06, 0.05, 0.04]} />
          </mesh>
          {[0.05, doorGap * 2 - 0.1].map((dx) => (
            <mesh key={dx} position={[dx + 0.02, 1.0, 0]} material={mats.frame}>
              <boxGeometry args={[0.05, 1.9, 0.04]} />
            </mesh>
          ))}
        </group>
        {/* Gabled glass roof, ridge along x */}
        {[1, -1].map((side) => (
          <group key={side}>
            <mesh position={[0, EAVE + RISE / 2, (side * half) / 2]} rotation={[side * angle, 0, 0]} material={mats.glass}>
              <boxGeometry args={[w + 0.1, 0.02, slope]} />
            </mesh>
            {[-w / 2, -w / 4, 0, w / 4, w / 2].map((rx) => (
              <mesh key={rx} position={[rx, EAVE + RISE / 2 + 0.02, (side * half) / 2]} rotation={[side * angle, 0, 0]} material={mats.frame} castShadow>
                <boxGeometry args={[0.06, 0.06, slope]} />
              </mesh>
            ))}
            <mesh position={[0, EAVE, side * half]} material={mats.frame}>
              <boxGeometry args={[w + 0.1, 0.07, 0.08]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, EAVE + RISE, 0]} material={mats.frame} castShadow>
          <boxGeometry args={[w + 0.14, 0.08, 0.1]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={gable} position={[s * (w / 2), EAVE, 0]} material={mats.glass} />
        ))}
      </RigidBody>
      {/*
        Seen through the glass: the interior's own set (farm plots and crops, the tank and pump, the tech
        area's tables, sacks and control box — Mika is a cast member, not part of it), scaled to fit.
      */}
      <group position={[x, 0.1, z]} scale={[INSIDE, INSIDE * 1.15, INSIDE]}>
        <group position={[-GREENHOUSE.origin[0], 0, -GREENHOUSE.origin[2]]}>
          <Garden sounds={false} />
        </group>
      </group>
      {/* Name plaque on a post, left of the door */}
      <group position={[x - 1.55, 0, z + half + 0.45]}>
        <mesh position={[0, 0.55, -0.06]} material={m.woodDark} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 1.1, 8]} />
        </mesh>
        <RoundedBox args={[1.3, 0.34, 0.07]} radius={0.03} position={[0, 1.05, 0]} material={m.woodDark} castShadow />
        <mesh position={[0, 1.05, 0.04]}>
          <planeGeometry args={[1.2, 0.27]} />
          <meshStandardMaterial map={sign} roughness={0.8} />
        </mesh>
      </group>
      {/* Water seeping out under the door while the pump floods the beds */}
      <Puddles pump={pump} puddles={[[[x + 0.2, 0, z + half + 0.6], 0.6]]} />
      {/* Pots by the door */}
      <Pot position={[x + 1.0, 0, z + half + 0.35]} />
      <Pot position={[x + 1.3, 0, z + half + 0.25]} scale={0.8} />
    </>
  );
}
