'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { ExtrudeGeometry, Shape, Vector2, type BufferGeometry, type Material, type Mesh, type MeshStandardMaterial } from 'three';
import { RIDGE, TERRAIN, WORLD_BOUNDS, type Pt } from '@/game/data';
import { BRIDGE_TOP, getTerrain, PATH_BEVEL, PATH_BEVEL_DROP, PATH_TOP, RIM_HEIGHT, WATER_LEVEL, type Loop } from '@/game/engine/terrain';
import { getWorldMaterials } from './materials';

/* ------------------------------------------------------------------ */
/* Loops → clay-like extruded geometry                                 */
/* ------------------------------------------------------------------ */

function signedArea(loop: Pt[]) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, z1] = loop[i];
    const [x2, z2] = loop[(i + 1) % loop.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function pointInLoop([px, pz]: Pt, loop: Pt[]) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, zi] = loop[i];
    const [xj, zj] = loop[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function toShapes(loops: Loop[]): Shape[] {
  if (!loops.length) return [];
  const areas = loops.map(signedArea);
  const outerSign = Math.sign(areas[areas.reduce((best, a, i) => (Math.abs(a) > Math.abs(areas[best]) ? i : best), 0)]);
  const outers = loops.filter((_, i) => Math.sign(areas[i]) === outerSign);
  const holes = loops.filter((_, i) => Math.sign(areas[i]) !== outerSign);
  // Shape space: (x, -z) so that rotating -90° about X lays it on the ground.
  const toV = (l: Pt[]) => l.map(([x, z]) => new Vector2(x, -z));
  return outers.map((outer) => {
    const shape = new Shape(toV(outer));
    holes.filter((h) => pointInLoop(h[0], outer)).forEach((h) => shape.holes.push(new Shape(toV(h))));
    return shape;
  });
}

interface SlabOptions {
  depth: number;
  bevel: number;
  bevelThickness: number;
  segments?: number;
}

function extrude(loops: Loop[], o: SlabOptions): BufferGeometry {
  const geo = new ExtrudeGeometry(toShapes(loops), {
    depth: o.depth,
    bevelEnabled: true,
    bevelThickness: o.bevelThickness,
    bevelSize: o.bevel,
    // Outward bevel only: an inward bevelOffset makes three.js smear cap triangles
    // across concave (C-shaped) outlines.
    bevelOffset: 0,
    bevelSegments: o.segments ?? 3,
    curveSegments: 1,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  // Put the top cap at y = 0.
  geo.translate(0, -(o.depth + o.bevelThickness), 0);
  return geo;
}

function Slab({ geometry, top, materials }: { geometry: BufferGeometry; top: number; materials: Material | Material[] }) {
  return <mesh geometry={geometry} position={[0, top, 0]} material={materials} receiveShadow castShadow />;
}

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

function Water() {
  const m = getWorldMaterials();
  const surface = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const map = (surface.current?.material as MeshStandardMaterial | undefined)?.map;
    if (!map) return;
    map.offset.x += dt * 0.012;
    map.offset.y += dt * 0.004;
  });
  return (
    <>
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]} material={m.water} receiveShadow>
        <planeGeometry args={[220, 220]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.35, 0]}>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#2f7f86" />
      </mesh>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bridge & pond                                                       */
/* ------------------------------------------------------------------ */

function Bridge({ center, length, width, rotation }: { center: Pt; length: number; width: number; rotation: number }) {
  const m = getWorldMaterials();
  const planks = Math.floor(length / 0.42);
  return (
    <group position={[center[0], 0, center[1]]} rotation={[0, rotation, 0]}>
      {Array.from({ length: planks }).map((_, i) => (
        <RoundedBox
          key={i}
          args={[width, 0.14, 0.38]}
          radius={0.05}
          smoothness={2}
          position={[0, BRIDGE_TOP - 0.07, -length / 2 + 0.21 + i * 0.42]}
          material={i % 2 ? m.wood : m.woodDark}
          castShadow
          receiveShadow
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[(side * (width + 0.15)) / 2, 0, 0]}>
          {[-length / 2 + 0.3, 0, length / 2 - 0.3].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <mesh position={[0, 0.35, 0]} material={m.woodDark} castShadow>
                <cylinderGeometry args={[0.11, 0.13, 0.9, 12]} />
              </mesh>
              <mesh position={[0, 0.82, 0]} material={m.wood} castShadow>
                <sphereGeometry args={[0.13, 12, 10]} />
              </mesh>
            </group>
          ))}
          <RoundedBox args={[0.12, 0.12, length - 0.5]} radius={0.05} position={[0, 0.62, 0]} material={m.wood} castShadow />
        </group>
      ))}
    </group>
  );
}

function Pond() {
  const m = getWorldMaterials();
  const { center, radius } = TERRAIN.pond;
  const stones = useMemo(() => {
    const n = 22;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * radius, z: Math.sin(a) * radius, s: 0.85 + ((i * 37) % 7) / 20, a };
    });
  }, [radius]);
  return (
    <RigidBody type="fixed" colliders={false} position={[center[0], 0, center[1]]}>
      <CylinderCollider args={[1, radius + 0.25]} position={[0, 1, 0]} />
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.water} receiveShadow>
        <circleGeometry args={[radius, 40]} />
      </mesh>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, 0.12, s.z]} rotation={[0, -s.a, 0]} scale={[0.42 * s.s, 0.26 * s.s, 0.36 * s.s]} material={m.stone} castShadow receiveShadow>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
      ))}
      {/* lily pad + cattails */}
      <mesh position={[0.5, 0.08, -0.3]} rotation={[-Math.PI / 2, 0, 0.6]}>
        <circleGeometry args={[0.42, 20, 0.3, Math.PI * 2 - 0.6]} />
        <meshStandardMaterial color="#7fae52" roughness={0.8} />
      </mesh>
      {[
        [-0.6, 0.5],
        [-0.35, 0.75],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.9, 6]} />
            <meshStandardMaterial color="#7aa04a" />
          </mesh>
          <mesh position={[0, 0.85, 0]}>
            <capsuleGeometry args={[0.05, 0.16, 4, 8]} />
            <meshStandardMaterial color="#b9783f" />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

export function Terrain() {
  const terrain = getTerrain();
  const m = getWorldMaterials();

  const geos = useMemo(() => {
    const land = extrude(terrain.land, { depth: 1.2, bevel: 0.32, bevelThickness: 0.14 });
    // The beaches: a lower, softer slab of sand sloping into the sea.
    const beach = extrude(terrain.beach, { depth: 1.0, bevel: 0.6, bevelThickness: 0.18 });
    const rim = extrude(terrain.rim, { depth: RIM_HEIGHT + 0.6, bevel: 0.38, bevelThickness: 0.16 });
    const paths = extrude(terrain.paths, { depth: 0.02, bevel: PATH_BEVEL, bevelThickness: PATH_BEVEL_DROP, segments: 2 });
    return { land, beach, rim, paths };
  }, [terrain]);

  const bankMats = useMemo(() => {
    const make = (depth: number, bt: number) => {
      const tex = m.bankTexture.clone();
      const total = depth + bt * 2;
      tex.repeat.set(0.3, 1 / total);
      tex.offset.set(0, bt / total);
      tex.needsUpdate = true;
      const mat = m.bank.clone();
      mat.map = tex;
      return mat;
    };
    return { land: make(1.2, 0.14), rim: make(RIM_HEIGHT + 0.6, 0.16) };
  }, [m]);

  const { west: bw, east: be, north: bn, south: bs } = WORLD_BOUNDS;
  const midX = (be - bw) / 2;
  const halfX = (be + bw) / 2;
  const midZ = (bs - bn) / 2;
  const halfZ = (bs + bn) / 2;
  // The ridge's two halves, either side of the cutting (the north gate closes the cutting itself).
  const ridgeZ = (RIDGE.z[0] + RIDGE.z[1]) / 2;
  const ridgeHalfZ = (RIDGE.z[1] - RIDGE.z[0]) / 2;
  const cutW = RIDGE.cut.x - RIDGE.cut.half;
  const cutE = RIDGE.cut.x + RIDGE.cut.half;

  return (
    <>
      <Water />
      <Slab geometry={geos.land} top={0} materials={[m.grass, bankMats.land]} />
      <Slab geometry={geos.beach} top={-0.02} materials={[m.sand, m.sand]} />
      <Slab geometry={geos.rim} top={RIM_HEIGHT} materials={[m.grass, bankMats.rim]} />
      <Slab geometry={geos.paths} top={PATH_TOP} materials={[m.sand, m.sand]} />
      {TERRAIN.bridges.map((b, i) => (
        <Bridge key={i} {...b} />
      ))}
      <Pond />

      <RigidBody type="fixed" colliders={false}>
        {/* Ground everywhere; water, the rim and the waterline block movement. */}
        <CuboidCollider args={[110, 0.5, 80]} position={[26, -0.5, 0]} />
        {terrain.waterColliders.map((c, i) => (
          <CuboidCollider key={i} args={[c.hx, 1.5, c.hz]} position={[c.x, 1, c.z]} />
        ))}
        <CuboidCollider args={[halfX, 3, 0.5]} position={[midX, 3, -bn - 0.5]} />
        <CuboidCollider args={[halfX, 3, 0.5]} position={[midX, 3, bs + 0.5]} />
        <CuboidCollider args={[0.5, 3, halfZ]} position={[-bw - 0.5, 3, midZ]} />
        <CuboidCollider args={[0.5, 3, halfZ]} position={[be + 0.5, 3, midZ]} />
        <CuboidCollider args={[(cutW + bw) / 2, 3, ridgeHalfZ]} position={[(cutW - bw) / 2, 3, ridgeZ]} />
        <CuboidCollider args={[(RIDGE.east - cutE) / 2, 3, ridgeHalfZ]} position={[(RIDGE.east + cutE) / 2, 3, ridgeZ]} />
      </RigidBody>
    </>
  );
}
