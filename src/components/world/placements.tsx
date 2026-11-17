'use client';

import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { CanvasTexture, Color, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Group, type Material, type Mesh } from 'three';
import { PALETTE, PIECES } from '@/game/sim/content';
import { EDGE_NORMAL, footprint, GRID, HOUSE_AREA, houseShell, inHouseArea, nearestEdge, shellDoors, placementCenter, tileCenter, villaBounds, villaDoors } from '@/game/sim/farm-map';
import { placementProblem } from '@/game/sim/sim';
import type { FarmState, Placement } from '@/game/sim/types';
import { buildPointer, playerState } from '@/game/engine/world-state';
import { useClock, useFarm, useFarmState } from '@/game/state/farm-store';
import { useSession } from '@/game/state/session-store';
import { Cottage } from './cottage';
import { useCanvasTexture } from './use-canvas-texture';
import { getWorldMaterials } from './materials';

/**
 * Everything placed on the farm — the villa's walls and floors, fences, paths, furniture, the
 * shipping bin, coops — drawn from the farm's placement records in one chunky clay kit, with
 * colliders for the solid pieces. The villa's roof follows its walls and lifts away (and the walls
 * drop to a cutaway) while you are inside, so the camera can see in.
 */

export const WALL_H = 2.2;
const WALL_T = 0.18;

/* Shared clay materials, one per palette colour (created once: WebGPU dislikes churn). */
const clay = new Map<string, MeshStandardMaterial>();
function mat(color: string, opts: { emissive?: string; transparent?: boolean; opacity?: number; rough?: number } = {}) {
  const key = color + JSON.stringify(opts);
  let m = clay.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
    if (opts.emissive) {
      m.emissive = new Color(opts.emissive);
      m.emissiveIntensity = 0;
    }
    clay.set(key, m);
  }
  return m;
}
/**
 * Wood planks for the house's floor: a near-white plank pattern (one tile = four planks running
 * north–south, with seams, staggered butt joints and a little grain) tinted by the floor's colour.
 */
let plankTexture: CanvasTexture | null = null;
function planks(): CanvasTexture {
  if (plankTexture) return plankTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const w = size / 4;
  const tones = [246, 236, 250, 230];
  const joints = [0.3, 0.75, 0.1, 0.55];
  for (let i = 0; i < 4; i++) {
    const x = i * w;
    const t = tones[i];
    ctx.fillStyle = `rgb(${t},${t - 4},${t - 10})`;
    ctx.fillRect(x, 0, w, size);
    // Grain: a few long, faint streaks along the plank.
    for (let k = 0; k < 5; k++) {
      ctx.strokeStyle = `rgba(120,90,60,${0.05 + (k % 2) * 0.04})`;
      ctx.lineWidth = 1 + (k % 3);
      const gx = x + 6 + ((k * 13 + i * 7) % (w - 12));
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + 4, size * 0.3, gx - 4, size * 0.7, gx + 2, size);
      ctx.stroke();
    }
    // Seam between planks, and the butt joint where two boards meet.
    ctx.fillStyle = 'rgba(90,60,40,0.45)';
    ctx.fillRect(x, 0, 2, size);
    ctx.fillRect(x, joints[i] * size, w, 2);
  }
  plankTexture = new CanvasTexture(canvas);
  plankTexture.colorSpace = SRGBColorSpace;
  plankTexture.wrapS = plankTexture.wrapT = RepeatWrapping;
  plankTexture.anisotropy = 4;
  return plankTexture;
}
const floorMats = new Map<string, MeshStandardMaterial>();
function floorMat(color: string) {
  let m = floorMats.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ color, map: planks(), roughness: 0.7 });
    floorMats.set(color, m);
  }
  return m;
}

const shade = (hex: string, k: number) => '#' + new Color(hex).multiplyScalar(k).getHexString();
/** Window glass: indoors it glows with the daylight outside (see RoomLight). */
const GLASS = () => mat('#bfe3f2', { transparent: true, opacity: 0.55, rough: 0.2, emissive: '#cfeeff' });
/** The bright outdoors seen through a front door from inside. */
const OUTSIDE_GLOW = new MeshStandardMaterial({ color: '#fff1d0', emissive: '#ffe2a8', emissiveIntensity: 1.6, toneMapped: false, side: DoubleSide });
/** Lantern glass: its glow rises at dusk (see LanternGlow). */
const LAMP = () => mat('#ffe2a0', { emissive: '#ffb84d', rough: 0.4 });

/** Edge pieces sit on the tile's edge: offset from the centre, and whether they run along x. */
function edgeFrame(rot: number): { dx: number; dz: number; alongX: boolean } {
  const r = ((rot % 4) + 4) % 4;
  return [
    { dx: 0, dz: -0.5 + WALL_T / 2, alongX: true },
    { dx: 0.5 - WALL_T / 2, dz: 0, alongX: false },
    { dx: 0, dz: 0.5 - WALL_T / 2, alongX: true },
    { dx: -0.5 + WALL_T / 2, dz: 0, alongX: false },
  ][r];
}

type Box = [number, number, number, number, number, number]; // x y z, w h d (in the piece's frame)

/** The solid boxes a piece is made of, for colliders (local frame, rot applied by the caller). */
function solidBoxes(p: Placement, frontDoor: boolean): Box[] {
  const def = PIECES[p.piece];
  if (!def.solid) return [];
  if (p.piece === 'wall-door' && !frontDoor) return [[0, 2.1, 0, 1, 0.2, WALL_T]];
  if (def.layer === 'edge') return [[0, (p.piece === 'fence' ? 0.4 : WALL_H / 2), 0, 1, p.piece === 'fence' ? 0.8 : WALL_H, WALL_T]];
  const [w, d] = def.size ?? [1, 1];
  return [[0, 0.45, 0, w - 0.2, 0.9, d - 0.2]];
}

/* ------------------------------------------------------------------ */
/* The pieces                                                          */
/* ------------------------------------------------------------------ */

function Block({ b, m }: { b: Box; m: Material }) {
  return (
    <mesh position={[b[0], b[1], b[2]]} material={m} castShadow receiveShadow>
      <boxGeometry args={[b[3], b[4], b[5]]} />
    </mesh>
  );
}

/**
 * How far a piece is pulled forward (+z) inside its footprint so its back clears a wall's wainscot
 * when it stands against one (the wall and wainscot take the tile's back 0.27 m).
 */
const WALL_CLEAR: Record<string, number> = {
  'kitchen-counter': 0.16,
  fridge: 0.18,
  stove: 0.15,
  wardrobe: 0.2,
  sofa: 0.16,
  desk: 0.16,
  'tv-stand': 0.1,
  'bedside-table': 0.08,
};

const PieceMesh = memo(function PieceMesh(props: PieceProps) {
  const shift = WALL_CLEAR[props.piece];
  return shift ? (
    <group position={[0, 0, shift]}>
      <PieceShape {...props} />
    </group>
  ) : (
    <PieceShape {...props} />
  );
});

interface PieceProps {
  piece: string;
  color: string;
  closed?: boolean;
  dressed?: boolean;
  /** A wall between two rooms (trimmed on both faces). */
  between?: boolean;
  /** Which side a shut door's knob is on (+1 / -1), so a double door's knobs meet in the middle. */
  knob?: number;
}

function PieceShape({
  piece,
  color,
  closed = false,
  dressed = false,
  between = false,
  knob = 1,
}: PieceProps) {
  const w = getWorldMaterials();
  const c = mat(color);
  const dark = mat(shade(color, 0.72));
  switch (piece) {
    case 'floor':
      return <Block b={[0, 0.03, 0, 1, 0.06, 1]} m={floorMat(color)} />;
    case 'path':
      return (
        <group>
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat('#e8d6b0')} receiveShadow>
            <planeGeometry args={[0.98, 0.98]} />
          </mesh>
          {[
            [-0.24, -0.22, 0.2],
            [0.2, -0.26, 0.17],
            [0.02, 0.05, 0.22],
            [-0.26, 0.26, 0.16],
            [0.27, 0.22, 0.18],
          ].map(([x, z, r], i) => (
            <mesh key={i} position={[x, 0.025, z]} scale={[r, 0.05, r * 0.85]} material={i % 2 ? c : dark} receiveShadow>
              <sphereGeometry args={[1, 10, 6]} />
            </mesh>
          ))}
        </group>
      );
    case 'wall':
      return (
        <group>
          <Block b={[0, WALL_H / 2, 0, 1, WALL_H, WALL_T]} m={c} />
          <Block b={[0, 0.12, 0, 1.02, 0.24, WALL_T + 0.04]} m={dark} />
          {dressed && <Trim both={between} />}
        </group>
      );
    case 'wall-window':
      return (
        <group>
          <Block b={[0, 0.45, 0, 1, 0.9, WALL_T]} m={c} />
          <Block b={[0, 1.95, 0, 1, 0.5, WALL_T]} m={c} />
          <Block b={[-0.42, 1.3, 0, 0.16, 0.8, WALL_T]} m={c} />
          <Block b={[0.42, 1.3, 0, 0.16, 0.8, WALL_T]} m={c} />
          <Block b={[0, 0.12, 0, 1.02, 0.24, WALL_T + 0.04]} m={dark} />
          <Block b={[0, 0.92, 0, 0.74, 0.07, WALL_T + 0.1]} m={w.wood} />
          <mesh position={[0, 1.3, 0]} material={GLASS()}>
            <boxGeometry args={[0.68, 0.8, 0.03]} />
          </mesh>
          <Block b={[0, 1.3, 0, 0.05, 0.8, 0.06]} m={w.woodDark} />
          <Block b={[0, 1.3, 0, 0.68, 0.05, 0.06]} m={w.woodDark} />
          {dressed && <Trim both={between} />}
        </group>
      );
    case 'wall-door':
      return closed ? (
        // Shut: a full-width door in a slim frame (two side by side make a double door). The way in is through E.
        <group>
          {[-1, 1].map((sx) => (
            <Block key={sx} b={[sx * 0.47, WALL_H / 2, 0, 0.06, WALL_H, WALL_T]} m={c} />
          ))}
          <Block b={[0, 2.06, 0, 1, 0.28, WALL_T]} m={c} />
          <Block b={[0, 1.93, 0, 0.94, 0.06, WALL_T + 0.06]} m={w.woodDark} />
          <Block b={[0, 0.95, 0, 0.88, 1.9, 0.08]} m={w.wood} />
          {[0.5, 1.35].map((y) => (
            <Block key={y} b={[0, y, 0.045, 0.74, 0.06, 0.02]} m={w.woodDark} />
          ))}
          {[-1, 1].map((sz) => (
            <mesh key={sz} position={[knob * 0.34, 0.95, sz * 0.06]} material={mat('#e9c46a', { rough: 0.4 })}>
              <sphereGeometry args={[0.045, 10, 8]} />
            </mesh>
          ))}
          <Block b={[0, 0.04, 0.32, 1.0, 0.08, 0.36]} m={mat('#b9aea2')} />
        </group>
      ) : (
        // Open: just the header over a full-width opening (no door leaf), so doors side by side make one wide doorway.
        <group>
          <Block b={[0, 2.1, 0, 1, 0.2, WALL_T]} m={c} />
          {dressed && <Block b={[0, WALL_H + 0.05, 0, 1.04, 0.12, WALL_T + 0.12]} m={w.woodDark} />}
        </group>
      );
    case 'fence':
      return (
        <group>
          {[-0.45, 0.45].map((x) => (
            <Block key={x} b={[x, 0.38, 0, 0.11, 0.76, 0.11]} m={c} />
          ))}
          {[0.28, 0.58].map((y) => (
            <Block key={y} b={[0, y, 0, 1, 0.08, 0.05]} m={c} />
          ))}
        </group>
      );
    case 'lantern':
      return (
        <group>
          <Block b={[0, 0.06, 0, 0.3, 0.12, 0.3]} m={mat('#9a8f86')} />
          <mesh position={[0, 0.6, 0]} material={c} castShadow>
            <cylinderGeometry args={[0.05, 0.06, 1.1, 8]} />
          </mesh>
          <mesh position={[0, 1.22, 0]} material={LAMP()}>
            <boxGeometry args={[0.24, 0.26, 0.24]} />
          </mesh>
          <mesh position={[0, 1.4, 0]} material={c} castShadow>
            <coneGeometry args={[0.22, 0.16, 4]} />
          </mesh>
        </group>
      );
    case 'flower-pot':
      return (
        <group>
          <mesh position={[0, 0.17, 0]} material={c} castShadow>
            <cylinderGeometry args={[0.2, 0.15, 0.34, 12]} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[Math.sin(i * 1.26) * 0.1, 0.42 + (i % 2) * 0.05, Math.cos(i * 1.26) * 0.1]} material={mat(['#f2cf6b', '#e7a3a8', '#fbf6ee'][i % 3])}>
              <sphereGeometry args={[0.07, 8, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 0.36, 0]} material={mat('#6fae4f')}>
            <sphereGeometry args={[0.15, 10, 6]} />
          </mesh>
        </group>
      );
    case 'bench':
      return (
        <group>
          <Block b={[0, 0.42, 0, 0.92, 0.08, 0.38]} m={c} />
          <Block b={[0, 0.72, -0.17, 0.92, 0.32, 0.06]} m={c} />
          {[-0.38, 0.38].map((x) => (
            <Block key={x} b={[x, 0.2, 0, 0.08, 0.4, 0.34]} m={dark} />
          ))}
        </group>
      );
    case 'bed':
      return (
        <group>
          <Block b={[0, 0.18, 0, 0.9, 0.3, 0.96]} m={w.wood} />
          <Block b={[0, 0.5, -0.46, 0.92, 0.7, 0.08]} m={w.woodDark} />
          <Block b={[0, 0.38, 0.02, 0.84, 0.14, 0.9]} m={mat('#fbf6ee')} />
          <Block b={[0, 0.49, -0.3, 0.6, 0.1, 0.22]} m={mat('#ffffff')} />
          <Block b={[0, 0.47, 0.17, 0.88, 0.08, 0.62]} m={c} />
        </group>
      );
    case 'chest':
      return (
        <group>
          <Block b={[0, 0.26, 0, 0.78, 0.5, 0.52]} m={c} />
          <mesh position={[0, 0.51, 0]} rotation={[0, 0, Math.PI / 2]} material={dark} castShadow>
            <cylinderGeometry args={[0.24, 0.24, 0.8, 12, 1, false, 0, Math.PI]} />
          </mesh>
          <Block b={[0, 0.45, 0.27, 0.12, 0.14, 0.04]} m={mat('#e9c46a', { rough: 0.4 })} />
        </group>
      );
    case 'table':
      return (
        <group>
          <Block b={[0, 0.7, 0, 0.9, 0.08, 0.9]} m={c} />
          {[
            [-0.36, -0.36],
            [0.36, -0.36],
            [-0.36, 0.36],
            [0.36, 0.36],
          ].map(([x, z]) => (
            <Block key={x + ',' + z} b={[x, 0.34, z, 0.08, 0.68, 0.08]} m={dark} />
          ))}
        </group>
      );
    case 'chair':
      return (
        <group>
          <Block b={[0, 0.42, 0, 0.5, 0.07, 0.5]} m={c} />
          <Block b={[0, 0.72, -0.22, 0.5, 0.55, 0.06]} m={c} />
          {[
            [-0.2, -0.2],
            [0.2, -0.2],
            [-0.2, 0.2],
            [0.2, 0.2],
          ].map(([x, z]) => (
            <Block key={x + ',' + z} b={[x, 0.2, z, 0.06, 0.4, 0.06]} m={dark} />
          ))}
        </group>
      );
    case 'rug':
      return (
        <group>
          <mesh position={[0, 0.075, 0]} scale={[0.46, 0.012, 0.46]} material={c} receiveShadow>
            <cylinderGeometry args={[1, 1, 1, 24]} />
          </mesh>
          <mesh position={[0, 0.082, 0]} scale={[0.3, 0.012, 0.3]} material={dark} receiveShadow>
            <cylinderGeometry args={[1, 1, 1, 24]} />
          </mesh>
        </group>
      );
    case 'plant':
      return (
        <group>
          <mesh position={[0, 0.16, 0]} material={c} castShadow>
            <cylinderGeometry args={[0.18, 0.14, 0.32, 12]} />
          </mesh>
          {[
            [0, 0.55, 0, 0.26],
            [0.12, 0.75, 0.05, 0.18],
            [-0.1, 0.8, -0.05, 0.17],
          ].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} material={mat('#6fae4f')} castShadow>
              <sphereGeometry args={[r, 12, 8]} />
            </mesh>
          ))}
        </group>
      );
    case 'shipping-bin':
      return (
        <group>
          <Block b={[0, 0.34, 0, 0.9, 0.62, 0.66]} m={c} />
          {[0.18, 0.42].map((y) => (
            <Block key={y} b={[0, y, 0.335, 0.92, 0.07, 0.02]} m={dark} />
          ))}
          <group position={[0, 0.66, -0.33]} rotation={[-0.35, 0, 0]}>
            <Block b={[0, 0.03, 0.34, 0.94, 0.06, 0.7]} m={dark} />
          </group>
        </group>
      );
    case 'coop':
      return (
        <group>
          <Block b={[0, 0.65, -0.1, 1.6, 1.1, 1.4]} m={c} />
          <Block b={[0, 0.06, -0.1, 1.7, 0.12, 1.5]} m={mat('#9a8f86')} />
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.45, 1.45, -0.1]} rotation={[0, 0, -s * 0.62]} material={mat(shade('#d9674a', 0.95))} castShadow>
              <boxGeometry args={[1.12, 0.1, 1.62]} />
            </mesh>
          ))}
          <Block b={[0, 0.42, 0.61, 0.42, 0.56, 0.04]} m={mat('#4b3826')} />
          <mesh position={[0, 0.16, 0.8]} rotation={[0.55, 0, 0]} material={w.wood} castShadow>
            <boxGeometry args={[0.36, 0.04, 0.46]} />
          </mesh>
          <mesh position={[0.48, 0.95, 0.61]} material={GLASS()}>
            <circleGeometry args={[0.13, 16]} />
          </mesh>
        </group>
      );
    case 'hedge':
      return (
        <mesh position={[0, 0.4, 0]} scale={[0.5, 0.42, 0.5]} material={mat(shade(color, 0.9))} castShadow>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      );
    case 'arch':
      return (
        <group>
          {[-0.42, 0.42].map((x) => (
            <Block key={x} b={[x, 0.85, 0, 0.1, 1.7, 0.1]} m={c} />
          ))}
          <mesh position={[0, 1.7, 0]} material={c} castShadow>
            <torusGeometry args={[0.42, 0.05, 8, 20, Math.PI]} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[Math.cos((i / 5) * Math.PI) * 0.42, 1.7 + Math.sin((i / 5) * Math.PI) * 0.42, 0.04]} material={mat(i % 2 ? '#e7a3a8' : '#6fae4f')}>
              <sphereGeometry args={[0.09, 8, 6]} />
            </mesh>
          ))}
        </group>
      );
    case 'fountain':
      return (
        <group>
          <mesh position={[0, 0.25, 0]} material={c} castShadow receiveShadow>
            <cylinderGeometry args={[0.9, 0.95, 0.5, 24]} />
          </mesh>
          <mesh position={[0, 0.48, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat('#7fc6d4', { rough: 0.2 })}>
            <circleGeometry args={[0.78, 24]} />
          </mesh>
          <mesh position={[0, 0.85, 0]} material={c} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 0.8, 12]} />
          </mesh>
          <mesh position={[0, 1.27, 0]} material={c} castShadow>
            <cylinderGeometry args={[0.32, 0.2, 0.1, 16]} />
          </mesh>
        </group>
      );
    /* Home furniture: each is modelled over its whole footprint, front facing +z. */
    case 'kitchen-counter':
      return (
        <group>
          <Block b={[0, 0.43, -0.08, 3.9, 0.86, 0.66]} m={c} />
          <Block b={[0, 0.89, -0.06, 3.98, 0.07, 0.76]} m={mat('#8d8a92', { rough: 0.5 })} />
          {[-1.5, -0.5, 0.5, 1.5].map((i) => (
            <group key={i}>
              <Block b={[i * 0.96, 0.45, 0.26, 0.84, 0.66, 0.03]} m={dark} />
              <Block b={[i * 0.96 + 0.3, 0.62, 0.29, 0.06, 0.16, 0.03]} m={w.woodDark} />
            </group>
          ))}
          <Block b={[-0.95, 0.92, -0.04, 0.6, 0.02, 0.42]} m={mat('#a9c7d6', { rough: 0.25 })} />
          <mesh position={[-0.95, 1.05, -0.3]} material={mat('#d7d3cf', { rough: 0.3 })} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.26, 8]} />
          </mesh>
          <mesh position={[1.1, 1.0, -0.12]} material={mat('#e7a3a8')} castShadow>
            <cylinderGeometry args={[0.12, 0.1, 0.16, 12]} />
          </mesh>
        </group>
      );
    case 'fridge':
      return (
        <group>
          <RoundedBox args={[0.8, 1.8, 0.7]} radius={0.06} position={[0, 0.9, -0.08]} material={c} castShadow receiveShadow />
          <Block b={[0, 1.18, 0.275, 0.78, 0.025, 0.02]} m={mat('#c9c3bb')} />
          {[0.75, 1.45].map((y) => (
            <Block key={y} b={[-0.28, y, 0.3, 0.04, y > 1 ? 0.3 : 0.5, 0.05]} m={mat('#c9c3bb', { rough: 0.4 })} />
          ))}
          <Block b={[0.12, 1.5, 0.29, 0.16, 0.12, 0.01]} m={mat('#f2cf6b')} />
        </group>
      );
    case 'stove':
      return (
        <group>
          <Block b={[0, 0.43, -0.05, 0.8, 0.86, 0.7]} m={c} />
          <Block b={[0, 0.88, -0.05, 0.82, 0.04, 0.72]} m={mat('#3d3842', { rough: 0.5 })} />
          {[
            [-0.18, -0.2],
            [0.18, -0.2],
            [-0.18, 0.12],
            [0.18, 0.12],
          ].map(([x, z]) => (
            <mesh key={x + ',' + z} position={[x, 0.91, z]} material={mat('#1f1c24', { rough: 0.6 })}>
              <cylinderGeometry args={[0.11, 0.11, 0.02, 14]} />
            </mesh>
          ))}
          <Block b={[0, 0.42, 0.3, 0.62, 0.42, 0.02]} m={mat('#2b2735', { rough: 0.2 })} />
          <Block b={[0, 0.7, 0.31, 0.5, 0.04, 0.04]} m={mat('#c9c3bb', { rough: 0.4 })} />
          {[-0.25, -0.08, 0.08, 0.25].map((x) => (
            <mesh key={x} position={[x, 0.8, 0.31]} rotation={[Math.PI / 2, 0, 0]} material={dark}>
              <cylinderGeometry args={[0.03, 0.03, 0.04, 8]} />
            </mesh>
          ))}
        </group>
      );
    case 'dining-set':
      return (
        <group>
          <Block b={[0, 0.72, 0, 1.9, 0.08, 0.95]} m={c} />
          {[
            [-0.85, -0.38],
            [0.85, -0.38],
            [-0.85, 0.38],
            [0.85, 0.38],
          ].map(([x, z]) => (
            <Block key={x + ',' + z} b={[x, 0.35, z, 0.08, 0.7, 0.08]} m={dark} />
          ))}
          <mesh position={[0, 0.84, 0]} material={mat('#fbf6ee')}>
            <cylinderGeometry args={[0.16, 0.12, 0.16, 12]} />
          </mesh>
          {[
            [-0.5, -0.78, 0],
            [0.5, -0.78, 0],
            [-0.5, 0.78, Math.PI],
            [0.5, 0.78, Math.PI],
            [-1.22, 0, Math.PI / 2],
            [1.22, 0, -Math.PI / 2],
          ].map(([x, z, ry]) => (
            <group key={x + ',' + z} position={[x, 0, z]} rotation={[0, ry, 0]} scale={0.9}>
              <PieceMesh piece="chair" color={color} />
            </group>
          ))}
        </group>
      );
    case 'tv-stand':
      return (
        <group>
          <Block b={[0, 0.27, -0.08, 2.5, 0.54, 0.55]} m={c} />
          {[-0.62, 0.62].map((x) => (
            <Block key={x} b={[x, 0.27, 0.2, 1.1, 0.4, 0.02]} m={dark} />
          ))}
          <Block b={[0, 0.6, -0.12, 0.3, 0.06, 0.2]} m={mat('#2b2735')} />
          <Block b={[0, 0.7, -0.12, 0.06, 0.16, 0.06]} m={mat('#2b2735')} />
          <RoundedBox args={[1.5, 0.86, 0.07]} radius={0.03} position={[0, 1.2, -0.12]} material={mat('#2b2735', { rough: 0.3 })} castShadow />
          <Block b={[0, 1.2, -0.08, 1.38, 0.74, 0.01]} m={mat('#3e4f66', { rough: 0.15 })} />
          <mesh position={[1.0, 0.68, -0.05]} material={mat('#6fae4f')} castShadow>
            <sphereGeometry args={[0.13, 10, 8]} />
          </mesh>
        </group>
      );
    case 'coffee-table':
      return (
        <group>
          <RoundedBox args={[1.5, 0.07, 0.7]} radius={0.03} position={[0, 0.42, 0]} material={c} castShadow receiveShadow />
          {[
            [-0.66, -0.28],
            [0.66, -0.28],
            [-0.66, 0.28],
            [0.66, 0.28],
          ].map(([x, z]) => (
            <Block key={x + ',' + z} b={[x, 0.2, z, 0.07, 0.4, 0.07]} m={dark} />
          ))}
          <Block b={[-0.3, 0.47, 0.05, 0.3, 0.04, 0.22]} m={mat('#d9674a')} />
          <mesh position={[0.35, 0.5, -0.05]} material={mat('#fbf6ee')}>
            <cylinderGeometry args={[0.05, 0.04, 0.1, 10]} />
          </mesh>
        </group>
      );
    case 'sofa':
      return (
        <group>
          <RoundedBox args={[2.7, 0.36, 0.82]} radius={0.08} position={[0, 0.24, 0]} material={dark} castShadow receiveShadow />
          {[-0.82, 0, 0.82].map((x) => (
            <RoundedBox key={x} args={[0.8, 0.16, 0.66]} radius={0.06} position={[x, 0.5, 0.06]} material={c} castShadow />
          ))}
          <RoundedBox args={[2.7, 0.62, 0.24]} radius={0.09} position={[0, 0.66, -0.3]} material={c} castShadow />
          {[-1, 1].map((s) => (
            <RoundedBox key={s} args={[0.24, 0.5, 0.82]} radius={0.08} position={[s * 1.28, 0.5, 0]} material={c} castShadow />
          ))}
          <RoundedBox args={[0.36, 0.3, 0.12]} radius={0.05} position={[-0.85, 0.72, -0.12]} rotation={[-0.3, 0, 0.1]} material={mat('#f2cf6b')} />
        </group>
      );
    case 'wardrobe':
      return (
        <group>
          <RoundedBox args={[1.8, 2.0, 0.6]} radius={0.05} position={[0, 1.02, -0.15]} material={c} castShadow receiveShadow />
          {[-0.45, 0.45].map((x) => (
            <group key={x}>
              <Block b={[x, 1.05, 0.16, 0.82, 1.8, 0.03]} m={dark} />
              <Block b={[x - Math.sign(x) * 0.33, 1.1, 0.19, 0.04, 0.24, 0.03]} m={mat('#e9c46a', { rough: 0.4 })} />
            </group>
          ))}
          <Block b={[0, 2.05, -0.15, 1.9, 0.08, 0.66]} m={dark} />
        </group>
      );
    case 'big-bed':
      return (
        <group>
          {/* Head against the wall, clear of its wainscot (the back 0.27 m of the footprint). */}
          <Block b={[0, 0.2, 0.1, 1.84, 0.32, 2.62]} m={w.wood} />
          <RoundedBox args={[1.9, 1.1, 0.12]} radius={0.05} position={[0, 0.6, -1.17]} material={w.woodDark} castShadow />
          <Block b={[0, 0.26, 1.4, 1.9, 0.5, 0.08]} m={w.woodDark} />
          <RoundedBox args={[1.72, 0.2, 2.46]} radius={0.06} position={[0, 0.44, 0.14]} material={mat('#fbf6ee')} castShadow />
          {[-0.45, 0.45].map((x) => (
            <RoundedBox key={x} args={[0.7, 0.16, 0.36]} radius={0.07} position={[x, 0.6, -0.86]} material={mat('#ffffff')} castShadow />
          ))}
          <RoundedBox args={[1.8, 0.12, 1.75]} radius={0.05} position={[0, 0.58, 0.48]} material={c} castShadow />
          <Block b={[0, 0.65, -0.36, 1.8, 0.05, 0.28]} m={mat('#fbf6ee')} />
        </group>
      );
    case 'bedside-table':
      return (
        <group>
          <RoundedBox args={[0.56, 0.52, 0.5]} radius={0.04} position={[0, 0.27, -0.08]} material={c} castShadow receiveShadow />
          <Block b={[0, 0.34, 0.18, 0.44, 0.14, 0.02]} m={dark} />
          <mesh position={[0, 0.62, -0.08]} material={dark}>
            <cylinderGeometry args={[0.03, 0.06, 0.2, 8]} />
          </mesh>
          <mesh position={[0, 0.8, -0.08]} material={LAMP()} castShadow>
            <cylinderGeometry args={[0.1, 0.15, 0.18, 12]} />
          </mesh>
        </group>
      );
    case 'carpet':
      return (
        <group>
          <RoundedBox args={[1.86, 0.025, 0.9]} radius={0.01} position={[0, 0.075, 0]} material={c} receiveShadow />
          <RoundedBox args={[1.5, 0.025, 0.56]} radius={0.01} position={[0, 0.082, 0]} material={dark} receiveShadow />
          <RoundedBox args={[1.2, 0.025, 0.3]} radius={0.01} position={[0, 0.088, 0]} material={c} receiveShadow />
        </group>
      );
    case 'desk':
      return (
        <group>
          <Block b={[0, 0.74, -0.05, 1.8, 0.06, 0.72]} m={c} />
          <Block b={[0.6, 0.36, -0.05, 0.5, 0.72, 0.66]} m={c} />
          {[0.22, 0.5].map((y) => (
            <Block key={y} b={[0.6, y, 0.29, 0.42, 0.2, 0.02]} m={dark} />
          ))}
          {[
            [-0.82, -0.34],
            [-0.82, 0.24],
          ].map(([x, z]) => (
            <Block key={z} b={[x, 0.36, z, 0.07, 0.72, 0.07]} m={dark} />
          ))}
          {['#7fb3d5', '#d9674a', '#f2cf6b'].map((col, i) => (
            <Block key={col} b={[-0.45, 0.8 + i * 0.05, -0.2, 0.36 - i * 0.04, 0.05, 0.26]} m={mat(col)} />
          ))}
          <mesh position={[0.55, 0.9, -0.25]} material={dark}>
            <cylinderGeometry args={[0.02, 0.07, 0.26, 8]} />
          </mesh>
          <mesh position={[0.55, 1.05, -0.2]} rotation={[0.5, 0, 0]} material={LAMP()}>
            <coneGeometry args={[0.1, 0.12, 12]} />
          </mesh>
        </group>
      );
    default:
      return <Block b={[0, 0.25, 0, 0.6, 0.5, 0.6]} m={c} />;
  }
}

/** Inside face of a wall: a wainscot below, a trim along the top (the wall's front, +z, faces out). A wall between two rooms gets the wainscot on both faces. */
function Trim({ both = false }: { both?: boolean }) {
  const w = getWorldMaterials();
  return (
    <>
      <Block b={[0, 0.43, -(WALL_T / 2 + 0.025), 1, 0.85, 0.05]} m={w.wood} />
      {both && <Block b={[0, 0.43, WALL_T / 2 + 0.025, 1, 0.85, 0.05]} m={w.wood} />}
      <Block b={[0, WALL_H + 0.05, 0, 1.04, 0.12, WALL_T + 0.12]} m={w.woodDark} />
    </>
  );
}

/** Where a placement's group sits and how it turns. */
function placementFrame(p: Placement): { x: number; z: number; ry: number } {
  const def = PIECES[p.piece];
  if (def.layer === 'edge') {
    const [x, z] = tileCenter(p.c, p.r);
    const e = edgeFrame(p.rot);
    // Pieces are modelled running along x with their front facing +z; turn to face out of the tile.
    const ry = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][((p.rot % 4) + 4) % 4];
    return { x: x + e.dx, z: z + e.dz, ry };
  }
  const [x, z] = placementCenter(p);
  return { x, z, ry: -(p.rot * Math.PI) / 2 };
}

/* ------------------------------------------------------------------ */
/* The villa: walls drop to a cutaway and the roof lifts while you're in */
/* ------------------------------------------------------------------ */

/** The villa's extent in world units. */
export function villaRect(farm: FarmState) {
  const b = villaBounds(farm);
  return b && { x0: GRID.x0 + b.c0, x1: GRID.x0 + b.c1, z0: GRID.z0 + b.r0, z1: GRID.z0 + b.r1 };
}

/** Outdoors behind the house (out of the back door) the roof would hide you: it lifts and the house drops low. */
const behind = { on: false };

/**
 * The house as it stands on the farm, in the same clay as the cottages in town (the Carpenter's
 * workshop): a brick base course, plaster walls, glowing windows, an arched door with a step, a
 * wall lamp, a chimney and the tiled roof in the farm's roof colour, with the farm's name on a
 * plaque by the door. Its size follows the villa tier. Its rooms are their own, bigger space
 * (see HOUSE_AREA); the doors lead there.
 */
function HouseShell({ farm, rev }: { farm: FarmState; rev: number }) {
  const e = houseShell(farm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const back = useMemo(() => shellDoors(farm).some((d) => d.side === 'back'), [farm, rev]);
  const rect = { x0: GRID.x0 + e.c, x1: GRID.x0 + e.c + e.w, z0: GRID.z0 + e.r, z1: GRID.z0 + e.r + e.h };
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const body = useRef<Group>(null);
  const roof = useRef<Group>(null);
  const fade = useRef(1);
  const m = getWorldMaterials();
  const name = farm.name.toUpperCase();
  const sign = useCanvasTexture(
    512,
    116,
    (ctx, w, h) => {
      ctx.fillStyle = '#c98d57';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff4dc';
      ctx.font = 'bold 50px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, w / 2, h / 2 + 3, w - 30);
    },
    'farm-sign-' + name,
  );
  useFrame((_, dt) => {
    const { x, z } = playerState.position;
    behind.on = z < rect.z0 + 0.2 && z > rect.z0 - 2.5 && x > rect.x0 - 0.5 && x < rect.x1 + 0.5;
    const k = 1 - Math.exp(-dt * 8);
    fade.current += ((behind.on ? 0 : 1) - fade.current) * k;
    if (body.current) body.current.scale.y += ((behind.on ? 0.3 : 1) - body.current.scale.y) * k;
    const g = roof.current;
    if (!g) return;
    // The roof tiles' materials were made transparent up front; the gable and chimney just hide.
    g.traverse((o) => {
      const mt = (o as Mesh).material as Material | undefined;
      if (!mt || !mt.transparent) return;
      mt.opacity = fade.current;
      mt.depthWrite = fade.current > 0.98;
    });
    g.visible = fade.current > 0.02;
  });
  return (
    <>
      <group ref={body}>
        <Cottage
          key={`${e.w}x${e.h}-${back}`}
          plan={{ x: cx, z: cz, w: e.w, d: e.h, rot: 0, wall: '#f3e7d2', roof: PALETTE[farm.roofColor] ?? PALETTE[1] }}
          collider={false}
          roofGroup={roof}
          fadeRoof
          backDoor={back}
        />
        <group position={[cx - 1.4, 1.1, rect.z1 + 0.08]}>
          <RoundedBox args={[1.5, 0.4, 0.08]} radius={0.04} material={m.woodDark} castShadow />
          <mesh position={[0, 0, 0.046]}>
            <planeGeometry args={[1.38, 0.31]} />
            <meshStandardMaterial map={sign} roughness={0.8} />
          </mesh>
        </group>
      </group>
      <RigidBody type="fixed" colliders={false} key={`${e.c},${e.w}x${e.h}`}>
        <CuboidCollider args={[e.w / 2 + 0.15, WALL_H / 2, e.h / 2 + 0.15]} position={[cx, WALL_H / 2, cz]} />
      </RigidBody>
    </>
  );
}

/** The ground the house's rooms stand on (they're off the farm), with walls round it so nobody walks off. */
function HouseGround() {
  const { c0, c1, r0, r1 } = HOUSE_AREA;
  const hx = (c1 - c0) / 2;
  const hz = (r1 - r0) / 2;
  const x = GRID.x0 + c0 + hx;
  const z = GRID.z0 + r0 + hz;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[hx + 1, 0.5, hz + 1]} position={[x, -0.5, z]} />
      <CuboidCollider args={[hx + 1, 2, 0.5]} position={[x, 2, z - hz - 0.5]} />
      <CuboidCollider args={[hx + 1, 2, 0.5]} position={[x, 2, z + hz + 0.5]} />
      <CuboidCollider args={[0.5, 2, hz + 1]} position={[x - hx - 0.5, 2, z]} />
      <CuboidCollider args={[0.5, 2, hz + 1]} position={[x + hx + 0.5, 2, z]} />
    </RigidBody>
  );
}

/**
 * One of the villa's walls. Indoors, the rooms are seen like a building in town: the back wall and
 * every wall running away from the camera (the sides and the walls between rooms) stand full height,
 * trimmed inside, while the walls facing the camera give way to one solid low front wall (see
 * LowWalls) with the front doors as bright openings in it (see InteriorDressing). In build mode
 * every wall drops so the whole floor plan shows.
 */
function VillaWall({ p, back, between, hideIndoors, closed, knob }: { p: Placement; back: boolean; between: boolean; hideIndoors: boolean; closed: boolean; knob: number }) {
  const group = useRef<Group>(null);
  const k = useRef(1);
  const indoors = useSession((s) => s.indoors && !s.build.on);
  useFrame((_, dt) => {
    const s = useSession.getState();
    const target = s.build.on ? 0.28 : 1;
    k.current += (target - k.current) * (1 - Math.exp(-dt * 8));
    if (group.current) group.current.scale.y = k.current;
  });
  const f = placementFrame(p);
  return (
    <group position={[f.x, 0, f.z]} rotation={[0, f.ry, 0]} visible={!(indoors && hideIndoors)}>
      <group ref={group}>
        <PieceMesh piece={p.piece} color={PALETTE[p.color] ?? PALETTE[0]} closed={closed} dressed={indoors && back} between={between} knob={knob} />
      </group>
    </group>
  );
}

/** Consecutive edge pieces on one line (one wall run, or a double door), in world units. */
interface EdgeRun {
  key: string;
  x: number;
  z: number;
  ry: number;
  /** Length along the wall, in tiles. */
  n: number;
  color: number;
  tall: boolean;
}

function edgeRuns(pieces: Placement[], tall: (p: Placement) => boolean): EdgeRun[] {
  const lines = new Map<string, Placement[]>();
  for (const p of pieces) {
    const rot = ((p.rot % 4) + 4) % 4;
    const key = rot % 2 === 0 ? `${rot}:r${p.r}` : `${rot}:c${p.c}`;
    lines.set(key, [...(lines.get(key) ?? []), p]);
  }
  const runs: EdgeRun[] = [];
  for (const line of lines.values()) {
    const along = (p: Placement) => (p.rot % 2 === 0 ? p.c : p.r);
    line.sort((a, b) => along(a) - along(b));
    let start = 0;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && along(line[i]) === along(line[i - 1]) + 1) continue;
      const a = placementFrame(line[start]);
      const b = placementFrame(line[i - 1]);
      runs.push({ key: String(line[start].id), x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, ry: a.ry, n: i - start, color: line[start].color, tall: tall(line[start]) });
      start = i;
    }
  }
  return runs;
}

/** Indoors, the walls facing the camera are one solid, rounded low wall (windows and all), thick like a building's in town. */
function LowWalls({ runs }: { runs: EdgeRun[] }) {
  const T = 0.34;
  const H = 0.74;
  return (
    <>
      {runs.map((r) => (
        <group key={r.key} position={[r.x, 0, r.z]} rotation={[0, r.ry, 0]}>
          <RoundedBox args={[r.n + 0.02, H, T]} radius={0.09} position={[0, H / 2, (WALL_T - T) / 2]} material={mat(PALETTE[r.color] ?? PALETTE[0])} castShadow receiveShadow />
        </group>
      ))}
    </>
  );
}

/**
 * Indoors the rooms float in the dark like a building's interior in town: a raised floor slab
 * under them, and each front door (a double door is one) a wide opening with the bright outdoors
 * glowing through it — under a header in a tall wall, as a gap in the low front wall — and a mat inside.
 */
function InteriorDressing({ farm, rev, doors }: { farm: FarmState; rev: number; doors: EdgeRun[] }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rect = useMemo(() => villaRect(farm), [farm, rev]);
  const w = getWorldMaterials();
  if (!rect) return null;
  const T = 0.3;
  return (
    <>
      <RoundedBox
        args={[rect.x1 - rect.x0 + T * 2, 0.4, rect.z1 - rect.z0 + T * 2]}
        radius={0.08}
        position={[(rect.x0 + rect.x1) / 2, -0.21, (rect.z0 + rect.z1) / 2]}
        receiveShadow
      >
        <meshStandardMaterial color="#6d4128" roughness={0.9} />
      </RoundedBox>
      {doors.map((d) => (
        <group key={d.key} position={[d.x, 0, d.z]} rotation={[0, d.ry, 0]}>
          {/* A wooden door frame — two posts and a lintel at door height — with the bright outdoors filling it. */}
          {[-1, 1].map((sx) => (
            <RoundedBox key={sx} args={[0.2, 2.0, 0.4]} radius={0.05} position={[sx * (d.n / 2 - 0.02), 1.0, -0.02]} material={w.woodDark} castShadow />
          ))}
          <RoundedBox args={[d.n + 0.24, 0.24, 0.46]} radius={0.06} position={[0, 2.1, -0.02]} material={w.woodDark} castShadow />
          <mesh position={[0, 1.0, WALL_T / 2 + 0.04]} material={OUTSIDE_GLOW}>
            <planeGeometry args={[d.n - 0.2, 2.0]} />
          </mesh>
          {/* In a full-height wall, its top trim runs on over the frame. */}
          {d.tall && <Block b={[0, WALL_H + 0.05, 0, d.n + 0.04, 0.12, WALL_T + 0.12]} m={w.woodDark} />}
          <RoundedBox args={[d.n * 0.8, 0.03, 0.6]} radius={0.01} position={[0, 0.075, -0.55]} receiveShadow>
            <meshStandardMaterial color="#b5543f" roughness={1} />
          </RoundedBox>
        </group>
      ))}
    </>
  );
}

/** Indoors, the windows glow with the light outside: bright by day, a soft blue at night. */
function RoomLight() {
  useFrame(() => {
    const s = useSession.getState();
    const h = 6 + useClock.getState().minute / 60;
    const day = h < 18 ? 1 : h < 20.5 ? 1 - (h - 18) / 2.5 : 0;
    GLASS().emissiveIntensity = s.indoors ? 0.25 + day * 0.85 : 0;
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Lanterns glow after dusk                                            */
/* ------------------------------------------------------------------ */

function LanternGlow() {
  useFrame(() => {
    const h = 6 + useClock.getState().minute / 60;
    const night = h >= 18.5 || h < 6.5 ? 1 : h >= 17.5 ? h - 17.5 : 0;
    const m = LAMP();
    m.emissiveIntensity = 0.15 + night * 2.2;
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Build-mode ghost                                                    */
/* ------------------------------------------------------------------ */

const GHOST_OK = new MeshStandardMaterial({ color: '#8fe3a0', transparent: true, opacity: 0.55, depthWrite: false });
const GHOST_BAD = new MeshStandardMaterial({ color: '#f08a7e', transparent: true, opacity: 0.55, depthWrite: false });


function Ghost({ farm }: { farm: FarmState }) {
  const build = useSession((s) => s.build);
  if (!build.on || !build.hover || build.remove || !build.piece) {
    if (build.on && build.hover && build.remove) {
      const [x, z] = tileCenter(build.hover[0], build.hover[1]);
      return (
        <mesh position={[x, 0.06, z]} material={GHOST_BAD}>
          <boxGeometry args={[0.98, 0.1, 0.98]} />
        </mesh>
      );
    }
    return null;
  }
  const def = PIECES[build.piece];
  const [c, r] = build.hover;
  const rot = def.layer === 'edge' ? nearestEdge(c, r, buildPointer.x, buildPointer.z) : build.rot;
  const problem = placementProblem(farm, build.piece, c, r, rot);
  const frame = placementFrame({ id: 0, piece: build.piece, c, r, rot, color: 0, storey: 0 });
  const [w, d] = def.size ?? [1, 1];
  const h = def.layer === 'floor' ? 0.08 : def.layer === 'edge' ? (build.piece === 'fence' ? 0.8 : WALL_H) : 0.9;
  return (
    <group position={[frame.x, 0, frame.z]} rotation={[0, frame.ry, 0]}>
      <mesh position={[0, h / 2, 0]} material={problem ? GHOST_BAD : GHOST_OK}>
        <boxGeometry args={def.layer === 'edge' ? [1, h, WALL_T + 0.04] : [w, h, d]} />
      </mesh>
      {!problem && (
        <group>
          <PieceMesh piece={build.piece} color={PALETTE[build.color ?? def.color]} />
        </group>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function Placements() {
  const farm = useFarmState();
  const rev = useFarm((s) => s.rev);
  const indoors = useSession((s) => s.indoors);
  const building = useSession((s) => s.build.on);
  // One fixed body holding a collider per solid piece; rebuilt only when the layout changes
  // (not on every watering can).
  const layout = farm ? farm.placements.map((p) => `${p.id}:${p.c},${p.r},${p.rot}`).join('|') : '';
  const colliders = useMemo(() => {
    if (!farm) return [];
    const front = new Set(villaDoors(farm).map((d) => d.placement.id));
    return farm.placements.flatMap((p) => {
      const f = placementFrame(p);
      return solidBoxes(p, front.has(p.id)).map((b, i) => ({ key: `${p.id}-${i}`, f, b }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);
  if (!farm) return null;
  const bounds = villaBounds(farm);
  const inVillaTiles = (p: Placement) =>
    !!bounds && footprint(PIECES[p.piece], p.c, p.r, p.rot).every(([c, r]) => c >= bounds.c0 && c < bounds.c1 && r >= bounds.r0 && r < bounds.r1);
  const isVillaWall = (p: Placement) => PIECES[p.piece].villa && PIECES[p.piece].layer === 'edge' && inVillaTiles(p);
  const within = (c: number, r: number) => !!bounds && c >= bounds.c0 && c < bounds.c1 && r >= bounds.r0 && r < bounds.r1;
  /** A wall with rooms on both sides of it. */
  const isBetween = (p: Placement) => {
    const [nx, nz] = EDGE_NORMAL[((p.rot % 4) + 4) % 4];
    return within(p.c + nx, p.r + nz);
  };
  const isBackWall = (p: Placement) => !!bounds && (p.rot % 2 === 1 || (p.rot % 4 === 0 && p.r === bounds.r0));
  const front = new Set(villaDoors(farm).map((d) => d.placement.id));
  const draw = (p: Placement) => {
    const f = placementFrame(p);
    return (
      <group key={p.id} position={[f.x, 0, f.z]} rotation={[0, f.ry, 0]}>
        <PieceMesh piece={p.piece} color={PALETTE[p.color] ?? PALETTE[0]} />
      </group>
    );
  };
  const insideHouse = (p: Placement) => inHouseArea(p.c, p.r);
  const rest = farm.placements.filter((p) => !isVillaWall(p));
  const walls = farm.placements.filter(isVillaWall);
  /** A shut door's knob side: toward its neighbour for a pair side by side (see PieceMesh). */
  const knobSide = (p: Placement) => {
    const ry = placementFrame(p).ry;
    const sign = p.rot % 2 === 0 ? Math.round(Math.cos(ry)) : Math.round(-Math.sin(ry));
    return ((p.rot % 2 === 0 ? p.c : p.r) % 2 === 0 ? 1 : -1) * sign;
  };
  const lowRuns = edgeRuns(
    walls.filter((p) => !isBackWall(p) && p.piece !== 'wall-door'),
    () => false,
  );
  const doorRuns = edgeRuns(
    walls.filter((p) => front.has(p.id)),
    isBackWall,
  );
  return (
    <>
      {/* Outdoors: the farm and the house's shell. Indoors: only the house's rooms (their own space). */}
      <group visible={!indoors}>
        {rest.filter((p) => !insideHouse(p)).map(draw)}
        <HouseShell farm={farm} rev={rev} />
      </group>
      <group visible={indoors}>
        {rest.filter(insideHouse).map(draw)}
        {walls.map((p) => (
          <VillaWall key={p.id} p={p} back={isBackWall(p)} between={isBetween(p)} hideIndoors={front.has(p.id) || !isBackWall(p)} closed={false} knob={knobSide(p)} />
        ))}
        <group visible={!building}>
          <LowWalls runs={lowRuns} />
        </group>
        <InteriorDressing farm={farm} rev={rev} doors={doorRuns} />
      </group>
      <HouseGround />
      <RoomLight />
      <RigidBody key={layout.length + layout.slice(-64)} type="fixed" colliders={false}>
        {colliders.map(({ key, f, b }) => {
          const cos = Math.cos(f.ry);
          const sin = Math.sin(f.ry);
          return (
            <CuboidCollider
              key={key}
              args={[b[3] / 2, b[4] / 2, b[5] / 2]}
              position={[f.x + b[0] * cos + b[2] * sin, b[1], f.z - b[0] * sin + b[2] * cos]}
              rotation={[0, f.ry, 0]}
            />
          );
        })}
      </RigidBody>
      <Ghost farm={farm} />
      <LanternGlow />
    </>
  );
}

export { footprint, placementFrame };
