'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, RoundedBox } from '@react-three/drei';
import { Object3D, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial } from 'three';
import { DOORS, getReflection, isMissionOpen, MISSIONS, type Vec3 } from '@/game/data';
import { getFocusTarget, isInteractable } from '@/game/state/mission-director';
import { isDevHero, useProfile } from '@/game/state/profile-store';
import { useSession } from '@/game/state/session-store';
import { useMissionContext, useMissionPhase, useMissionScript } from '@/game/state/use-mission';

/** TRIOE Blue, the TRIOE board's colour. */
const TRIOE_BLUE = '#1d5fc4';

/** Floating diamond above an interactable, in TRIOE Blue — bigger and brighter when it's the next step. */
function Marker({ position, focus, near }: { position: Vec3; focus: boolean; near: boolean }) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (group.current) {
      group.current.position.y = position[1] + (focus ? 2.05 : 1.85) + Math.sin(t * 2.4) * 0.1;
      group.current.rotation.y += dt * 1.6;
    }
    if (ring.current) ring.current.scale.setScalar(1 + Math.sin(t * 5) * 0.05);
  });
  return (
    <>
      <group ref={group} position={[position[0], position[1] + 1.9, position[2]]}>
        <mesh scale={[1, 1.5, 1]}>
          <octahedronGeometry args={[focus ? 0.17 : 0.11, 0]} />
          <meshStandardMaterial
            color={TRIOE_BLUE}
            emissive={TRIOE_BLUE}
            emissiveIntensity={focus ? 1.6 : 0.8}
            flatShading
          />
        </mesh>
      </group>
      {near && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[position[0], 0.05, position[2]]}>
          <ringGeometry args={[0.7, 0.82, 40]} />
          <meshBasicMaterial color={TRIOE_BLUE} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

// Outside doors get a diamond only when you are next to them; each way out of an interior always has one.
const EXIT_ANCHORS: [string, Vec3][] = Object.entries(DOORS)
  .filter(([, d]) => d.to === 'junction')
  .map(([id, d]) => [id, [d.position[0], 0.6, d.position[2] - 0.3]]);

export function InteractionMarkers() {
  const phase = useMissionPhase();
  const nearby = useSession((s) => s.nearbyId);
  const dialogue = useSession((s) => s.dialogue);
  const gemCollected = useSession((s) => s.gemCollected);
  const busy = useSession((s) => !!s.panel || !!s.shot || !!s.transition);
  const map = useSession((s) => s.map);
  const script = useMissionScript();
  useProfile((s) => s.gems); // signals open as gems are earned
  if (dialogue || busy) return null;
  const focus = getFocusTarget(phase);
  const anchors: [string, Vec3][] = [
    ...Object.entries(script.markers),
    ['mr-t', script.mentorPoint(phase).position],
    ...EXIT_ANCHORS,
  ];

  return (
    <>
      {/* Markers on both maps stay mounted (the maps never share the view), so walking
          through a door doesn't rebuild their GPU pipelines. */}
      {anchors.map(([id, position]) =>
        isInteractable(id, phase) ? <Marker key={id} position={position} focus={focus === id} near={nearby === id} /> : null
      )}
      {map === 'junction' && nearby && DOORS[nearby]?.map === 'junction' && (
        <Marker position={DOORS[nearby].position} focus={focus === nearby} near />
      )}
      {map === script.map && phase === 'reward' && !gemCollected && nearby === 'gem' && <Marker position={script.gem} focus near />}
    </>
  );
}

/**
 * A help signal: a column of light over the person who called.
 * A signal stays lit until its problem is *understood* (reward).
 */
function SignalBeacon({
  position,
  active,
  locked,
  label,
  bubbleY = 2.25,
  beam: showBeam = true,
}: {
  position: Vec3;
  active: boolean;
  locked: boolean;
  label: string;
  bubbleY?: number;
  beam?: boolean;
}) {
  const beam = useRef<MeshStandardMaterial>(null);
  const orb = useRef<Group>(null);
  const baseY = locked ? 4.4 : bubbleY;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (beam.current) beam.current.opacity = locked ? 0.12 : 0.2 + Math.sin(t * 4) * 0.08;
    if (orb.current) {
      orb.current.position.y = baseY + Math.sin(t * 2.2) * 0.1;
      // the "shaking" help signal
      orb.current.position.x = locked ? 0 : Math.sin(t * 23) * 0.035;
    }
  });
  if (!active) return null;
  const color = locked ? '#8aa0c8' : '#ffb020';
  // Active signals float a "!" bubble over the person; the beam starts above their head.
  const beamFrom = locked ? 1 : bubbleY + 0.45;
  return (
    <group position={position}>
      <mesh position={[0, beamFrom + 3, 0]} visible={showBeam}>
        <cylinderGeometry args={[locked ? 0.35 : 0.22, locked ? 0.6 : 0.3, 6, 16, 1, true]} />
        <meshStandardMaterial ref={beam} color={color} emissive={color} emissiveIntensity={1.5} transparent opacity={0.2} depthWrite={false} side={2} />
      </mesh>
      <group ref={orb} position={[0, baseY, 0]}>
        {locked ? (
          <mesh>
            <icosahedronGeometry args={[0.32, 1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} flatShading />
          </mesh>
        ) : (
          <Billboard>
            <mesh>
              <circleGeometry args={[0.3, 32]} />
              <meshStandardMaterial color="#ffb020" emissive="#ff9a00" emissiveIntensity={1.2} />
            </mesh>
            <mesh position={[0, 0, -0.01]}>
              <circleGeometry args={[0.36, 32]} />
              <meshBasicMaterial color="#2b2340" />
            </mesh>
            <mesh position={[0, 0.06, 0.01]}>
              <capsuleGeometry args={[0.045, 0.16, 4, 8]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, -0.16, 0.01]}>
              <circleGeometry args={[0.05, 16]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </Billboard>
        )}
      </group>
      {locked && (
        <>
          <RoundedBox args={[1, 1, 1]} radius={0.18} position={[0, 0.5, 0]} castShadow>
            <meshStandardMaterial color="#8d9ab8" roughness={0.85} />
          </RoundedBox>
          {label && (
            <Html position={[0, 5.3, 0]} center distanceFactor={12} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
              <div className="name-tag name-tag--locked">🔒 {label}</div>
            </Html>
          )}
        </>
      )}
    </group>
  );
}

export function SignalBeacons() {
  const phase = useMissionPhase();
  const map = useSession((s) => s.map);
  const script = useMissionScript();
  const gems = useProfile((s) => s.gems);
  const dev = useProfile((s) => isDevHero(s.heroName));
  return (
    <>
      {/* The person who called gets the bubble until you've talked to them. */}
      <SignalBeacon position={script.helpSeeker.home} locked={false} active={phase === 'callForHelp'} label="" bubbleY={2.3} beam={false} />
      {MISSIONS.map((m) => {
        const open = isMissionOpen(m.id, gems, dev);
        return (
          <SignalBeacon
            key={m.id}
            position={m.signalPosition}
            locked={!open}
            // An open signal stays lit until its problem is understood.
            active={open ? (m.id === script.missionId ? phase !== 'reward' : !gems.includes(m.id)) : true}
            label={map === 'junction' ? m.shortName : ''}
            bubbleY={open ? 2.75 : undefined}
          />
        );
      })}
    </>
  );
}

/** The Insight Gem — understanding, crystallized. Appears only in REWARD. */
export function InsightGem() {
  const phase = useMissionPhase();
  const map = useSession((s) => s.map);
  const collected = useSession((s) => s.gemCollected);
  const gem = useRef<Group>(null);
  const appear = useRef(0);

  useFrame(({ clock }, dt) => {
    if (!gem.current) return;
    appear.current = Math.min(1, appear.current + dt * 0.8);
    const e = 1 - Math.pow(1 - appear.current, 3);
    gem.current.rotation.y += dt * 1.2;
    gem.current.position.y = 1.1 + Math.sin(clock.elapsedTime * 2) * 0.12;
    gem.current.scale.setScalar(e);
  });

  const missionId = useMissionContext((c) => c.missionId);
  const script = useMissionScript();
  const show = phase === 'reward' && !collected && map === script.map;
  const color = getReflection(missionId).gemColor;
  const [x, , z] = script.gem;
  // The light keeps the same place in the tree (and so the same three.js object id)
  // whether or not the gem shows — on WebGPU a new light id recompiles every material.
  return (
    <>
      <pointLight position={[x, 1.2, z]} color={color} intensity={show ? 6 : 0} distance={6} />
      {show && (
        <group position={[x, 0, z]}>
          <group ref={gem} scale={0}>
            <mesh scale={[0.42, 0.62, 0.42]} castShadow>
              <octahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} metalness={0.3} roughness={0.15} flatShading />
            </mesh>
          </group>
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.5, 0.5, 5, 20, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} side={2} />
          </mesh>
          <GemSparkles />
        </group>
      )}
    </>
  );
}

const SPARKS = Array.from({ length: 36 }, (_, i) => ({
  a: (i / 36) * Math.PI * 2 * 3.7,
  r: 0.45 + ((i * 37) % 10) / 10,
  speed: 0.25 + ((i * 13) % 7) / 14,
  phase: (i * 0.61) % 1,
}));
const sparkDummy = new Object3D();

/** Rising motes around the gem (instanced; works on WebGPU and WebGL). */
function GemSparkles() {
  const mesh = useRef<InstancedMesh>(null);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    SPARKS.forEach((p, i) => {
      const k = (p.phase + t * p.speed * 0.3) % 1;
      const a = p.a + t * 0.4;
      sparkDummy.position.set(Math.cos(a) * p.r, 0.2 + k * 2.6, Math.sin(a) * p.r);
      sparkDummy.scale.setScalar(Math.sin(k * Math.PI) * 0.045 + 0.005);
      sparkDummy.updateMatrix();
      m.setMatrixAt(i, sparkDummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SPARKS.length]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#efe4ff" toneMapped={false} />
    </instancedMesh>
  );
}
