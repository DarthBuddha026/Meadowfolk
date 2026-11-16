'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { BoxGeometry, ConeGeometry, InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three';
import { FARM, TRACTOR } from '@/game/data';
import { getWorldMaterials } from './materials';

const dummy = new Object3D();
/** Width of the gate in the north fence, and of the aisle that runs from it to the scarecrow. */
const AISLE = 1.4;

/** Crop rows across the field: cabbages and corn in alternate rows, around a central aisle. */
function Crops() {
  const meshes = useMemo(() => {
    const cabbages: [number, number, number][] = [];
    const corn: [number, number, number][] = [];
    const rows = Math.floor((FARM.d - 0.6) / 0.8);
    for (let r = 0; r < rows; r++) {
      const z = FARM.z - FARM.d / 2 + 0.6 + r * 0.8;
      for (let x = FARM.x - FARM.w / 2 + 0.5; x < FARM.x + FARM.w / 2 - 0.4; x += 0.62) {
        if (Math.abs(x - FARM.x) < AISLE / 2 + 0.2) continue;
        (r % 2 ? corn : cabbages).push([x, z, 0.85 + (Math.round(x * 7 + r * 3) % 4) * 0.08]);
      }
    }
    const make = (geo: BoxGeometry | SphereGeometry | ConeGeometry, color: string, count: number, place: (i: number) => void) => {
      const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ color, roughness: 0.85 }), count);
      for (let i = 0; i < count; i++) {
        place(i);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      return mesh;
    };
    const ball = new SphereGeometry(1, 10, 8);
    const leaf = new ConeGeometry(1, 1, 5);
    return [
      // Cabbages: a pale heart inside two outer leaves
      make(ball, '#9ccf62', cabbages.length, (i) => {
        const [x, z, s] = cabbages[i];
        dummy.position.set(x, 0.2 * s, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.2 * s, 0.15 * s, 0.2 * s);
      }),
      make(ball, '#6fae45', cabbages.length * 2, (i) => {
        const [x, z, s] = cabbages[i >> 1];
        const a = (i & 1) * Math.PI + x;
        dummy.position.set(x + Math.cos(a) * 0.12 * s, 0.13 * s, z + Math.sin(a) * 0.12 * s);
        dummy.rotation.set(0, -a, 0.5);
        dummy.scale.set(0.2 * s, 0.07 * s, 0.15 * s);
      }),
      // Corn: a tall stalk of stacked leaves with a golden cob
      make(leaf, '#86b04a', corn.length * 2, (i) => {
        const [x, z, s] = corn[i >> 1];
        const k = i & 1;
        dummy.position.set(x, (0.35 + k * 0.35) * s, z);
        dummy.rotation.set(0, x * 3 + k, 0);
        dummy.scale.set((0.2 - k * 0.05) * s, 0.75 * s, (0.2 - k * 0.05) * s);
      }),
      make(ball, '#f2c94c', corn.length, (i) => {
        const [x, z, s] = corn[i];
        dummy.position.set(x + 0.09, 0.62 * s, z);
        dummy.rotation.set(0, 0, -0.3);
        dummy.scale.set(0.05 * s, 0.13 * s, 0.05 * s);
      }),
    ];
  }, []);
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  );
}

/** Low post-and-rail fence around the field, with a gate gap in the north side facing Mika's road. */
function Fence() {
  const m = getWorldMaterials();
  const { x, z, w, d } = FARM;
  // Each side: [from x, from z, to x, to z]
  const sides: [number, number, number, number][] = [
    [x - w / 2, z - d / 2, x - AISLE / 2, z - d / 2],
    [x + AISLE / 2, z - d / 2, x + w / 2, z - d / 2],
    [x - w / 2, z + d / 2, x + w / 2, z + d / 2],
    [x - w / 2, z - d / 2, x - w / 2, z + d / 2],
    [x + w / 2, z - d / 2, x + w / 2, z + d / 2],
  ];
  return (
    <RigidBody type="fixed" colliders={false}>
      {sides.map(([ax, az, bx, bz], i) => {
        const len = Math.hypot(bx - ax, bz - az);
        const along = Math.abs(bz - az) > 0.01;
        const posts = Math.max(1, Math.round(len / 1.3));
        return (
          <group key={i}>
            <CuboidCollider args={along ? [0.1, 0.45, len / 2] : [len / 2, 0.45, 0.1]} position={[(ax + bx) / 2, 0.45, (az + bz) / 2]} />
            {Array.from({ length: posts + 1 }, (_, k) => (
              <mesh key={k} position={[ax + ((bx - ax) * k) / posts, 0.35, az + ((bz - az) * k) / posts]} material={m.woodDark} castShadow>
                <boxGeometry args={[0.1, 0.7, 0.1]} />
              </mesh>
            ))}
            {[0.3, 0.55].map((y) => (
              <mesh key={y} position={[(ax + bx) / 2, y, (az + bz) / 2]} material={m.wood} castShadow>
                <boxGeometry args={along ? [0.05, 0.08, len] : [len, 0.08, 0.05]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </RigidBody>
  );
}

/** A straw-hatted scarecrow on a pole, arms out, in the middle of the field. */
function Scarecrow() {
  const m = getWorldMaterials();
  return (
    <RigidBody type="fixed" colliders={false} position={[FARM.x, 0, FARM.z]} rotation={[0, 0.15, 0]}>
      <CylinderCollider args={[0.9, 0.3]} position={[0, 0.9, 0]} />
      <mesh position={[0, 0.85, 0]} material={m.woodDark} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 1.7, 8]} />
      </mesh>
      <mesh position={[0, 1.3, 0]} rotation={[0, 0, Math.PI / 2]} material={m.woodDark} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.5, 8]} />
      </mesh>
      {/* Patched shirt and sleeves */}
      <RoundedBox args={[0.55, 0.6, 0.3]} radius={0.1} position={[0, 1.15, 0]} castShadow>
        <meshStandardMaterial color="#c0533f" roughness={0.9} />
      </RoundedBox>
      <mesh position={[0.1, 1.2, 0.155]}>
        <planeGeometry args={[0.16, 0.16]} />
        <meshStandardMaterial color="#e9b949" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.48, 1.3, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 0.45, 10]} />
            <meshStandardMaterial color="#c0533f" roughness={0.9} />
          </mesh>
          {/* Straw poking out of the cuffs */}
          <mesh position={[s * 0.76, 1.3, 0]} rotation={[0, 0, (-s * Math.PI) / 2]}>
            <coneGeometry args={[0.1, 0.16, 7]} />
            <meshStandardMaterial color="#e3c26b" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.78, 0]}>
        <coneGeometry args={[0.24, 0.22, 9]} />
        <meshStandardMaterial color="#e3c26b" roughness={0.9} />
      </mesh>
      {/* Burlap head with button eyes and a stitched smile */}
      <mesh position={[0, 1.66, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color="#d8b98a" roughness={1} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.07, 1.7, 0.18]}>
          <sphereGeometry args={[0.03, 8, 6]} />
          <meshStandardMaterial color="#2b2230" />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 0.185]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.06, 0.012, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#2b2230" />
      </mesh>
      {/* Straw hat */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.03, 20]} />
        <meshStandardMaterial color="#e3c26b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.19, 0.2, 16]} />
        <meshStandardMaterial color="#e3c26b" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

/** A tractor wheel: black tyre with tread lugs and a yellow hub. Axle along z. */
function Wheel({ position, radius, width }: { position: [number, number, number]; radius: number; width: number }) {
  const lugs = Math.round(radius * 22);
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, width, 24]} />
        <meshStandardMaterial color="#2b2730" roughness={0.95} />
      </mesh>
      {Array.from({ length: lugs }, (_, i) => {
        const a = (i / lugs) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]} rotation={[0, 0, a]}>
            <boxGeometry args={[0.07, 0.1, width * 0.9]} />
            <meshStandardMaterial color="#2b2730" roughness={0.95} />
          </mesh>
        );
      })}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0, (s * width) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[radius * 0.55, radius * 0.55, 0.04, 18]} />
          <meshStandardMaterial color="#f2c94c" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** A little red tractor parked by the greenhouse: big rear wheels, open cab with a roof, exhaust stack. Front faces +x. */
function Tractor() {
  const red = '#d63d34';
  return (
    <RigidBody type="fixed" colliders={false} position={[TRACTOR.x, 0, TRACTOR.z]} rotation={[0, TRACTOR.rot, 0]}>
      <CuboidCollider args={[1.2, 0.95, 0.85]} position={[0.1, 0.95, 0]} />
      <Wheel position={[-0.55, 0.56, 0.6]} radius={0.56} width={0.34} />
      <Wheel position={[-0.55, 0.56, -0.6]} radius={0.56} width={0.34} />
      <Wheel position={[0.9, 0.32, 0.48]} radius={0.32} width={0.22} />
      <Wheel position={[0.9, 0.32, -0.48]} radius={0.32} width={0.22} />
      {/* Chassis and engine hood */}
      <RoundedBox args={[2.0, 0.34, 0.66]} radius={0.08} position={[0.15, 0.6, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={red} roughness={0.55} />
      </RoundedBox>
      <RoundedBox args={[1.05, 0.56, 0.62]} radius={0.12} position={[0.62, 1.0, 0]} castShadow>
        <meshStandardMaterial color={red} roughness={0.55} />
      </RoundedBox>
      {/* Grille and headlights */}
      <mesh position={[1.15, 0.95, 0]}>
        <boxGeometry args={[0.04, 0.36, 0.44]} />
        <meshStandardMaterial color="#3a3440" roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[1.13, 1.18, s * 0.2]}>
          <sphereGeometry args={[0.07, 12, 10]} />
          <meshStandardMaterial color="#fff6d8" emissive="#ffd98a" emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* Exhaust stack */}
      <mesh position={[0.85, 1.55, 0.2]} castShadow>
        <cylinderGeometry args={[0.045, 0.05, 0.6, 10]} />
        <meshStandardMaterial color="#3a3440" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Fenders over the rear wheels */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[1.0, 0.08, 0.4]} radius={0.03} position={[-0.55, 1.16, s * 0.6]} castShadow>
          <meshStandardMaterial color={red} roughness={0.55} />
        </RoundedBox>
      ))}
      {/* Seat, steering wheel */}
      <RoundedBox args={[0.34, 0.1, 0.4]} radius={0.04} position={[-0.6, 0.98, 0]}>
        <meshStandardMaterial color="#3a3440" roughness={0.8} />
      </RoundedBox>
      <RoundedBox args={[0.08, 0.36, 0.4]} radius={0.03} position={[-0.79, 1.18, 0]}>
        <meshStandardMaterial color="#3a3440" roughness={0.8} />
      </RoundedBox>
      <mesh position={[-0.12, 1.32, 0]} rotation={[0, Math.PI / 2, 0.9]}>
        <torusGeometry args={[0.13, 0.02, 8, 18]} />
        <meshStandardMaterial color="#3a3440" />
      </mesh>
      {/* Cab: four posts and a red roof */}
      {[
        [-1.0, 0.36],
        [-1.0, -0.36],
        [-0.12, 0.36],
        [-0.12, -0.36],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 1.5, z]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
          <meshStandardMaterial color="#3a3440" />
        </mesh>
      ))}
      <RoundedBox args={[1.1, 0.08, 0.95]} radius={0.03} position={[-0.56, 1.97, 0]} castShadow>
        <meshStandardMaterial color={red} roughness={0.55} />
      </RoundedBox>
    </RigidBody>
  );
}

/** The farm south of Mika's road: tilled soil in rows, crops, a fence and a scarecrow in the middle. */
export function Farm() {
  const { x, z, w, d } = FARM;
  const rows = Math.floor((d - 0.6) / 0.8);
  return (
    <>
      <RoundedBox args={[w, 0.08, d]} radius={0.03} position={[x, 0.04, z]} receiveShadow>
        <meshStandardMaterial color="#8a6544" roughness={1} />
      </RoundedBox>
      {Array.from({ length: rows }, (_, r) => (
        <RoundedBox key={r} args={[w - 0.4, 0.1, 0.42]} radius={0.04} position={[x, 0.1, z - d / 2 + 0.6 + r * 0.8]} receiveShadow>
          <meshStandardMaterial color="#6e4d33" roughness={1} />
        </RoundedBox>
      ))}
      <Crops />
      <Fence />
      <Scarecrow />
      <Tractor />
    </>
  );
}
