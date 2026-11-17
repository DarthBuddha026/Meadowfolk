'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { MeshStandardMaterial, type Group } from 'three';
import { PIECES } from '@/game/sim/content';
import { placementCenter } from '@/game/sim/farm-map';
import type { Animal, FarmState } from '@/game/sim/types';
import { animalPositions } from '@/game/engine/world-state';
import { useFarmState } from '@/game/state/farm-store';
import { useSession } from '@/game/state/session-store';

/**
 * The farm's chickens: little clay hens pottering about in front of their coop. Their wandering is
 * scenery (not part of the sim); their positions feed the "Pet" prompt. Eggs waiting to be
 * collected sit at the coop door.
 */

const WHITE = new MeshStandardMaterial({ color: '#fbf6ee', roughness: 0.9 });
const RED = new MeshStandardMaterial({ color: '#d9473f', roughness: 0.8 });
const BEAK = new MeshStandardMaterial({ color: '#f2b84b', roughness: 0.7 });
const EYE = new MeshStandardMaterial({ color: '#2b2340', roughness: 0.5 });
const EGG = new MeshStandardMaterial({ color: '#f4e3c8', roughness: 0.6 });

function Hen({ animal, home }: { animal: Animal; home: [number, number] }) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const st = useRef({
    x: home[0] + ((animal.id * 37) % 7) / 7 - 0.5,
    z: home[1] + 1.6,
    tx: home[0],
    tz: home[1] + 1.8,
    wait: 0,
    rot: 0,
    peck: 0,
  });
  useEffect(() => () => void animalPositions.delete(animal.id), [animal.id]);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = st.current;
    const dx = s.tx - s.x;
    const dz = s.tz - s.z;
    const d = Math.hypot(dx, dz);
    let moving = false;
    if (s.wait > 0) {
      s.wait -= dt;
      s.peck += dt;
    } else if (d < 0.05) {
      // Pick a new spot in the yard in front of the coop.
      const a = Math.random() * Math.PI - Math.PI / 2;
      const r = 1.3 + Math.random() * 1.6;
      s.tx = home[0] + Math.sin(a) * r;
      s.tz = home[1] + 1.2 + Math.cos(a) * r * 0.7;
      s.wait = 1 + Math.random() * 3;
    } else {
      const step = Math.min(d, 0.9 * dt);
      s.x += (dx / d) * step;
      s.z += (dz / d) * step;
      s.rot = Math.atan2(dx, dz);
      moving = true;
    }
    animalPositions.set(animal.id, { x: s.x, z: s.z });
    const g = group.current;
    if (!g) return;
    g.position.set(s.x, moving ? Math.abs(Math.sin(state.clock.elapsedTime * 14)) * 0.03 : 0, s.z);
    g.rotation.y = s.rot;
    if (body.current) body.current.rotation.x = !moving && s.wait > 0 ? Math.max(0, Math.sin(s.peck * 6)) * 0.5 : 0;
  });
  const showTag = useSession((x) => x.nearby?.id === 'animal:' + animal.id);
  return (
    <group ref={group}>
      <group ref={body} position={[0, 0.12, 0]}>
        <mesh position={[0, 0.12, 0]} scale={[0.16, 0.14, 0.2]} material={WHITE} castShadow>
          <sphereGeometry args={[1, 14, 10]} />
        </mesh>
        <mesh position={[0, 0.2, -0.17]} rotation={[0.6, 0, 0]} scale={[0.08, 0.1, 0.05]} material={WHITE} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        <group position={[0, 0.3, 0.13]}>
          <mesh scale={0.1} material={WHITE} castShadow>
            <sphereGeometry args={[1, 12, 10]} />
          </mesh>
          <mesh position={[0, 0.1, 0]} scale={[0.025, 0.05, 0.06]} material={RED}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
          <mesh position={[0, -0.01, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={BEAK}>
            <coneGeometry args={[0.03, 0.06, 6]} />
          </mesh>
          <mesh position={[0, -0.06, 0.08]} scale={[0.02, 0.035, 0.02]} material={RED}>
            <sphereGeometry args={[1, 6, 6]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.06, 0.02, 0.07]} scale={0.014} material={EYE}>
              <sphereGeometry args={[1, 6, 6]} />
            </mesh>
          ))}
        </group>
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.05, 0.06, 0]} material={BEAK}>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 5]} />
        </mesh>
      ))}
      {showTag && (
        <Html position={[0, 0.7, 0]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="name-tag">
            {animal.name} {'💛'.repeat(Math.max(1, Math.round(animal.happiness / 34)))}
          </div>
        </Html>
      )}
    </group>
  );
}

function Eggs({ farm }: { farm: FarmState }) {
  return (
    <>
      {Object.entries(farm.produce).map(([coopId, bag]) => {
        const coop = farm.placements.find((p) => p.id === Number(coopId));
        if (!coop) return null;
        const [x, z] = placementCenter(coop);
        const n = Math.min(6, Object.values(bag).reduce((s, v) => s + v, 0));
        return Array.from({ length: n }, (_, i) => (
          <mesh key={coopId + '-' + i} position={[x - 0.3 + (i % 3) * 0.14, 0.07, z + 0.95 + Math.floor(i / 3) * 0.12]} scale={[0.055, 0.07, 0.055]} material={EGG} castShadow>
            <sphereGeometry args={[1, 10, 8]} />
          </mesh>
        ));
      })}
    </>
  );
}

export function Animals() {
  const farm = useFarmState();
  if (!farm) return null;
  return (
    <>
      {farm.animals.map((a) => {
        const coop = farm.placements.find((p) => p.id === a.home && PIECES[p.piece].use === 'coop');
        return coop ? <Hen key={a.id} animal={a} home={placementCenter(coop)} /> : null;
      })}
      <Eggs farm={farm} />
    </>
  );
}
