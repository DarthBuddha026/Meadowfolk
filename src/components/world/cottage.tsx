'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { HousePlan } from '@/game/data';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

const dummy = new Object3D();
const TILE_GEO = new CylinderGeometry(0.25, 0.25, 0.06, 18);
const BRICK_GEO = new RoundedBoxGeometry(0.5, 0.26, 0.2, 2, 0.05);
/** Half-width of the gap the front brick course leaves for the door (door 0.86 wide plus bevel). */
const DOOR_GAP = 0.5;

/**
 * Gable roof made of overlapping round "fish-scale" tiles over a solid slab.
 * Ridge runs along X. `baseY` is the eave height.
 */
export function TiledRoof({
  width,
  depth,
  baseY,
  rise,
  overhang = 0.35,
  color,
  fadeable = false,
}: {
  width: number;
  depth: number;
  baseY: number;
  rise: number;
  overhang?: number;
  color: string;
  /** Create the materials transparent up front so a parent can fade opacity cheaply. */
  fadeable?: boolean;
}) {
  const { tiles, slabMat, ridgeMat, half, slope, angle } = useMemo(() => {
    const half = depth / 2 + overhang;
    const slope = Math.hypot(half, rise);
    const angle = Math.atan2(rise, half);
    const cols = Math.ceil((width + overhang * 2) / 0.4);
    const rows = Math.ceil(slope / 0.27);
    const tileMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, transparent: fadeable });
    const slabMat = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.7), roughness: 0.9, transparent: fadeable });
    const ridgeMat = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.85), roughness: 0.75, transparent: fadeable });
    const tiles = new InstancedMesh(TILE_GEO, tileMat, cols * rows * 2);
    const c = new Color();
    let n = 0;
    for (const side of [1, -1]) {
      for (let r = 0; r < rows; r++) {
        const t = (r + 0.6) * (slope / rows);
        const y = baseY + rise - t * Math.sin(angle) + 0.07;
        const z = side * t * Math.cos(angle);
        for (let k = 0; k < cols; k++) {
          const x = -width / 2 - overhang + 0.2 + k * 0.4 + (r % 2 ? 0.2 : 0);
          if (x > width / 2 + overhang - 0.05) continue;
          dummy.position.set(x, y, z);
          dummy.rotation.set(side * (angle + 0.1), 0, 0);
          dummy.scale.set(1, 1, 0.9);
          dummy.updateMatrix();
          tiles.setMatrixAt(n, dummy.matrix);
          const shade = 0.92 + ((k * 7 + r * 13) % 9) / 60;
          tiles.setColorAt(n, c.set(color).multiplyScalar(shade));
          n++;
        }
      }
    }
    tiles.count = n;
    tiles.castShadow = true;
    tiles.receiveShadow = true;
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    tiles.computeBoundingSphere();
    return { tiles, slabMat, ridgeMat, half, slope, angle };
  }, [width, depth, baseY, rise, overhang, color, fadeable]);

  return (
    <group>
      <primitive object={tiles} />
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[0, baseY + rise / 2, (side * half) / 2]}
          rotation={[side * angle, 0, 0]}
          material={slabMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width + overhang * 2, 0.1, slope]} />
        </mesh>
      ))}
      <mesh position={[0, baseY + rise + 0.08, 0]} rotation={[0, 0, Math.PI / 2]} material={ridgeMat} castShadow>
        <cylinderGeometry args={[0.13, 0.13, width + overhang * 2 + 0.1, 12]} />
      </mesh>
    </group>
  );
}

function ArchedOpening({ w, h, depth, material }: { w: number; h: number; depth: number; material: MeshStandardMaterial }) {
  const geo = useMemo(() => {
    const s = new Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 12 });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [w, h, depth]);
  return <mesh geometry={geo} material={material} castShadow />;
}

function Window({ x, y, z, rotY = 0, glass }: { x: number; y: number; z: number; rotY?: number; glass: MeshStandardMaterial }) {
  const m = getWorldMaterials();
  return (
    <group position={[x, y, z]} rotation={[0, rotY, 0]}>
      <RoundedBox args={[0.74, 0.74, 0.1]} radius={0.04} material={m.wood} castShadow />
      <mesh position={[0, 0, 0.055]} material={glass}>
        <planeGeometry args={[0.56, 0.56]} />
      </mesh>
      <mesh position={[0, 0, 0.07]} material={m.woodDark}>
        <boxGeometry args={[0.06, 0.58, 0.03]} />
      </mesh>
      <mesh position={[0, 0, 0.07]} material={m.woodDark}>
        <boxGeometry args={[0.58, 0.06, 0.03]} />
      </mesh>
      <RoundedBox args={[0.84, 0.1, 0.2]} radius={0.03} position={[0, -0.4, 0.06]} material={m.woodDark} />
    </group>
  );
}

/** Ground-floor shopfront: two wide windows either side of the door, a striped awning and a name board. */
function Shopfront({ w, d, baseH, name, glass }: { w: number; d: number; baseH: number; name: string; glass: MeshStandardMaterial }) {
  const m = getWorldMaterials();
  const sign = useCanvasTexture(
    512,
    116,
    (ctx, cw, ch) => {
      ctx.fillStyle = '#c98d57';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#fff4dc';
      ctx.font = 'bold 60px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, cw / 2, ch / 2 + 3, cw - 30);
    },
    'shop-' + name
  );
  const paneW = w / 2 - DOOR_GAP - 0.55;
  const paneX = DOOR_GAP + 0.2 + paneW / 2;
  const stripes = Math.round((w - 0.3) / 0.45);
  const z = d / 2;
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * paneX, baseH + 0.62, z + 0.04]}>
          <RoundedBox args={[paneW + 0.14, 0.94, 0.1]} radius={0.04} material={m.wood} castShadow />
          <mesh position={[0, 0, 0.055]} material={glass}>
            <planeGeometry args={[paneW, 0.8]} />
          </mesh>
          <RoundedBox args={[paneW + 0.24, 0.1, 0.22]} radius={0.03} position={[0, -0.5, 0.06]} material={m.woodDark} />
        </group>
      ))}
      {/* Striped awning over the shopfront */}
      {Array.from({ length: stripes }, (_, i) => (
        <mesh key={i} position={[-w / 2 + 0.15 + (i + 0.5) * ((w - 0.3) / stripes), baseH + 1.32, z + 0.38]} rotation={[0.42, 0, 0]} castShadow>
          <boxGeometry args={[(w - 0.3) / stripes, 0.05, 0.8]} />
          <meshStandardMaterial color={i % 2 ? '#fff4dc' : '#4fae8a'} roughness={0.8} />
        </mesh>
      ))}
      <group position={[0, baseH + 1.72, z + 0.06]}>
        <RoundedBox args={[2.6, 0.5, 0.08]} radius={0.04} material={m.woodDark} castShadow />
        <mesh position={[0, 0, 0.046]}>
          <planeGeometry args={[2.44, 0.4]} />
          <meshStandardMaterial map={sign} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/** A Junction cottage: brick base, plaster walls, tiled gable roof, warm windows. Optionally two storeys and a shop below. */
export function Cottage({ plan }: { plan: HousePlan }) {
  const m = getWorldMaterials();
  const { w, d } = plan;
  const storeys = plan.storeys ?? 1;
  const baseH = 0.52;
  const floorH = 1.55;
  const wallH = floorH * storeys;
  const eave = baseH + wallH;
  const rise = 1.35;

  const mats = useMemo(() => {
    const wall = new MeshStandardMaterial({ map: m.plaster, color: plan.wall, roughness: 0.95 });
    const glass = new MeshStandardMaterial({ color: '#ffe6a8', emissive: '#ffb347', emissiveIntensity: 0.9, roughness: 0.3 });
    const brick = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    return { wall, glass, brick };
  }, [m, plan.wall]);

  const bricks = useMemo(() => {
    const perSideX = Math.round((w + 0.1) / 0.52);
    const perSideZ = Math.round((d + 0.1) / 0.52);
    // [x, y, z, rotY, length scale]
    const list: [number, number, number, number, number][] = [];
    for (let row = 0; row < 2; row++) {
      const y = 0.13 + row * 0.27;
      const off = row % 2 ? 0.26 : 0;
      for (let k = 0; k < perSideX; k++) {
        const x = -w / 2 + 0.26 + k * 0.52 + off;
        if (x > w / 2) continue;
        list.push([x, y, -d / 2 - 0.06, 0, 1]);
        // The front course leaves the doorway open: bricks crossing it are trimmed to the part beside it.
        const a = x - 0.25;
        const b = x + 0.25;
        if (b <= -DOOR_GAP || a >= DOOR_GAP) list.push([x, y, d / 2 + 0.06, 0, 1]);
        else {
          if (-DOOR_GAP - a > 0.08) list.push([(a - DOOR_GAP) / 2, y, d / 2 + 0.06, 0, (-DOOR_GAP - a) / 0.5]);
          if (b - DOOR_GAP > 0.08) list.push([(b + DOOR_GAP) / 2, y, d / 2 + 0.06, 0, (b - DOOR_GAP) / 0.5]);
        }
      }
      for (let k = 0; k < perSideZ; k++) {
        const z = -d / 2 + 0.26 + k * 0.52 + off;
        if (z > d / 2) continue;
        list.push([w / 2 + 0.06, y, z, Math.PI / 2, 1], [-w / 2 - 0.06, y, z, Math.PI / 2, 1]);
      }
    }
    const mesh = new InstancedMesh(BRICK_GEO, mats.brick, list.length);
    const c = new Color();
    list.forEach(([x, y, z, r, len], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, r, 0);
      dummy.scale.set(len, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, c.set(i % 3 === 0 ? '#c99a6e' : i % 3 === 1 ? '#d6a97a' : '#bf8c60'));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }, [w, d, mats.brick]);

  const gable = useMemo(() => {
    const s = new Shape();
    s.moveTo(-d / 2, 0);
    s.lineTo(d / 2, 0);
    s.lineTo(0, rise - 0.05);
    s.lineTo(-d / 2, 0);
    const g = new ExtrudeGeometry(s, { depth: w - 0.02, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(-(w - 0.02) / 2, 0, 0);
    return g;
  }, [w, d, rise]);

  return (
    <RigidBody type="fixed" colliders={false} position={[plan.x, 0, plan.z]} rotation={[0, plan.rot, 0]}>
      <CuboidCollider args={[w / 2 + 0.15, 1.6 * storeys, d / 2 + 0.15]} position={[0, 1.6 * storeys, 0]} />
      <primitive object={bricks} />
      <RoundedBox args={[w, wallH, d]} radius={0.08} position={[0, baseH + wallH / 2, 0]} material={mats.wall} castShadow receiveShadow />
      <mesh geometry={gable} position={[0, eave, 0]} material={mats.wall} castShadow />
      <TiledRoof width={w} depth={d} baseY={eave - 0.05} rise={rise} color={plan.roof} />
      {/* Chimney */}
      <RoundedBox args={[0.45, 1.1, 0.45]} radius={0.06} position={[w / 2 - 0.7, eave + rise * 0.75, -d / 4]} castShadow>
        <meshStandardMaterial color="#c99a6e" roughness={0.9} />
      </RoundedBox>
      {/* Door — the plaster behind it fills the gap in the brick course */}
      <mesh position={[0, baseH / 2, d / 2 - 0.02]} material={mats.wall} receiveShadow>
        <boxGeometry args={[DOOR_GAP * 2, baseH, 0.1]} />
      </mesh>
      <group position={[0, 0.06, d / 2 + 0.02]}>
        <ArchedOpening w={0.86} h={1.32} depth={0.12} material={m.woodDark} />
        <mesh position={[0.24, 0.65, 0.09]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial color="#e8c35a" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
      <RoundedBox args={[1.2, 0.14, 0.55]} radius={0.05} position={[0, 0.07, d / 2 + 0.32]} material={m.wood} receiveShadow />
      {/* Windows, one row per floor; upper floors get one over the door too */}
      {Array.from({ length: storeys }, (_, k) => {
        const y = baseH + 0.85 + k * floorH;
        const front = k > 0 || !plan.shop;
        return (
          <group key={k}>
            {front && <Window x={-w / 2 + 0.85} y={y} z={d / 2 + 0.04} glass={mats.glass} />}
            {front && <Window x={w / 2 - 0.85} y={y} z={d / 2 + 0.04} glass={mats.glass} />}
            {k > 0 && <Window x={0} y={y} z={d / 2 + 0.04} glass={mats.glass} />}
            <Window x={w / 2 + 0.04} y={y} z={0} rotY={Math.PI / 2} glass={mats.glass} />
            <Window x={-w / 2 - 0.04} y={y} z={0} rotY={-Math.PI / 2} glass={mats.glass} />
          </group>
        );
      })}
      {plan.shop ? (
        <Shopfront w={w} d={d} baseH={baseH} name={plan.shop} glass={mats.glass} />
      ) : (
        // Wall lamp
        <mesh position={[0.62, 1.45, d / 2 + 0.1]} material={m.lanternGlow}>
          <boxGeometry args={[0.16, 0.2, 0.12]} />
        </mesh>
      )}
    </RigidBody>
  );
}
