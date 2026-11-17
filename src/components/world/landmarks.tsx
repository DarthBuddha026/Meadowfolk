'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Color, InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three';
import { BENCHES, CARPENTER_HOUSE, FRUIT_STAND, HOUSES, SIGNPOSTS } from '@/game/data';
import { getSteppingStones, STONE } from '@/game/engine/terrain';
import { Cottage } from './cottage';
import { TownPlaza } from './plaza';
import { EastSide } from './east-side';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/** Flat stepping stones laid along the walkways from the roads to the houses' doors. */
function SteppingStones() {
  const m = getWorldMaterials();
  const mesh = useMemo(() => {
    const stones = getSteppingStones();
    const o = new Object3D();
    const inst = new InstancedMesh(new SphereGeometry(1, 14, 6), m.stone, stones.length);
    stones.forEach(([x, z, s, r], i) => {
      o.position.set(x, STONE.y, z);
      o.rotation.set(0, r, 0);
      o.scale.set(STONE.rx * s, STONE.rise, STONE.rz * s);
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
    });
    inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    return inst;
  }, [m]);
  return <primitive object={mesh} />;
}

/** Fruit kinds: colour and squash (bananas, pears and lemons are stretched). */
const FRUIT = {
  apple: { color: '#b81d2a', scale: [1, 0.95, 1] },
  orange: { color: '#f39a2b', scale: [1.05, 1.05, 1.05] },
  pear: { color: '#c9dd6a', scale: [0.9, 1.2, 0.9] },
  lemon: { color: '#f5d94a', scale: [0.85, 0.85, 1.15] },
  banana: { color: '#f2d24c', scale: [0.7, 0.7, 2] },
  pomegranate: { color: '#a8263a', scale: [1.15, 1.05, 1.15] },
} satisfies Record<string, { color: string; scale: [number, number, number] }>;

type FruitKind = keyof typeof FRUIT;

const PALE_WOOD = '#e2c49a';
const POST_WOOD = '#c9a274';

/**
 * A slatted wooden crate, open at the top: corner posts, horizontal slats with gaps on
 * every side, and a floor. Sits on y = 0; inner dividers split it into `bays` along x.
 */
function SlatCrate({ w, h, d, bays, position }: { w: number; h: number; d: number; bays: number; position: [number, number, number] }) {
  const slats = Math.max(2, Math.round(h / 0.17));
  const pitch = h / slats;
  // Slats and floor fit between the corner posts (P thick), so nothing overlaps.
  const P = 0.06;
  return (
    <group position={position}>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (w / 2 - P / 2), h / 2, sz * (d / 2 - P / 2)]} castShadow>
            <boxGeometry args={[P, h, P]} />
            <meshStandardMaterial color={POST_WOOD} roughness={0.85} />
          </mesh>
        ))
      )}
      {Array.from({ length: slats }, (_, k) => {
        const y = pitch * (k + 0.5);
        const t = pitch * 0.72;
        return (
          <group key={k}>
            {[-1, 1].map((s) => (
              <group key={s}>
                <mesh position={[0, y, s * (d / 2 - P / 2)]} castShadow receiveShadow>
                  <boxGeometry args={[w - P * 2, t, 0.025]} />
                  <meshStandardMaterial color={PALE_WOOD} roughness={0.85} />
                </mesh>
                <mesh position={[s * (w / 2 - P / 2), y, 0]} castShadow>
                  <boxGeometry args={[0.025, t, d - P * 2]} />
                  <meshStandardMaterial color={PALE_WOOD} roughness={0.85} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}
      <mesh position={[0, h - 0.06, 0]}>
        <boxGeometry args={[w - P * 2, 0.03, d - P * 2]} />
        <meshStandardMaterial color="#9c7a52" roughness={0.9} />
      </mesh>
      {Array.from({ length: bays - 1 }, (_, i) => (
        <mesh key={i} position={[-w / 2 + ((i + 1) * w) / bays, h - 0.03, 0]}>
          <boxGeometry args={[0.03, 0.08, d - P * 2]} />
          <meshStandardMaterial color={PALE_WOOD} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A heaped bay of fruit: a full bottom layer and a smaller layer on top, so it mounds
 * over the crate rim. Returns instance transforms + colours.
 */
function heap(kind: FruitKind, cx: number, y: number, cz: number, w: number, d: number, r: number) {
  const out: { p: [number, number, number]; s: [number, number, number]; rot: number; color: string }[] = [];
  const { color, scale } = FRUIT[kind];
  const sx = r * 2 * scale[0];
  const sz = r * 2 * (kind === 'banana' ? 1.1 : scale[2]);
  for (let layer = 0; layer < 2; layer++) {
    const nx = Math.max(1, Math.floor((w - 0.04) / sx) - layer);
    const nz = Math.max(1, Math.floor((d - 0.04) / sz) - layer);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const k = out.length;
        out.push({
          p: [cx + (i - (nx - 1) / 2) * sx, y + r * scale[1] * (0.9 + layer * 1.5), cz + (j - (nz - 1) / 2) * sz],
          s: scale as [number, number, number],
          rot: kind === 'banana' ? 0.25 * ((k % 3) - 1) : k * 1.3,
          color,
        });
      }
    }
  }
  return out;
}

/** The grocery's fruit stand, after a market display: two slatted crates below, a raised crate shelf behind, fruit heaped in every bay. Front faces +z. */
function FruitStand() {
  const LOW = { h: 0.66, d: 0.62, w: 0.9 };
  const HIGH = { y: 0.86, h: 0.24, d: 0.34, w: 1.8, z: -0.2 };
  const fruit = useMemo(() => {
    const r = 0.055;
    const low: FruitKind[] = ['pomegranate', 'orange', 'pear', 'lemon'];
    const high: FruitKind[] = ['lemon', 'apple', 'banana'];
    const bayW = LOW.w / 2;
    const items = [
      // Lower crates: the front part of each crate's top, in front of the shelf posts.
      ...low.flatMap((kind, i) => heap(kind, -LOW.w + bayW * (i + 0.5), LOW.h - 0.06, 0.12, bayW, LOW.d - 0.22, r)),
      ...high.flatMap((kind, i) => heap(kind, -HIGH.w / 2 + (HIGH.w / 3) * (i + 0.5), HIGH.y + HIGH.h - 0.06, HIGH.z, HIGH.w / 3, HIGH.d, r)),
    ];
    const o = new Object3D();
    const c = new Color();
    const mesh = new InstancedMesh(new SphereGeometry(r, 12, 9), new MeshStandardMaterial({ roughness: 0.5 }), items.length);
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(0, it.rot, 0);
      o.scale.set(...it.s);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(it.color).multiplyScalar(0.9 + (i % 4) * 0.04));
    });
    mesh.castShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
    // The layout constants are fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RigidBody type="fixed" colliders={false} position={[FRUIT_STAND.x, 0, FRUIT_STAND.z]}>
      <CuboidCollider args={[LOW.w, 0.55, LOW.d / 2]} position={[0, 0.55, 0]} />
      {[-1, 1].map((s) => (
        <SlatCrate key={s} w={LOW.w} h={LOW.h} d={LOW.d} bays={2} position={[s * (LOW.w / 2 + 0.01), 0, 0]} />
      ))}
      {/* Raised crate shelf at the back, on a post at each end */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HIGH.w / 2 - 0.03), (LOW.h + HIGH.y) / 2, HIGH.z]} castShadow>
          <boxGeometry args={[0.06, HIGH.y - LOW.h, 0.06]} />
          <meshStandardMaterial color={POST_WOOD} roughness={0.85} />
        </mesh>
      ))}
      <SlatCrate w={HIGH.w} h={HIGH.h} d={HIGH.d} bays={3} position={[0, HIGH.y, HIGH.z]} />
      <primitive object={fruit} />
    </RigidBody>
  );
}

/** A wooden park bench on the plaza; the seat faces +z rotated by `rot`. */
function Bench({ x, z, rot }: { x: number; z: number; rot: number }) {
  const m = getWorldMaterials();
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, rot, 0]}>
      <CuboidCollider args={[0.8, 0.45, 0.3]} position={[0, 0.45, 0]} />
      {[-0.12, 0.08].map((dz) => (
        <RoundedBox key={dz} args={[1.6, 0.07, 0.18]} radius={0.03} position={[0, 0.44, dz]} material={m.wood} castShadow receiveShadow />
      ))}
      {[0.6, 0.8].map((y) => (
        <RoundedBox key={y} args={[1.6, 0.13, 0.06]} radius={0.025} position={[0, y, -0.24]} rotation={[-0.12, 0, 0]} material={m.wood} castShadow />
      ))}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.68, 0, 0]}>
          <RoundedBox args={[0.08, 0.42, 0.36]} radius={0.02} position={[0, 0.21, -0.02]} material={m.woodDark} castShadow />
          <RoundedBox args={[0.08, 0.5, 0.07]} radius={0.02} position={[0, 0.65, -0.25]} rotation={[-0.12, 0, 0]} material={m.woodDark} castShadow />
        </group>
      ))}
    </RigidBody>
  );
}

/** Wooden arrow sign, like a trail marker. */
function Signpost({ x, z, rot, text }: { x: number; z: number; rot: number; text: string }) {
  const m = getWorldMaterials();
  const tex = useCanvasTexture(
    256,
    96,
    (ctx, w, h) => {
      ctx.fillStyle = '#d29a5f';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff4dc';
      ctx.font = 'bold 44px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 2, w - 24);
    },
    text
  );
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {/* Post stands behind the board (board back is at z −0.05) so it never covers the lettering. */}
      <mesh position={[0, 0.6, -0.13]} material={m.woodDark} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 1.2, 8]} />
      </mesh>
      <RoundedBox args={[1.25, 0.42, 0.1]} radius={0.05} position={[0.25, 1.05, 0]} material={m.wood} castShadow />
      <mesh position={[0.25, 1.05, 0.056]}>
        <planeGeometry args={[1.12, 0.38]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Bram the carpenter's workshop. */
function CarpenterHouse() {
  const m = getWorldMaterials();
  const c = CARPENTER_HOUSE;
  const sign = useCanvasTexture(
    512,
    116,
    (ctx, w, h) => {
      ctx.fillStyle = '#c98d57';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff4dc';
      ctx.font = 'bold 56px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CARPENTER', w / 2, h / 2 + 3, w - 30);
    },
    'carpenter'
  );
  return (
    <>
      <Cottage plan={{ x: c.x, z: c.z, w: c.w, d: c.d, rot: 0, wall: c.wall, roof: c.roof }} />
      {/* Name plaque left of the door, low enough that the roof overhang, the door's signal
          marker and the help bubble above the door never cover it from the follow camera. */}
      <group position={[c.x - 1.4, 1.1, c.z + c.d / 2 + 0.08]}>
        <RoundedBox args={[1.5, 0.4, 0.08]} radius={0.04} material={m.woodDark} castShadow />
        <mesh position={[0, 0, 0.046]}>
          <planeGeometry args={[1.38, 0.31]} />
          <meshStandardMaterial map={sign} roughness={0.8} />
        </mesh>
      </group>
      {/* Doorstep path stones */}
      {[0.9, 1.6].map((dz, i) => (
        <mesh key={i} position={[c.x + (i ? 0.2 : -0.15), 0.06, c.z + c.d / 2 + dz]} scale={[0.42, 0.07, 0.3]} material={m.stone} receiveShadow>
          <sphereGeometry args={[1, 16, 8]} />
        </mesh>
      ))}
    </>
  );
}

export function Landmarks() {
  return (
    <>
      <TownPlaza />
      <EastSide />
      <SteppingStones />
      <FruitStand />
      {BENCHES.map((b, i) => (
        <Bench key={i} {...b} />
      ))}
      {HOUSES.map((h, i) => (
        <Cottage key={i} plan={h} />
      ))}
      <CarpenterHouse />
      {SIGNPOSTS.map((s) => (
        <Signpost key={s.text} {...s} />
      ))}
    </>
  );
}

