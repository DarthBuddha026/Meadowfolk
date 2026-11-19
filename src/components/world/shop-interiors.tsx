'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { DoubleSide, MeshStandardMaterial } from 'three';
import { shopRoom } from '@/game/data';
import { useSession } from '@/game/state/session-store';
import { getWorldMaterials } from './materials';
import { Barrel } from './tavern';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * The insides of the General Store, the Carpenter's workshop and the tavern: rooms of their own off the map,
 * in the same look as the house's (a room floating in the dark on a wooden slab, full-height back
 * and side walls with a wainscot, a low front wall with the door's wooden frame and the bright
 * outdoors glowing through it). The keeper stands behind the counter (see Shopkeepers); you shop
 * standing in front of it.
 */

const WALL_H = 2.4;
const WALL_T = 0.2;
const DOOR_W = 1.5;

const cache = new Map<string, MeshStandardMaterial>();
function mat(color: string, opts: { emissive?: string; intensity?: number; rough?: number } = {}) {
  const key = color + JSON.stringify(opts);
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85 });
    if (opts.emissive) {
      m.emissive.set(opts.emissive);
      m.emissiveIntensity = opts.intensity ?? 1;
    }
    cache.set(key, m);
  }
  return m;
}
const GLOW = new MeshStandardMaterial({ color: '#fff1d0', emissive: '#ffe2a8', emissiveIntensity: 1.6, toneMapped: false, side: DoubleSide });
const WINDOW = () => mat('#dff2fb', { emissive: '#cfeeff', intensity: 0.9, rough: 0.2 });
const PLASTER = '#f3e7d2';

type V3 = [number, number, number];

function Box({ p, s, c, r = 0.04 }: { p: V3; s: V3; c: MeshStandardMaterial; r?: number }) {
  return <RoundedBox args={s} radius={Math.min(r, ...s.map((v) => v / 2 - 0.001))} position={p} material={c} castShadow receiveShadow />;
}

/** Solid boxes, in room-local coordinates: [x, z, w, d] (full height). */
type Solid = [number, number, number, number];

function RoomShell({ id, solids }: { id: string; solids: Solid[] }) {
  const r = shopRoom(id);
  const w = getWorldMaterials();
  const hw = r.w / 2;
  const hd = r.d / 2;
  const planks = useMemo(() => {
    const n = Math.round(r.w / 0.5);
    return Array.from({ length: n }, (_, i) => -hw + 0.25 + i * 0.5);
  }, [r.w, hw]);
  const seg = (hw - DOOR_W / 2) / 1;
  return (
    <group position={[r.cx, 0, r.cz]}>
      {/* The slab the room floats on, and a plank floor in warm alternating woods. */}
      <RoundedBox args={[r.w + 0.6, 0.4, r.d + 0.6]} radius={0.08} position={[0, -0.21, 0]} material={mat('#6d4128')} receiveShadow />
      {planks.map((x, i) => (
        <mesh key={x} position={[x, 0.01, 0]} material={mat(['#c98a55', '#b97a48', '#d39a62', '#a8653b'][i % 4], { rough: 0.7 })} receiveShadow>
          <boxGeometry args={[0.49, 0.02, r.d]} />
        </mesh>
      ))}
      {/* Back and side walls, full height, with a wainscot and a top trim inside. */}
      <Box p={[0, WALL_H / 2, -hd - WALL_T / 2]} s={[r.w + WALL_T * 2, WALL_H, WALL_T]} c={mat(PLASTER, { rough: 0.95 })} r={0.02} />
      {[-1, 1].map((sx) => (
        <Box key={sx} p={[sx * (hw + WALL_T / 2), WALL_H / 2, 0]} s={[WALL_T, WALL_H, r.d]} c={mat(PLASTER, { rough: 0.95 })} r={0.02} />
      ))}
      <Box p={[0, 0.45, -hd + 0.03]} s={[r.w, 0.9, 0.06]} c={w.wood} r={0.01} />
      {[-1, 1].map((sx) => (
        <Box key={sx} p={[sx * (hw - 0.03), 0.45, 0]} s={[0.06, 0.9, r.d]} c={w.wood} r={0.01} />
      ))}
      <Box p={[0, WALL_H + 0.06, -hd - WALL_T / 2]} s={[r.w + WALL_T * 2 + 0.1, 0.14, WALL_T + 0.14]} c={w.woodDark} r={0.03} />
      {[-1, 1].map((sx) => (
        <Box key={sx} p={[sx * (hw + WALL_T / 2), WALL_H + 0.06, 0]} s={[WALL_T + 0.14, 0.14, r.d + WALL_T * 2]} c={w.woodDark} r={0.03} />
      ))}
      {/* Two windows in the back wall, bright with the day outside. */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * hw * 0.55, 1.55, -hd + 0.01]}>
          <Box p={[0, 0, 0]} s={[1.0, 0.8, 0.08]} c={w.woodDark} r={0.03} />
          <mesh position={[0, 0, 0.045]} material={WINDOW()}>
            <planeGeometry args={[0.84, 0.64]} />
          </mesh>
          <Box p={[0, 0, 0.06]} s={[0.05, 0.66, 0.03]} c={w.woodDark} r={0.01} />
          <Box p={[0, 0, 0.06]} s={[0.86, 0.05, 0.03]} c={w.woodDark} r={0.01} />
        </group>
      ))}
      {/* The low front wall either side of the door, and the door's wooden frame with the outdoors glowing in it. */}
      {[-1, 1].map((sx) => (
        <RoundedBox
          key={sx}
          args={[seg + 0.17, 0.74, 0.34]}
          radius={0.09}
          position={[sx * (DOOR_W / 2 + seg / 2), 0.37, hd + 0.17 - WALL_T / 2]}
          material={mat(PLASTER, { rough: 0.95 })}
          castShadow
          receiveShadow
        />
      ))}
      {[-1, 1].map((sx) => (
        <RoundedBox key={sx} args={[0.2, 2.0, 0.4]} radius={0.05} position={[sx * (DOOR_W / 2 - 0.02), 1.0, hd + 0.08]} material={w.woodDark} castShadow />
      ))}
      <RoundedBox args={[DOOR_W + 0.24, 0.24, 0.46]} radius={0.06} position={[0, 2.1, hd + 0.08]} material={w.woodDark} castShadow />
      <mesh position={[0, 1.0, hd + 0.22]} material={GLOW}>
        <planeGeometry args={[DOOR_W - 0.2, 2.0]} />
      </mesh>
      <RoundedBox args={[1.2, 0.03, 0.6]} radius={0.01} position={[0, 0.035, hd - 0.45]} receiveShadow>
        <meshStandardMaterial color="#b5543f" roughness={1} />
      </RoundedBox>
      {/* Walls, the shut door, furniture, and the ground round the slab so nobody falls off. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[hw + 2, 0.5, hd + 2]} position={[0, -0.5, 0]} />
        <CuboidCollider args={[hw + 0.2, 1.5, 0.1]} position={[0, 1.5, -hd - 0.1]} />
        <CuboidCollider args={[hw + 0.2, 1.5, 0.15]} position={[0, 1.5, hd + 0.15]} />
        <CuboidCollider args={[0.1, 1.5, hd + 0.2]} position={[-hw - 0.1, 1.5, 0]} />
        <CuboidCollider args={[0.1, 1.5, hd + 0.2]} position={[hw + 0.1, 1.5, 0]} />
        {solids.map(([x, z, sw, sd], i) => (
          <CuboidCollider key={i} args={[sw / 2, 0.6, sd / 2]} position={[x, 0.6, z]} />
        ))}
      </RigidBody>
    </group>
  );
}

/** The shop counter, across the room near the back (local to the room's centre); low, so the keeper shows over it. */
function Counter({ id, top, front }: { id: string; top: MeshStandardMaterial; front: MeshStandardMaterial }) {
  const r = shopRoom(id);
  const z = r.counterZ - r.cz - 0.35;
  return (
    <group position={[0, 0, z]}>
      <Box p={[0, 0.38, 0]} s={[4.2, 0.76, 0.7]} c={front} />
      <Box p={[0, 0.79, 0]} s={[4.4, 0.08, 0.82]} c={top} r={0.03} />
      {[-1.4, 0, 1.4].map((x) => (
        <Box key={x} p={[x, 0.38, 0.36]} s={[1.2, 0.54, 0.03]} c={mat('#8a5432')} r={0.01} />
      ))}
    </group>
  );
}

/** Small goods on a shelf: jars, tins, boxes and fruit in cheerful colours. */
function Goods({ y, width, seed }: { y: number; width: number; seed: number }) {
  const items = useMemo(() => {
    const out: { x: number; kind: number; color: string }[] = [];
    const colors = ['#d9674a', '#f2cf6b', '#8fb07a', '#7fb3d5', '#e7a3a8', '#fbf6ee', '#a99ad1', '#e9a25a'];
    let x = -width / 2 + 0.16;
    let k = seed;
    while (x < width / 2 - 0.16) {
      k = (k * 9301 + 49297) % 233280;
      out.push({ x, kind: k % 3, color: colors[k % colors.length] });
      x += 0.26 + (k % 5) * 0.03;
    }
    return out;
  }, [width, seed]);
  return (
    <>
      {items.map((it, i) =>
        it.kind === 0 ? (
          <mesh key={i} position={[it.x, y + 0.13, 0]} material={mat(it.color)} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.26, 12]} />
          </mesh>
        ) : it.kind === 1 ? (
          <Box key={i} p={[it.x, y + 0.12, 0]} s={[0.2, 0.24, 0.18]} c={mat(it.color)} r={0.03} />
        ) : (
          <mesh key={i} position={[it.x, y + 0.1, 0]} material={mat(it.color)} castShadow>
            <sphereGeometry args={[0.1, 12, 8]} />
          </mesh>
        ),
      )}
    </>
  );
}

function Shelving({ x, z, width, seed, rotY = 0 }: { x: number; z: number; width: number; seed: number; rotY?: number }) {
  const w = getWorldMaterials();
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {[-1, 1].map((s) => (
        <Box key={s} p={[s * (width / 2), 1.0, 0]} s={[0.08, 2.0, 0.46]} c={w.woodDark} r={0.02} />
      ))}
      {[0.12, 0.7, 1.28, 1.86].map((y, i) => (
        <group key={y}>
          <Box p={[0, y, 0]} s={[width, 0.06, 0.46]} c={w.wood} r={0.02} />
          {i < 3 && <Goods y={y + 0.03} width={width} seed={seed + i * 7} />}
        </group>
      ))}
    </group>
  );
}

function Sign({ text, width = 2.2 }: { text: string; width?: number }) {
  const w = getWorldMaterials();
  const tex = useCanvasTexture(
    512,
    110,
    (ctx, cw, ch) => {
      ctx.fillStyle = '#c98d57';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#fff4dc';
      ctx.font = 'bold 54px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cw / 2, ch / 2 + 3, cw - 30);
    },
    'shop-sign-' + text,
  );
  return (
    <group>
      <RoundedBox args={[width, 0.44, 0.08]} radius={0.04} material={w.woodDark} castShadow />
      <mesh position={[0, 0, 0.046]}>
        <planeGeometry args={[width - 0.12, 0.34]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Rosa's General Store: shelves of goods behind the counter, a seed rack, sacks, a barrel and a crate of produce. */
function StoreInside() {
  const r = shopRoom('store');
  const w = getWorldMaterials();
  const hd = r.d / 2;
  const hw = r.w / 2;
  const solids: Solid[] = [
    [0, r.counterZ - r.cz - 0.35, 4.4, 0.82],
    [-2.6, -hd + 0.3, 2.8, 0.5],
    [2.6, -hd + 0.3, 2.8, 0.5],
    [hw - 0.45, 1.0, 0.7, 1.6],
    [-hw + 0.55, 1.6, 1.0, 1.0],
    [-hw + 0.5, 0.4, 0.8, 0.8],
  ];
  return (
    <group>
      <RoomShell id="store" solids={solids} />
      <group position={[r.cx, 0, r.cz]}>
        <Shelving x={-2.6} z={-hd + 0.3} width={2.6} seed={11} />
        <Shelving x={2.6} z={-hd + 0.3} width={2.6} seed={42} />
        <Counter id="store" top={mat('#e2c79a')} front={w.wood} />
        {/* On the counter: a till, a basket of apples and a jar of sweets. */}
        <group position={[0, 0.83, r.counterZ - r.cz - 0.35]}>
          <Box p={[-1.3, 0.14, -0.05]} s={[0.5, 0.28, 0.4]} c={mat('#4b4552')} />
          <Box p={[-1.3, 0.32, -0.15]} s={[0.4, 0.14, 0.06]} c={mat('#8fb07a', { emissive: '#8fb07a', intensity: 0.3 })} />
          <mesh position={[0.9, 0.1, 0]} material={w.wood} castShadow>
            <cylinderGeometry args={[0.24, 0.18, 0.2, 14]} />
          </mesh>
          {[-0.1, 0.1, 0].map((dx, i) => (
            <mesh key={i} position={[0.9 + dx, 0.24 + (i === 2 ? 0.06 : 0), i === 2 ? 0 : 0.05]} material={mat('#d9674a')}>
              <sphereGeometry args={[0.09, 10, 8]} />
            </mesh>
          ))}
          <mesh position={[1.6, 0.14, 0.05]} material={mat('#dff2fb', { rough: 0.2 })}>
            <cylinderGeometry args={[0.1, 0.1, 0.28, 14]} />
          </mesh>
        </group>
        <group position={[0, 2.05, -hd + 0.06]}>
          <Sign text="GENERAL STORE" width={2.6} />
        </group>
        {/* A seed rack by the east wall: little packets in rows. */}
        <group position={[hw - 0.45, 0, 1.0]} rotation={[0, -Math.PI / 2, 0]}>
          <Box p={[0, 0.8, 0]} s={[1.5, 1.6, 0.12]} c={w.woodDark} r={0.02} />
          {[0, 1, 2, 3].map((row) =>
            [0, 1, 2, 3, 4].map((col) => (
              <Box
                key={row + '-' + col}
                p={[-0.56 + col * 0.28, 0.45 + row * 0.34, 0.09]}
                s={[0.2, 0.26, 0.03]}
                c={mat(['#f2cf6b', '#e7a3a8', '#8fb07a', '#d9674a', '#a99ad1'][(row + col) % 5])}
                r={0.01}
              />
            )),
          )}
          <Box p={[0, 0.05, 0.25]} s={[1.5, 0.1, 0.5]} c={w.woodDark} r={0.02} />
        </group>
        {/* Sacks of feed and a barrel by the west wall, and a crate of turnips. */}
        {[
          [-hw + 0.4, 1.35],
          [-hw + 0.75, 1.85],
        ].map(([x, z], i) => (
          <RoundedBox key={i} args={[0.55, 0.7, 0.45]} radius={0.18} position={[x, 0.35, z]} material={mat('#d8c39a', { rough: 1 })} castShadow />
        ))}
        <mesh position={[-hw + 0.5, 0.45, 0.4]} material={w.wood} castShadow>
          <cylinderGeometry args={[0.36, 0.32, 0.9, 16]} />
        </mesh>
        <mesh position={[-hw + 0.5, 0.91, 0.4]} material={w.woodDark}>
          <cylinderGeometry args={[0.37, 0.37, 0.04, 16]} />
        </mesh>
        <group position={[-hw + 1.1, 0, -0.9]}>
          <Box p={[0, 0.2, 0]} s={[0.7, 0.4, 0.5]} c={w.wood} />
          {[-0.18, 0.02, 0.2].map((x, i) => (
            <mesh key={i} position={[x, 0.45, (i - 1) * 0.08]} material={mat(i % 2 ? '#fbf6ee' : '#e7a3a8')}>
              <sphereGeometry args={[0.12, 10, 8]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/** Bram's workshop: a tool wall, a plank rack, a workbench, and kit samples by the door. */
function CarpenterInside() {
  const r = shopRoom('carpenter');
  const w = getWorldMaterials();
  const hd = r.d / 2;
  const hw = r.w / 2;
  const solids: Solid[] = [
    [0, r.counterZ - r.cz - 0.35, 4.4, 0.82],
    [-hw + 0.4, -0.3, 0.7, 2.6],
    [hw - 0.6, 0.6, 1.0, 2.0],
  ];
  const plankColors = ['#d39a62', '#c98a55', '#e0b07a', '#b97a48'];
  return (
    <group>
      <RoomShell id="carpenter" solids={solids} />
      <group position={[r.cx, 0, r.cz]}>
        <Counter id="carpenter" top={w.wood} front={w.woodDark} />
        {/* On the counter: sample planks and a hammer. */}
        <group position={[0, 0.83, r.counterZ - r.cz - 0.35]}>
          {[0, 1, 2].map((i) => (
            <Box key={i} p={[-1.2, 0.04 + i * 0.07, 0]} s={[1.0, 0.06, 0.3]} c={mat(plankColors[i])} r={0.01} />
          ))}
          <Box p={[1.1, 0.03, 0]} s={[0.5, 0.05, 0.06]} c={w.wood} r={0.01} />
          <Box p={[1.33, 0.06, 0]} s={[0.08, 0.1, 0.2]} c={mat('#6e6a72', { rough: 0.4 })} r={0.02} />
        </group>
        {/* The tool wall behind the counter. */}
        <group position={[0, 1.45, -hd + 0.06]}>
          <Box p={[0, 0, 0]} s={[3.2, 1.2, 0.05]} c={mat('#a8754d')} r={0.02} />
          {/* saw */}
          <Box p={[-1.0, 0.05, 0.05]} s={[0.8, 0.3, 0.02]} c={mat('#c9c6cc', { rough: 0.35 })} r={0.01} />
          <Box p={[-0.5, 0.08, 0.06]} s={[0.22, 0.26, 0.05]} c={mat('#d9674a')} r={0.03} />
          {/* hammer */}
          <Box p={[0.1, -0.05, 0.06]} s={[0.06, 0.6, 0.04]} c={w.wood} r={0.01} />
          <Box p={[0.1, 0.27, 0.07]} s={[0.26, 0.1, 0.08]} c={mat('#6e6a72', { rough: 0.4 })} r={0.02} />
          {/* set square and a coil of rope */}
          <Box p={[0.6, 0.1, 0.06]} s={[0.05, 0.5, 0.02]} c={mat('#f2cf6b')} r={0.01} />
          <Box p={[0.78, -0.12, 0.06]} s={[0.4, 0.05, 0.02]} c={mat('#f2cf6b')} r={0.01} />
          <mesh position={[1.15, 0.02, 0.08]} material={mat('#d8c39a', { rough: 1 })}>
            <torusGeometry args={[0.18, 0.05, 8, 18]} />
          </mesh>
        </group>
        <group position={[0, 2.25, -hd + 0.06]}>
          <Sign text="CARPENTER" width={2.2} />
        </group>
        {/* A rack of planks along the west wall. */}
        <group position={[-hw + 0.4, 0, -0.3]}>
          {[-1.1, 1.1].map((z) => (
            <Box key={z} p={[0, 0.7, z]} s={[0.6, 1.4, 0.08]} c={w.woodDark} r={0.02} />
          ))}
          {[0.25, 0.65, 1.05].map((y, i) => (
            <group key={y}>
              <Box p={[0, y, 0]} s={[0.6, 0.05, 2.4]} c={w.woodDark} r={0.01} />
              {[0, 1].map((k) => (
                <Box key={k} p={[-0.12 + k * 0.24, y + 0.07, 0]} s={[0.2, 0.08, 2.5]} c={mat(plankColors[(i + k) % 4])} r={0.01} />
              ))}
            </group>
          ))}
        </group>
        {/* The workbench by the east wall, with a vise, a block of wood and shavings. */}
        <group position={[hw - 0.6, 0, 0.6]} rotation={[0, -Math.PI / 2, 0]}>
          <Box p={[0, 0.85, 0]} s={[2.0, 0.1, 0.9]} c={w.wood} r={0.02} />
          {[
            [-0.9, -0.36],
            [0.9, -0.36],
            [-0.9, 0.36],
            [0.9, 0.36],
          ].map(([x, z]) => (
            <Box key={x + ',' + z} p={[x, 0.4, z]} s={[0.1, 0.8, 0.1]} c={w.woodDark} r={0.02} />
          ))}
          <Box p={[0, 0.3, 0]} s={[1.8, 0.06, 0.7]} c={w.woodDark} r={0.01} />
          <Box p={[0.7, 0.98, 0.38]} s={[0.24, 0.16, 0.16]} c={mat('#6e6a72', { rough: 0.4 })} r={0.03} />
          <Box p={[-0.2, 0.98, 0]} s={[0.5, 0.16, 0.3]} c={mat('#e0b07a')} r={0.02} />
          {[-0.6, -0.5, -0.65].map((x, i) => (
            <mesh key={i} position={[x, 0.92, -0.2 + i * 0.1]} rotation={[Math.PI / 2, 0, i]} material={mat('#f0d2a0')}>
              <torusGeometry args={[0.05, 0.015, 6, 12]} />
            </mesh>
          ))}
        </group>
        {/* Kit samples by the door: a fence panel, a flower pot and a little bench. */}
        <group position={[hw - 1.0, 0, 2.2]}>
          {[-0.4, 0.4].map((x) => (
            <Box key={x} p={[x, 0.36, 0]} s={[0.08, 0.72, 0.08]} c={mat('#a8754d')} r={0.02} />
          ))}
          {[0.25, 0.52].map((y) => (
            <Box key={y} p={[0, y, 0]} s={[0.9, 0.07, 0.04]} c={mat('#a8754d')} r={0.01} />
          ))}
        </group>
        <mesh position={[hw - 2.0, 0.17, 2.4]} material={mat('#d9674a')} castShadow>
          <cylinderGeometry args={[0.18, 0.14, 0.34, 12]} />
        </mesh>
        <mesh position={[hw - 2.0, 0.4, 2.4]} material={mat('#6fae4f')}>
          <sphereGeometry args={[0.15, 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}

/** A round table with three stools round it, and a mug or two on it. */
function TavernTable({ x, z, turn = 0 }: { x: number; z: number; turn?: number }) {
  const w = getWorldMaterials();
  return (
    <group position={[x, 0, z]} rotation={[0, turn, 0]}>
      <mesh position={[0, 0.74, 0]} material={w.wood} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.07, 20]} />
      </mesh>
      <mesh position={[0, 0.37, 0]} material={w.woodDark} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 0.72, 10]} />
      </mesh>
      <mesh position={[0, 0.03, 0]} material={w.woodDark}>
        <cylinderGeometry args={[0.28, 0.3, 0.05, 14]} />
      </mesh>
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        return (
          <group key={k} position={[Math.cos(a) * 0.78, 0, Math.sin(a) * 0.78]}>
            <mesh position={[0, 0.44, 0]} material={mat('#b5543f')} castShadow>
              <cylinderGeometry args={[0.2, 0.2, 0.08, 14]} />
            </mesh>
            <mesh position={[0, 0.2, 0]} material={w.woodDark}>
              <cylinderGeometry args={[0.04, 0.06, 0.4, 8]} />
            </mesh>
          </group>
        );
      })}
      {[0.2, -0.18].map((mx, i) => (
        <Mug key={i} p={[mx, 0.78, i ? 0.12 : -0.1]} />
      ))}
    </group>
  );
}

/** A mug of cider with a head of foam. */
function Mug({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.07, 0]} material={mat('#e3a03a', { rough: 0.35 })} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.14, 12]} />
      </mesh>
      <mesh position={[0, 0.145, 0]} material={mat('#fff8ea')}>
        <sphereGeometry args={[0.057, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0.07, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat('#e3a03a', { rough: 0.35 })}>
        <torusGeometry args={[0.038, 0.013, 6, 12]} />
      </mesh>
    </group>
  );
}

/** A wine bottle: dark glass, a pale label and a cork. */
function Bottle({ p, color }: { p: V3; color: string }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.13, 0]} material={mat(color, { rough: 0.25 })} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.26, 12]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} material={mat(color, { rough: 0.25 })}>
        <cylinderGeometry args={[0.022, 0.05, 0.1, 10]} />
      </mesh>
      <mesh position={[0, 0.36, 0]} material={mat('#c9a06a')}>
        <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
      </mesh>
      <mesh position={[0, 0.12, 0]} material={mat('#f3e7d2')}>
        <cylinderGeometry args={[0.062, 0.062, 0.09, 12, 1, true]} />
      </mesh>
    </group>
  );
}

/**
 * Tess's tavern: the bar across the back with barrels and a shelf of the vineyard's bottles behind
 * it, stools along it, a stone fireplace on the west wall, round tables, a rug and a notice board.
 * Nothing is for sale; you chat with Tess at the bar.
 */
function TavernInside() {
  const r = shopRoom('tavern');
  const w = getWorldMaterials();
  const hd = r.d / 2;
  const hw = r.w / 2;
  const barZ = r.counterZ - r.cz - 0.35;
  const tables: [number, number, number][] = [
    [-2.9, 0.9, 0],
    [3.1, 0.3, 0.6],
    [3.4, 2.5, 1.1],
    [-2.6, 2.7, 0.9],
  ];
  const solids: Solid[] = [
    [0, barZ, 4.4, 0.82],
    [-hw + 0.35, 0.2, 0.7, 2.0],
    ...tables.map(([x, z]) => [x, z, 1.0, 1.0] as Solid),
  ];
  const bottles = ['#3f5a3a', '#5a2e4a', '#2f4a3f', '#6b3a5a', '#3f5a3a', '#4a2f5a'];
  return (
    <group>
      <RoomShell id="tavern" solids={solids} />
      <group position={[r.cx, 0, r.cz]}>
        <Counter id="tavern" top={w.wood} front={mat('#7a4a32')} />
        {/* On the bar: mugs, a bottle and a bowl of the vineyard's grapes. */}
        <group position={[0, 0.83, barZ]}>
          <Mug p={[-1.5, 0, 0.1]} />
          <Mug p={[-1.25, 0, -0.08]} />
          <Bottle p={[1.0, 0, 0]} color="#5a2e4a" />
          <mesh position={[1.55, 0.05, 0.05]} material={mat('#f3e7d2')}>
            <cylinderGeometry args={[0.2, 0.12, 0.1, 16]} />
          </mesh>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <mesh key={i} position={[1.55 + Math.cos(i * 0.9) * (i ? 0.1 : 0), 0.13 + (i ? 0 : 0.05), 0.05 + Math.sin(i * 0.9) * (i ? 0.1 : 0)]} material={mat('#7d4aa0', { rough: 0.45 })}>
              <sphereGeometry args={[0.05, 8, 6]} />
            </mesh>
          ))}
        </group>
        {/* Stools along the front of the bar, leaving the middle free to lean on it. */}
        {[-1.9, -1.15, 1.15, 1.9].map((x) => (
          <group key={x} position={[x, 0, barZ + 0.75]}>
            <mesh position={[0, 0.6, 0]} material={mat('#b5543f')} castShadow>
              <cylinderGeometry args={[0.19, 0.19, 0.08, 14]} />
            </mesh>
            <mesh position={[0, 0.3, 0]} material={w.woodDark}>
              <cylinderGeometry args={[0.04, 0.07, 0.6, 8]} />
            </mesh>
            <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]} material={w.woodDark}>
              <torusGeometry args={[0.13, 0.015, 6, 14]} />
            </mesh>
          </group>
        ))}
        {/* Behind the bar: barrels on a cradle either side, a shelf of bottles between them, the sign over it. */}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * 1.95, 0, -hd + 0.45]}>
            <Box p={[0, 0.08, 0]} s={[0.8, 0.16, 0.6]} c={w.woodDark} r={0.02} />
            <Barrel position={[0, 0.48, 0]} radius={0.32} height={0.7} lying />
            <mesh position={[0, 0.42, 0.33]} rotation={[Math.PI / 2, 0, 0]} material={mat('#c9a06a', { rough: 0.4 })}>
              <cylinderGeometry args={[0.03, 0.03, 0.12, 8]} />
            </mesh>
          </group>
        ))}
        <group position={[0, 0, -hd + 0.2]}>
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * 1.15, 1.0, 0]} s={[0.07, 1.4, 0.3]} c={w.woodDark} r={0.02} />
          ))}
          {[0.5, 0.95, 1.4].map((y, row) => (
            <group key={y}>
              <Box p={[0, y, 0]} s={[2.3, 0.05, 0.3]} c={w.wood} r={0.01} />
              {[-0.85, -0.5, -0.15, 0.2, 0.55, 0.88].map((bx, i) => (
                <Bottle key={bx} p={[bx, y + 0.025, 0]} color={bottles[(i + row * 2) % bottles.length]} />
              ))}
            </group>
          ))}
        </group>
        <group position={[0, 2.12, -hd + 0.06]}>
          <Sign text="TAVERN" width={2.0} />
        </group>
        {/* The fireplace on the west wall: a stone hearth with a log fire glowing in it. */}
        <group position={[-hw + 0.35, 0, 0.2]} rotation={[0, Math.PI / 2, 0]}>
          <Box p={[0, 0.75, 0]} s={[2.0, 1.5, 0.7]} c={mat('#b8aa96', { rough: 1 })} r={0.08} />
          <Box p={[0, 1.95, -0.08]} s={[1.4, 0.9, 0.5]} c={mat('#a99a86', { rough: 1 })} r={0.06} />
          <Box p={[0, 1.55, 0.06]} s={[2.2, 0.12, 0.7]} c={w.woodDark} r={0.03} />
          <Box p={[0, 0.48, 0.2]} s={[1.0, 0.8, 0.34]} c={mat('#2b2230')} r={0.04} />
          <Box p={[0, 0.07, 0.48]} s={[1.5, 0.12, 0.3]} c={mat('#a99a86', { rough: 1 })} r={0.03} />
          {[-0.12, 0.12].map((lz, i) => (
            <mesh key={i} position={[0, 0.18 + i * 0.06, 0.3 + lz * 0.3]} rotation={[0, 0, Math.PI / 2 + (i ? 0.35 : -0.35)]} material={mat('#7a5236')}>
              <cylinderGeometry args={[0.06, 0.06, 0.62, 8]} />
            </mesh>
          ))}
          {[
            [0, 0.38, 0.2, 0.18],
            [-0.15, 0.32, 0.13, 0.13],
            [0.16, 0.31, 0.12, 0.12],
          ].map(([fx, fy, fr, fh], i) => (
            <mesh key={i} position={[fx, fy, 0.32]} material={mat(i ? '#ffb347' : '#ff7b39', { emissive: i ? '#ffc061' : '#ff6a2a', intensity: 2.2 })}>
              <coneGeometry args={[fr * 0.6, fh * 2, 8]} />
            </mesh>
          ))}
          {/* On the mantel: a jar of flowers and two candles. */}
          <mesh position={[-0.6, 1.72, 0.1]} material={mat('#7fb3d5', { rough: 0.3 })}>
            <cylinderGeometry args={[0.07, 0.06, 0.2, 10]} />
          </mesh>
          {[0.45, 0.7].map((cx) => (
            <group key={cx} position={[cx, 1.61, 0.12]}>
              <mesh position={[0, 0.09, 0]} material={mat('#fbf6ee')}>
                <cylinderGeometry args={[0.03, 0.03, 0.18, 8]} />
              </mesh>
              <mesh position={[0, 0.21, 0]} material={mat('#ffd98a', { emissive: '#ffb347', intensity: 2 })}>
                <sphereGeometry args={[0.025, 8, 6]} />
              </mesh>
            </group>
          ))}
        </group>
        {/* A rug before the fire. */}
        <RoundedBox args={[1.6, 0.03, 2.2]} radius={0.01} position={[-hw + 1.65, 0.035, 0.2]} receiveShadow>
          <meshStandardMaterial color="#8c3b52" roughness={1} />
        </RoundedBox>
        <RoundedBox args={[1.3, 0.035, 1.9]} radius={0.01} position={[-hw + 1.65, 0.04, 0.2]} receiveShadow>
          <meshStandardMaterial color="#d9a35a" roughness={1} />
        </RoundedBox>
        {tables.map(([x, z, turn]) => (
          <TavernTable key={x + ',' + z} x={x} z={z} turn={turn} />
        ))}
        {/* The notice board on the east wall: pinned notes from the townsfolk. */}
        <group position={[hw - 0.06, 1.45, -1.2]} rotation={[0, -Math.PI / 2, 0]}>
          <Box p={[0, 0, 0]} s={[1.3, 0.9, 0.06]} c={w.woodDark} r={0.02} />
          <Box p={[0, 0, 0.03]} s={[1.18, 0.78, 0.02]} c={mat('#c9a06a', { rough: 1 })} r={0.01} />
          {[
            [-0.36, 0.14, '#fbf6ee', 0.1],
            [0.05, 0.18, '#f2cf6b', -0.08],
            [0.38, 0.06, '#e7a3a8', 0.05],
            [-0.18, -0.2, '#a9d47f', -0.12],
            [0.24, -0.22, '#fbf6ee', 0.07],
          ].map(([nx, ny, c, a], i) => (
            <mesh key={i} position={[nx as number, ny as number, 0.045]} rotation={[0, 0, a as number]} material={mat(c as string)}>
              <planeGeometry args={[0.28, 0.24]} />
            </mesh>
          ))}
        </group>
        {/* Wall lanterns on the side walls. */}
        {[
          [-hw + 0.08, 2.2, Math.PI / 2],
          [-hw + 0.08, -2.2, Math.PI / 2],
          [hw - 0.08, 1.6, -Math.PI / 2],
        ].map(([lx, lz, rot]) => (
          <group key={lx + ',' + lz} position={[lx, 1.75, lz]} rotation={[0, rot, 0]}>
            <Box p={[0, 0, 0.06]} s={[0.06, 0.06, 0.16]} c={mat('#3a3440', { rough: 0.5 })} r={0.01} />
            <Box p={[0, -0.05, 0.16]} s={[0.16, 0.22, 0.16]} c={mat('#ffe6a8', { emissive: '#ffb347', intensity: 1.6 })} r={0.03} />
            <Box p={[0, 0.08, 0.16]} s={[0.2, 0.05, 0.2]} c={mat('#3a3440', { rough: 0.5 })} r={0.02} />
          </group>
        ))}
      </group>
    </group>
  );
}

/** The shop interiors and the tavern's; only drawn while you're inside a building. */
export function ShopInteriors() {
  const indoors = useSession((s) => s.indoors);
  return (
    <group visible={indoors}>
      <StoreInside />
      <CarpenterInside />
      <TavernInside />
    </group>
  );
}
