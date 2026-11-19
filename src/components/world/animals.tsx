'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { MeshStandardMaterial, type Group } from 'three';
import { PIECES } from '@/game/sim/content';
import { animalCanWalk, inPondWater, placementCenter } from '@/game/sim/farm-map';
import type { Animal, FarmState } from '@/game/sim/types';
import { animalPositions } from '@/game/engine/world-state';
import { useFarmState } from '@/game/state/farm-store';
import { useSession } from '@/game/state/session-store';

/**
 * The farm's chickens: little clay hens roaming wherever their fence lets them. Their wandering is
 * scenery (not part of the sim), but they only head for spots they can reach without crossing a
 * fence, gate or wall (`animalCanWalk`); now and then one goes for a swim in the pond, floating low
 * and paddling. Their positions feed the "Pet" prompt. Eggs waiting to be
 * collected sit at the coop door.
 */

const WHITE = new MeshStandardMaterial({ color: '#fbf6ee', roughness: 0.9 });
const RED = new MeshStandardMaterial({ color: '#d9473f', roughness: 0.8 });
const BEAK = new MeshStandardMaterial({ color: '#f2b84b', roughness: 0.7 });
const EYE = new MeshStandardMaterial({ color: '#2b2340', roughness: 0.5 });
const EGG = new MeshStandardMaterial({ color: '#f4e3c8', roughness: 0.6 });

/** How much room a hen keeps round the spot it heads for (m). */
const ROOM = 0.3;
/** How far a hen strolls at a time, and how far from its coop it will roam (m). */
const STROLL: [number, number] = [1.2, 5];
const ROAM = 10;
/** Chance a hen near a pond heads for a swim next (other strolls end on dry land). */
const SWIM = 0.2;
const RIPPLE = new MeshStandardMaterial({ color: '#e8f6f8', roughness: 0.4, transparent: true, opacity: 0.55 });

function Hen({ animal, home, farm }: { animal: Animal; home: [number, number]; farm: FarmState }) {
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
    /** 0 on land … 1 afloat. */
    swim: 0,
  });
  const legs = useRef<Group>(null);
  const ripple = useRef<Group>(null);
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
      // Pick a new spot anywhere it can walk to inside its fence (not too far from the coop), and
      // now and then one on a pond close by, for a swim.
      const ponds = farm.placements.filter((p) => p.piece === 'pond').map(placementCenter).filter(([px, pz]) => Math.hypot(px - home[0], pz - home[1]) < ROAM);
      const swim = ponds.length > 0 && Math.random() < SWIM;
      for (let tries = 0; tries < 16; tries++) {
        let tx: number;
        let tz: number;
        if (swim) {
          const [px, pz] = ponds[Math.floor(Math.random() * ponds.length)];
          const a = Math.random() * Math.PI * 2;
          tx = px + Math.cos(a) * Math.random() * 1.5;
          tz = pz + Math.sin(a) * Math.random() * 1.1;
        } else {
          const a = Math.random() * Math.PI * 2;
          const r = STROLL[0] + Math.random() * (STROLL[1] - STROLL[0]);
          tx = s.x + Math.cos(a) * r;
          tz = s.z + Math.sin(a) * r;
          if (Math.hypot(tx - home[0], tz - home[1]) > ROAM || inPondWater(farm, tx, tz, -0.35)) continue;
        }
        // Reachable, and a hen's width of room all round it (so it never presses into a fence).
        const roomy = [[ROOM, 0], [-ROOM, 0], [0, ROOM], [0, -ROOM]].every(([ox, oz]) => animalCanWalk(farm, tx, tz, tx + ox, tz + oz));
        if (roomy && animalCanWalk(farm, s.x, s.z, tx, tz)) {
          s.tx = tx;
          s.tz = tz;
          break;
        }
      }
      s.wait = 1 + Math.random() * 3;
    } else {
      // Paddling is slower than walking.
      const step = Math.min(d, (s.swim > 0.5 ? 0.55 : 0.9) * dt);
      s.x += (dx / d) * step;
      s.z += (dz / d) * step;
      s.rot = Math.atan2(dx, dz);
      moving = true;
    }
    animalPositions.set(animal.id, { x: s.x, z: s.z });
    // Afloat: ease down into the water (legs tucked away) and bob; on land, hop along.
    const afloat = inPondWater(farm, s.x, s.z, 0.15);
    s.swim += ((afloat ? 1 : 0) - s.swim) * (1 - Math.exp(-dt * 6));
    const t = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    const hop = moving && s.swim < 0.5 ? Math.abs(Math.sin(t * 14)) * 0.03 : 0;
    const bob = Math.sin(t * 2.4 + animal.id) * 0.012;
    g.position.set(s.x, hop * (1 - s.swim) + (bob - 0.13) * s.swim, s.z);
    g.rotation.y = s.rot;
    if (legs.current) legs.current.visible = s.swim < 0.5;
    if (ripple.current) {
      ripple.current.visible = s.swim > 0.5;
      ripple.current.scale.setScalar(1 + Math.sin(t * 3 + animal.id) * 0.08);
    }
    if (body.current) body.current.rotation.x = !moving && s.wait > 0 && s.swim < 0.5 ? Math.max(0, Math.sin(s.peck * 6)) * 0.5 : 0;
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
      <group ref={legs}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.05, 0.06, 0]} material={BEAK}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 5]} />
          </mesh>
        ))}
      </group>
      {/* A ring of ripples round a swimming hen, at the water's surface. */}
      <group ref={ripple} position={[0, 0.172, 0]} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={RIPPLE}>
          <ringGeometry args={[0.2, 0.25, 24]} />
        </mesh>
      </group>
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
        return coop ? <Hen key={a.id} animal={a} home={placementCenter(coop)} farm={farm} /> : null;
      })}
      <Eggs farm={farm} />
    </>
  );
}
