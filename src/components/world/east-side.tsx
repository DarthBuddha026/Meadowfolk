'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { MeshStandardMaterial, type Group, type Mesh } from 'three';
import { HOUSES, PLAYGROUND, STATUE, TOWN_HALL } from '@/game/data';
import { beachEdge, PATH_TOP, shoreAt } from '@/game/engine/terrain';
import { useClock } from '@/game/state/farm-store';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * The new places on the map: the town hall's sign, clock tower and flag (the building itself is
 * the last of HOUSES), the playground beside it, the statue in the forest clearing, and the beaches'
 * palms, parasols and odds and ends. Clay like everything else.
 */

const mat = (color: string, roughness = 0.85) => new MeshStandardMaterial({ color, roughness });
const PAINT = {
  red: mat('#d9674a'),
  yellow: mat('#f2cf6b'),
  blue: mat('#7fb3d5'),
  green: mat('#8fb07a'),
  white: mat('#fbf6ee'),
  ink: mat('#2b2340', 0.6),
  metal: mat('#9aa3ad', 0.4),
  stone: mat('#cfc8b4', 0.95),
  moss: mat('#7f9f55', 1),
  palm: mat('#b88a5a', 0.9),
  frond: mat('#5f9a45', 0.8),
  pink: mat('#e7a3a8'),
  clockRim: mat('#5c4a3a'),
  coconut: mat('#6b4a2e'),
  castle: mat('#e9d3a4'),
  star: mat('#e9a25a'),
  shell: mat('#fbe9e0'),
};

function Sign({ text, width }: { text: string; width: number }) {
  const m = getWorldMaterials();
  const tex = useCanvasTexture(
    512,
    110,
    (ctx, w, h) => {
      ctx.fillStyle = '#c98d57';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff4dc';
      ctx.font = 'bold 54px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 3, w - 30);
    },
    'east-sign-' + text,
  );
  return (
    <group>
      <RoundedBox args={[width, 0.42, 0.08]} radius={0.04} material={m.woodDark} castShadow />
      <mesh position={[0, 0, 0.046]}>
        <planeGeometry args={[width - 0.12, 0.32]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Town hall                                                           */
/* ------------------------------------------------------------------ */

/** The town hall's extras: a sign over the door, a clock tower on the roof telling the game's time, a flag. */
function TownHallExtras() {
  const plan = HOUSES[HOUSES.length - 1];
  const { w, d } = TOWN_HALL;
  const eave = 0.52 + 1.55 * 2;
  const hour = useRef<Group>(null);
  const minute = useRef<Group>(null);
  const flag = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = useClock.getState().minute; // since 6:00
    const total = 6 * 60 + m;
    if (hour.current) hour.current.rotation.z = -((total / 60) % 12) * (Math.PI / 6);
    if (minute.current) minute.current.rotation.z = -(total % 60) * (Math.PI / 30);
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.18;
  });
  const { wall, roof } = useMemo(() => ({ wall: mat(plan.wall, 0.95), roof: mat(plan.roof) }), [plan.wall, plan.roof]);
  return (
    <group position={[TOWN_HALL.x, 0, TOWN_HALL.z]} rotation={[0, TOWN_HALL.rot, 0]}>
      <group position={[0, 2.18, d / 2 + 0.09]}>
        <Sign text="TOWN HALL" width={2.3} />
      </group>
      {/* The clock tower astride the roof. */}
      <group position={[0, eave + 1.0, 0]}>
        <RoundedBox args={[1.4, 1.7, 1.4]} radius={0.06} position={[0, 0.85, 0]} material={wall} castShadow />
        <mesh position={[0, 2.25, 0]} rotation={[0, Math.PI / 4, 0]} material={roof} castShadow>
          <coneGeometry args={[1.15, 1.1, 4]} />
        </mesh>
        <mesh position={[0, 2.88, 0]} material={PAINT.yellow}>
          <sphereGeometry args={[0.1, 10, 8]} />
        </mesh>
        {[1, -1].map((s) => (
          <group key={s} position={[0, 0.95, s * 0.71]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
            <mesh material={PAINT.white}>
              <circleGeometry args={[0.48, 32]} />
            </mesh>
            <mesh position={[0, 0, -0.005]} material={PAINT.clockRim}>
              <circleGeometry args={[0.55, 32]} />
            </mesh>
            {Array.from({ length: 12 }).map((_, i) => (
              <mesh key={i} position={[Math.sin((i * Math.PI) / 6) * 0.39, Math.cos((i * Math.PI) / 6) * 0.39, 0.01]} material={PAINT.ink}>
                <circleGeometry args={[i % 3 ? 0.025 : 0.045, 8]} />
              </mesh>
            ))}
            <group ref={s > 0 ? hour : undefined} position={[0, 0, 0.02]}>
              <mesh position={[0, 0.12, 0]} material={PAINT.ink}>
                <planeGeometry args={[0.06, 0.26]} />
              </mesh>
            </group>
            <group ref={s > 0 ? minute : undefined} position={[0, 0, 0.025]}>
              <mesh position={[0, 0.18, 0]} material={PAINT.ink}>
                <planeGeometry args={[0.04, 0.36]} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      {/* The flag out front, and flower tubs either side of the door. */}
      <group position={[w / 2 - 0.6, 0, d / 2 + 2.2]}>
        <mesh position={[0, 2.25, 0]} material={PAINT.metal} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 4.5, 10]} />
        </mesh>
        <mesh ref={flag} position={[0, 4.05, 0]}>
          <boxGeometry args={[0.02, 0.6, 0.9]} />
          <meshStandardMaterial color="#d9674a" roughness={0.8} />
        </mesh>
      </group>
      {[-1.15, 1.15].map((x) => (
        <group key={x} position={[x, 0, d / 2 + 0.55]}>
          <RoundedBox args={[0.6, 0.45, 0.45]} radius={0.06} position={[0, 0.22, 0]} material={getWorldMaterials().wood} castShadow />
          {[-0.15, 0.15, 0].map((dx, i) => (
            <mesh key={i} position={[dx, 0.52 + (i === 2 ? 0.08 : 0), i === 2 ? 0 : 0.05]} material={[PAINT.red, PAINT.yellow, PAINT.white][i]}>
              <sphereGeometry args={[0.11, 10, 8]} />
            </mesh>
          ))}
        </group>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[2.3, 0.12]} position={[w / 2 - 0.6, 2.3, d / 2 + 2.2]} />
      </RigidBody>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Playground                                                          */
/* ------------------------------------------------------------------ */

function Playground() {
  const swings = useRef<(Group | null)[]>([]);
  const seesaw = useRef<Group>(null);
  const round = useRef<Group>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    swings.current.forEach((g, i) => g && (g.rotation.x = Math.sin(t * 1.6 + i * 1.3) * 0.25));
    if (seesaw.current) seesaw.current.rotation.z = Math.sin(t * 0.9) * 0.2;
    if (round.current) round.current.rotation.y += dt * 0.35;
  });
  const m = getWorldMaterials();
  const { x, z } = PLAYGROUND;
  return (
    <group position={[x, PATH_TOP, z]}>
      {/* Swings: two A-frames, a top bar, two seats on chains. */}
      <group position={[-1.6, 0, -1.8]}>
        {[-1.5, 1.5].map((sx) => (
          <group key={sx} position={[sx, 0, 0]}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[0, 1.1, s * 0.45]} rotation={[s * 0.38, 0, 0]} material={PAINT.red} castShadow>
                <cylinderGeometry args={[0.06, 0.06, 2.4, 8]} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh position={[0, 2.2, 0]} rotation={[0, 0, Math.PI / 2]} material={PAINT.red} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 3.2, 10]} />
        </mesh>
        {[-0.65, 0.65].map((sx, i) => (
          <group key={sx} ref={(g) => void (swings.current[i] = g)} position={[sx, 2.2, 0]}>
            {[-0.2, 0.2].map((cx) => (
              <mesh key={cx} position={[cx, -0.75, 0]} material={PAINT.metal}>
                <cylinderGeometry args={[0.012, 0.012, 1.5, 6]} />
              </mesh>
            ))}
            <RoundedBox args={[0.5, 0.06, 0.24]} radius={0.02} position={[0, -1.5, 0]} material={[PAINT.yellow, PAINT.blue][i]} castShadow />
          </group>
        ))}
      </group>
      {/* Slide: a ladder up to a little platform, and a chute down. */}
      <group position={[2.4, 0, -1.2]}>
        {[-0.35, 0.35].map((sx) => (
          <group key={sx}>
            <mesh position={[sx, 0.7, -0.5]} material={PAINT.blue} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.4, 8]} />
            </mesh>
            <mesh position={[sx, 0.7, 0.1]} material={PAINT.blue} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.4, 8]} />
            </mesh>
          </group>
        ))}
        {[0.3, 0.65, 1.0].map((y) => (
          <mesh key={y} position={[0, y, -0.5]} rotation={[0, 0, Math.PI / 2]} material={PAINT.blue}>
            <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
          </mesh>
        ))}
        <RoundedBox args={[0.8, 0.08, 0.7]} radius={0.03} position={[0, 1.4, -0.2]} material={PAINT.yellow} castShadow />
        <group position={[0, 1.4, 0.15]} rotation={[0.62, 0, 0]}>
          <RoundedBox args={[0.6, 0.06, 2.1]} radius={0.03} position={[0, -0.03, 1.05]} material={PAINT.red} castShadow />
          {[-1, 1].map((s) => (
            <RoundedBox key={s} args={[0.05, 0.16, 2.1]} radius={0.02} position={[s * 0.3, 0.05, 1.05]} material={PAINT.red} />
          ))}
        </group>
      </group>
      {/* Seesaw. */}
      <group position={[-1.9, 0, 1.6]}>
        <mesh position={[0, 0.22, 0]} material={PAINT.green} castShadow>
          <coneGeometry args={[0.22, 0.44, 4]} />
        </mesh>
        <group ref={seesaw} position={[0, 0.45, 0]}>
          <RoundedBox args={[2.6, 0.07, 0.3]} radius={0.03} material={m.wood} castShadow />
          {[-1.1, 1.1].map((sx) => (
            <mesh key={sx} position={[sx, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]} material={PAINT.yellow}>
              <torusGeometry args={[0.1, 0.025, 6, 12, Math.PI]} />
            </mesh>
          ))}
        </group>
      </group>
      {/* A roundabout turning slowly. */}
      <group position={[1.8, 0, 2.1]}>
        <mesh position={[0, 0.12, 0]} material={PAINT.metal}>
          <cylinderGeometry args={[0.12, 0.16, 0.24, 10]} />
        </mesh>
        <group ref={round} position={[0, 0.26, 0]}>
          <mesh material={PAINT.yellow} castShadow receiveShadow>
            <cylinderGeometry args={[0.95, 0.95, 0.08, 24]} />
          </mesh>
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2;
            return (
              <group key={i} rotation={[0, a, 0]}>
                <mesh position={[0.55, 0.3, 0]} material={PAINT.red}>
                  <cylinderGeometry args={[0.03, 0.03, 0.55, 6]} />
                </mesh>
                <mesh position={[0.3, 0.56, 0]} rotation={[0, 0, Math.PI / 2]} material={PAINT.red}>
                  <cylinderGeometry args={[0.03, 0.03, 0.55, 6]} />
                </mesh>
              </group>
            );
          })}
        </group>
      </group>
      {/* A bucket and spade left in the sand. */}
      <mesh position={[0.2, 0.12, 0.3]} material={PAINT.blue}>
        <cylinderGeometry args={[0.13, 0.1, 0.22, 12]} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1.7, 1.1, 0.5]} position={[-1.6, 1.1, -1.8]} />
        <CuboidCollider args={[0.45, 0.8, 1.5]} position={[2.4, 0.8, 0.2]} />
        <CuboidCollider args={[1.3, 0.35, 0.2]} position={[-1.9, 0.35, 1.6]} />
        <CylinderCollider args={[0.3, 0.95]} position={[1.8, 0.3, 2.1]} />
      </RigidBody>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The statue in the forest                                            */
/* ------------------------------------------------------------------ */

/** A weathered stone statue of the first farmer, lantern raised, on a stepped plinth ringed with flowers. */
function Statue() {
  const m = getWorldMaterials();
  const flowers = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return { x: Math.cos(a) * 2.25, z: Math.sin(a) * 2.25, c: [PAINT.yellow, PAINT.white, PAINT.pink][i % 3] };
      }),
    [],
  );
  return (
    <group position={[STATUE.x, PATH_TOP, STATUE.z]}>
      <RoundedBox args={[2.6, 0.35, 2.6]} radius={0.08} position={[0, 0.17, 0]} material={PAINT.stone} castShadow receiveShadow />
      <RoundedBox args={[1.7, 0.9, 1.7]} radius={0.1} position={[0, 0.8, 0]} material={PAINT.stone} castShadow receiveShadow />
      <group position={[0, 1.25, 0.86]}>
        <Sign text="THE FIRST FARMERS" width={1.5} />
      </group>
      {/* The figure: robe, body, head with a wide hat, one arm raising a lantern, a sheaf in the other. */}
      <group position={[0, 1.25, 0]}>
        <mesh position={[0, 0.65, 0]} material={PAINT.stone} castShadow>
          <coneGeometry args={[0.6, 1.3, 16]} />
        </mesh>
        <mesh position={[0, 1.45, 0]} material={PAINT.stone} castShadow>
          <sphereGeometry args={[0.4, 16, 12]} />
        </mesh>
        <mesh position={[0, 2.05, 0]} material={PAINT.stone} castShadow>
          <sphereGeometry args={[0.32, 16, 12]} />
        </mesh>
        <mesh position={[0, 2.3, 0]} material={PAINT.stone} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.06, 20]} />
        </mesh>
        <mesh position={[0, 2.45, 0]} material={PAINT.stone} castShadow>
          <coneGeometry args={[0.3, 0.32, 16]} />
        </mesh>
        <mesh position={[0.42, 1.95, 0.05]} rotation={[0, 0, -0.35]} material={PAINT.stone} castShadow>
          <capsuleGeometry args={[0.09, 0.6, 4, 8]} />
        </mesh>
        <RoundedBox args={[0.24, 0.3, 0.24]} radius={0.05} position={[0.58, 2.42, 0.05]} material={m.lanternGlow} />
        <mesh position={[0.58, 2.62, 0.05]} material={PAINT.stone}>
          <coneGeometry args={[0.2, 0.14, 4]} />
        </mesh>
        <mesh position={[-0.42, 1.3, 0.25]} rotation={[0.3, 0, 0.25]} material={PAINT.stone} castShadow>
          <cylinderGeometry args={[0.16, 0.08, 0.8, 10]} />
        </mesh>
        {/* Moss in the folds. */}
        {[
          [0.35, 0.3, 0.42, 0.16],
          [-0.3, 0.55, 0.45, 0.13],
          [0.15, 2.32, -0.4, 0.12],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} scale={[1, 0.5, 1]} material={PAINT.moss}>
            <sphereGeometry args={[r, 10, 8]} />
          </mesh>
        ))}
      </group>
      {flowers.map((f, i) => (
        <mesh key={i} position={[f.x, 0.12, f.z]} material={f.c}>
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1.3, 1.5, 1.3]} position={[0, 1.5, 0]} />
      </RigidBody>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The beaches                                                         */
/* ------------------------------------------------------------------ */

function Palm({ x, z, lean, s }: { x: number; z: number; lean: number; s: number }) {
  const segs = 7;
  return (
    <group position={[x, 0, z]} rotation={[0, lean, 0]} scale={s}>
      {Array.from({ length: segs }).map((_, i) => {
        const t = i / segs;
        return (
          <mesh key={i} position={[t * t * 0.9, 0.25 + i * 0.5, 0]} rotation={[0, 0, -t * 0.35]} material={PAINT.palm} castShadow>
            <cylinderGeometry args={[0.17 - t * 0.05, 0.2 - t * 0.05, 0.52, 10]} />
          </mesh>
        );
      })}
      <group position={[0.85, 3.6, 0]}>
        {Array.from({ length: 8 }).map((_, i) => (
          <group key={i} rotation={[0, (i / 8) * Math.PI * 2, 0]}>
            <mesh position={[0.75, -0.18, 0]} rotation={[0, 0, -0.45]} scale={[0.95, 0.06, 0.24]} material={PAINT.frond} castShadow>
              <sphereGeometry args={[1, 12, 8]} />
            </mesh>
          </group>
        ))}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.16, -0.18, Math.sin(i * 2.1) * 0.16]} material={PAINT.coconut}>
            <sphereGeometry args={[0.12, 10, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Parasol({ x, z, color }: { x: number; z: number; color: MeshStandardMaterial }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.1, 0]} material={PAINT.white}>
        <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
      </mesh>
      <mesh position={[0, 2.05, 0]} material={color} castShadow>
        <coneGeometry args={[1.2, 0.5, 12]} />
      </mesh>
      <RoundedBox args={[0.9, 0.03, 1.7]} radius={0.01} position={[0.2, 0.02, 0.9]} material={color === PAINT.red ? PAINT.yellow : PAINT.red} receiveShadow />
    </group>
  );
}

function Beaches() {
  const items = useMemo(() => {
    const palms: { x: number; z: number; lean: number; s: number }[] = [];
    const xs = [-21, -15.5, -9, 6.5, 13, 19.5, 33, 39.5, 48, 57, 63.5, 71];
    xs.forEach((x, i) => {
      const z = beachEdge(x) + 1.4 + (i % 3) * 0.8;
      palms.push({ x, z, lean: (i * 1.7) % (Math.PI * 2), s: 0.9 + (i % 4) * 0.08 });
    });
    const parasols: { x: number; z: number; c: MeshStandardMaterial }[] = [
      { x: -5, z: shoreAt(-5) - 6.2, c: PAINT.red },
      { x: 10, z: shoreAt(10) - 5.6, c: PAINT.blue },
      { x: 44, z: shoreAt(44) - 6, c: PAINT.yellow },
      { x: 60, z: shoreAt(60) - 5.4, c: PAINT.red },
    ];
    const rocks = [-18, -2, 16, 36, 52, 68].map((x, i) => ({ x, z: shoreAt(x) - 1.6 - (i % 2) * 0.8, s: 0.5 + (i % 3) * 0.2 }));
    const shells = Array.from({ length: 16 }, (_, i) => {
      const x = -20 + i * 6.1;
      return { x, z: shoreAt(x) - 2.5 - ((i * 7) % 5) * 0.4, star: i % 3 === 0 };
    }).filter((s) => Math.abs(s.x - 27) > 4);
    return { palms, parasols, rocks, shells };
  }, []);
  const m = getWorldMaterials();
  return (
    <>
      {items.palms.map((p, i) => (
        <Palm key={i} {...p} />
      ))}
      {items.parasols.map((p, i) => (
        <Parasol key={i} x={p.x} z={p.z} color={p.c} />
      ))}
      {items.rocks.map((r, i) => (
        <mesh key={i} position={[r.x, 0.08, r.z]} scale={[r.s * 1.2, r.s * 0.6, r.s]} material={m.stone} castShadow receiveShadow>
          <sphereGeometry args={[0.6, 12, 8]} />
        </mesh>
      ))}
      {items.shells.map((s, i) =>
        s.star ? (
          <mesh key={i} position={[s.x, 0.03, s.z]} rotation={[-Math.PI / 2, 0, i]} material={PAINT.star}>
            <circleGeometry args={[0.16, 5]} />
          </mesh>
        ) : (
          <mesh key={i} position={[s.x, 0.04, s.z]} scale={[1, 0.45, 0.8]} material={PAINT.shell}>
            <sphereGeometry args={[0.1, 10, 6]} />
          </mesh>
        ),
      )}
      {/* A sandcastle on the west beach. */}
      <group position={[2.5, 0, shoreAt(2.5) - 4.2]}>
        <RoundedBox args={[1.0, 0.35, 1.0]} radius={0.06} position={[0, 0.17, 0]} material={PAINT.castle} castShadow />
        {[
          [-0.4, -0.4],
          [0.4, -0.4],
          [-0.4, 0.4],
          [0.4, 0.4],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.5, z]} material={PAINT.castle} castShadow>
            <cylinderGeometry args={[0.15, 0.17, 0.4, 10]} />
          </mesh>
        ))}
        <mesh position={[0.4, 0.95, -0.4]} material={PAINT.red}>
          <boxGeometry args={[0.02, 0.14, 0.2]} />
        </mesh>
      </group>
      <RigidBody type="fixed" colliders={false}>
        {items.palms.map((p, i) => (
          <CylinderCollider key={i} args={[1.5, 0.22]} position={[p.x, 1.5, p.z]} />
        ))}
        {items.parasols.map((p, i) => (
          <CylinderCollider key={`p${i}`} args={[1, 0.08]} position={[p.x, 1, p.z]} />
        ))}
      </RigidBody>
    </>
  );
}

export function EastSide() {
  return (
    <>
      <TownHallExtras />
      <Playground />
      <Statue />
      <Beaches />
    </>
  );
}
