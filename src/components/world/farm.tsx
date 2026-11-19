'use client';

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { BoxGeometry, Color, CylinderGeometry, InstancedMesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three';
import { FARM, HOUSES, TRACTOR, VINE_ROWS } from '@/game/data';
import { getWorldMaterials } from './materials';
import { Barrel } from './tavern';
import { useCanvasTexture } from './use-canvas-texture';

const dummy = new Object3D();
/** Width of the gate in the north fence, and of the aisle that runs from it to the scarecrow. */
const AISLE = 1.4;

/** A steady pseudo-random number in [0, 1) for seed `n` (the vineyard looks the same every visit). */
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const LEAVES = ['#5f9a3c', '#6fae45', '#4f8a35', '#7cb84e'];
const GRAPES = ['#6b3a8c', '#7d4aa0', '#5a2e78', '#874fa8'];
/** Where each vine row runs, either side of the aisle: [from x, to x]. */
const ROW_SPANS: [number, number][] = [
  [FARM.x - FARM.w / 2 + 0.7, FARM.x - AISLE / 2 - 0.35],
  [FARM.x + AISLE / 2 + 0.35, FARM.x + FARM.w / 2 - 0.7],
];

/**
 * Rows of grapevines on trellises (VINE_ROWS) either side of the aisle: posts, two wires, gnarled
 * trunks, a leafy canopy along the wires and purple bunches hanging under it. All instanced.
 */
function Vines() {
  const meshes = useMemo(() => {
    const posts: [number, number][] = [];
    const wires: [number, number, number][] = [];
    const vines: [number, number, number][] = [];
    VINE_ROWS.forEach((dz, r) => {
      const z = FARM.z + dz;
      ROW_SPANS.forEach(([a, b], side) => {
        const len = b - a;
        const n = Math.max(1, Math.round(len / 1.8));
        for (let k = 0; k <= n; k++) posts.push([a + (len * k) / n, z]);
        wires.push([(a + b) / 2, z, len]);
        const count = Math.round(len / 0.6);
        for (let k = 0; k < count; k++) vines.push([a + (len * (k + 0.5)) / count, z, r * 97 + side * 41 + k]);
      });
    });
    const color = new Color();
    const make = (
      geo: BoxGeometry | SphereGeometry | CylinderGeometry,
      material: MeshStandardMaterial,
      count: number,
      place: (i: number) => string | void
    ) => {
      const mesh = new InstancedMesh(geo, material, count);
      for (let i = 0; i < count; i++) {
        const tint = place(i);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (tint) mesh.setColorAt(i, color.set(tint));
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      return mesh;
    };
    const box = new BoxGeometry(1, 1, 1);
    const ball = new SphereGeometry(1, 10, 8);
    const grape = new SphereGeometry(1, 8, 6);
    const stem = new CylinderGeometry(0.7, 1, 1, 7);
    const tinted = () => new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
    const m = getWorldMaterials();
    // Each bunch: 3 grapes on top, 3 under them, 1 at the tip.
    const BUNCH: [number, number, number][] = [
      [-0.065, 0, 0],
      [0.065, 0, 0],
      [0, 0.01, 0.065],
      [-0.04, -0.085, 0.025],
      [0.04, -0.085, 0.025],
      [0, -0.085, -0.04],
      [0, -0.16, 0.01],
    ];
    return [
      make(box, m.woodDark, posts.length, (i) => {
        const [x, z] = posts[i];
        dummy.position.set(x, 0.65, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.09, 1.3, 0.09);
      }),
      make(box, new MeshStandardMaterial({ color: '#8d8478', roughness: 0.6 }), wires.length * 2, (i) => {
        const [x, z, len] = wires[i >> 1];
        dummy.position.set(x, i & 1 ? 1.1 : 0.74, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(len, 0.02, 0.02);
      }),
      make(stem, new MeshStandardMaterial({ color: '#7a5236', roughness: 0.95 }), vines.length, (i) => {
        const [x, z, seed] = vines[i];
        dummy.position.set(x, 0.4, z);
        dummy.rotation.set((hash(seed) - 0.5) * 0.25, 0, (hash(seed + 1) - 0.5) * 0.3);
        dummy.scale.set(0.05, 0.8, 0.05);
      }),
      // The canopy: four leafy blobs per vine along the wires.
      make(ball, tinted(), vines.length * 4, (i) => {
        const [x, z, seed] = vines[i >> 2];
        const k = i & 3;
        const h = hash(seed * 4 + k);
        dummy.position.set(x - 0.24 + k * 0.16, 0.98 + (k & 1) * 0.2 + h * 0.08, z + (h - 0.5) * 0.1);
        dummy.rotation.set(0, h * 3, 0);
        const sc = 0.82 + h * 0.3;
        dummy.scale.set(0.21 * sc, 0.16 * sc, 0.17 * sc);
        return LEAVES[Math.floor(hash(seed + k * 7) * LEAVES.length)];
      }),
      // Two bunches per vine, one hanging on each side of the row.
      make(grape, tinted(), vines.length * 2 * BUNCH.length, (i) => {
        const b = Math.floor(i / BUNCH.length);
        const [x, z, seed] = vines[b >> 1];
        const side = b & 1 ? 1 : -1;
        const [gx, gy, gz] = BUNCH[i % BUNCH.length];
        const bx = x + (hash(seed + 3 + side) - 0.5) * 0.3;
        dummy.position.set(bx + gx, 0.78 + gy, z + side * 0.2 + gz * side);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.056);
        return GRAPES[Math.floor(hash(seed * 2 + side) * GRAPES.length)];
      }),
    ];
  }, []);
  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      {/* You walk the vineyard between the rows, not through them. */}
      <RigidBody type="fixed" colliders={false}>
        {VINE_ROWS.flatMap((dz) =>
          ROW_SPANS.map(([a, b]) => <CuboidCollider key={`${dz}:${a}`} args={[(b - a) / 2, 0.6, 0.14]} position={[(a + b) / 2, 0.6, FARM.z + dz]} />)
        )}
      </RigidBody>
    </>
  );
}

/**
 * Round the vineyard's house (the third of HOUSES, door facing the field road): a rack of barrels
 * on its north side, two more standing by the door and a crate of picked grapes on the other side.
 */
function VineyardHouse() {
  const m = getWorldMaterials();
  const h = HOUSES[2];
  const grapes = useMemo(() => {
    const list: [number, number, number, string][] = [];
    for (let i = 0; i < 14; i++) list.push([-0.17 + (i % 5) * 0.085, 0.27 + Math.floor(i / 10) * 0.05, -0.08 + (Math.floor(i / 5) % 2) * 0.12, GRAPES[i % GRAPES.length]]);
    return list;
  }, []);
  return (
    <RigidBody type="fixed" colliders={false} position={[h.x, 0, h.z]} rotation={[0, h.rot, 0]}>
      {/* Barrels lying on a cradle, two below and one on top, round ends to the road. */}
      <group position={[h.w / 2 + 0.5, 0, 0.75]}>
        <CuboidCollider args={[0.42, 0.5, 0.7]} position={[0, 0.5, 0]} />
        <mesh position={[0, 0.06, 0]} material={m.woodDark} castShadow receiveShadow>
          <boxGeometry args={[0.7, 0.12, 1.35]} />
        </mesh>
        <Barrel position={[0, 0.4, -0.33]} radius={0.28} height={0.62} lying />
        <Barrel position={[0, 0.4, 0.33]} radius={0.28} height={0.62} lying />
        <Barrel position={[0, 0.88, 0]} radius={0.28} height={0.62} lying />
      </group>
      {/* Two barrels standing under the window left of the door, toward the vines. */}
      {[
        [-1.35, h.d / 2 + 0.4],
        [-1.95, h.d / 2 + 0.5],
      ].map(([bx, bz]) => (
        <group key={bx}>
          <CuboidCollider args={[0.28, 0.32, 0.28]} position={[bx, 0.32, bz]} />
          <Barrel position={[bx, 0.32, bz]} radius={0.27} height={0.64} />
        </group>
      ))}
      {/* A crate of the harvest by the door. */}
      <group position={[1.55, 0, h.d / 2 + 0.42]}>
        <CuboidCollider args={[0.28, 0.18, 0.2]} position={[0, 0.18, 0]} />
        <RoundedBox args={[0.52, 0.28, 0.36]} radius={0.03} position={[0, 0.14, 0]} material={m.wood} castShadow receiveShadow />
        {grapes.map(([x, y, z, c], i) => (
          <mesh key={i} position={[x, y, z]} scale={0.05}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color={c} roughness={0.5} />
          </mesh>
        ))}
      </group>
    </RigidBody>
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

/**
 * The vineyard's name board, standing on two posts beside its house at the end of the field road and
 * facing south, so the follow camera reads it (the house's own shopfront board faces east, edge-on).
 */
const VINEYARD_SIGN = { x: -15.3, z: 8.4 };

function VineyardSign() {
  const m = getWorldMaterials();
  const art = useCanvasTexture(
    640,
    170,
    (ctx, w, h) => {
      ctx.fillStyle = '#c98d57';
      ctx.fillRect(0, 0, w, h);
      // A bunch of grapes either side of the name.
      for (const cx of [62, w - 62]) {
        ctx.fillStyle = '#6fae45';
        ctx.beginPath();
        ctx.ellipse(cx + 14, 40, 22, 11, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7d4aa0';
        for (const [gx, gy] of [
          [-18, 66],
          [0, 66],
          [18, 66],
          [-9, 90],
          [9, 90],
          [0, 114],
        ]) {
          ctx.beginPath();
          ctx.arc(cx + gx, gy, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#fff4dc';
      ctx.font = 'bold 84px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('VINEYARD', w / 2, h / 2 + 4, w - 170);
    },
    'vineyard-sign'
  );
  return (
    <RigidBody type="fixed" colliders={false} position={[VINEYARD_SIGN.x, 0, VINEYARD_SIGN.z]}>
      <CuboidCollider args={[0.95, 0.7, 0.1]} position={[0, 0.7, 0]} />
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.85, 0.75, 0]} material={m.woodDark} castShadow>
          <boxGeometry args={[0.12, 1.5, 0.12]} />
        </mesh>
      ))}
      <RoundedBox args={[1.9, 0.56, 0.08]} radius={0.04} position={[0, 1.2, 0]} material={m.woodDark} castShadow />
      <mesh position={[0, 1.2, 0.045]}>
        <planeGeometry args={[1.78, 0.47]} />
        <meshStandardMaterial map={art} roughness={0.8} />
      </mesh>
      {/* A vine curling up the left post. */}
      {[0.35, 0.6, 0.85].map((y, i) => (
        <mesh key={y} position={[-0.85 + (i % 2 ? 0.08 : -0.08), y, 0.06]} scale={[0.13, 0.1, 0.1]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={LEAVES[i]} roughness={0.85} />
        </mesh>
      ))}
    </RigidBody>
  );
}

/** The vineyard south of the field road: soil, rows of grapevines, a fence and a scarecrow in the middle; and its house's barrels. */
export function Farm() {
  const { x, z, w, d } = FARM;
  return (
    <>
      <RoundedBox args={[w, 0.08, d]} radius={0.03} position={[x, 0.04, z]} receiveShadow>
        <meshStandardMaterial color="#8a6544" roughness={1} />
      </RoundedBox>
      {/* A grassy strip down each row of vines, bare soil between them */}
      {VINE_ROWS.map((dz) => (
        <RoundedBox key={dz} args={[w - 0.8, 0.1, 0.5]} radius={0.04} position={[x, 0.09, z + dz]} receiveShadow>
          <meshStandardMaterial color="#7f9a4a" roughness={1} />
        </RoundedBox>
      ))}
      <Vines />
      <VineyardHouse />
      <VineyardSign />
      <Fence />
      <Scarecrow />
      <Tractor />
    </>
  );
}
