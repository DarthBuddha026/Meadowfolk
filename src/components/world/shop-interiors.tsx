'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { DoubleSide, MeshStandardMaterial } from 'three';
import { shopRoom } from '@/game/data';
import { useSession } from '@/game/state/session-store';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * The insides of the General Store and the Carpenter's workshop: rooms of their own off the map,
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

/** Bram's workshop: a tool wall, a plank rack, a workbench, a sawhorse, and kit samples by the door. */
function CarpenterInside() {
  const r = shopRoom('carpenter');
  const w = getWorldMaterials();
  const hd = r.d / 2;
  const hw = r.w / 2;
  const solids: Solid[] = [
    [0, r.counterZ - r.cz - 0.35, 4.4, 0.82],
    [-hw + 0.4, -0.3, 0.7, 2.6],
    [hw - 0.6, 0.6, 1.0, 2.0],
    [-1.2, 1.9, 1.3, 0.5],
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
        {/* A sawhorse with a plank on it. */}
        <group position={[-1.2, 0, 1.9]}>
          {[-0.45, 0.45].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              {[-1, 1].map((s) => (
                <Box key={s} p={[0, 0.3, s * 0.12]} s={[0.07, 0.62, 0.07]} c={w.woodDark} r={0.01} />
              ))}
            </group>
          ))}
          <Box p={[0, 0.62, 0]} s={[1.2, 0.08, 0.12]} c={w.woodDark} r={0.01} />
          <Box p={[0.1, 0.7, 0]} s={[1.4, 0.06, 0.32]} c={mat('#d39a62')} r={0.01} />
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

/** Both shop interiors; only drawn while you're inside a building. */
export function ShopInteriors() {
  const indoors = useSession((s) => s.indoors);
  return (
    <group visible={indoors}>
      <StoreInside />
      <CarpenterInside />
    </group>
  );
}
