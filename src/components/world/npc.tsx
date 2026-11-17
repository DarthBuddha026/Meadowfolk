'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import type { Group, Mesh } from 'three';
import type { Vec3 } from '@/game/data';
import { groundHeight } from '@/game/engine/terrain';
import { playerState } from '@/game/engine/world-state';
import { CharacterModel, type CharacterLook, type CharacterMotion } from './character-model';

const BODY_Y = 0.65;
/** Centre-to-centre gap (m) an NPC keeps from the hero: its collider (0.34) + the hero's (0.3) + a little air. */
const KEEP_CLEAR = 0.8;

interface Props {
  name: string;
  look: CharacterLook;
  /** Where the NPC should be right now (home or stage mark). */
  target: Vec3;
  /** Point to face when standing still; null = face the player if near. */
  faceTarget: Vec3 | null;
  speaking: boolean;
  inConversation: boolean;
  /** Teleport instead of walking when the target jumps further than this. */
  teleportDistance?: number;
  showTag?: boolean;
  /** Which way to look when nobody is near (a shopkeeper faces the street). */
  fallbackFace?: Vec3;
}

/**
 * A townsperson standing in the world. Walks to its target, turns to face the player when
 * they come near, and scales up slightly with a glow ring when speaking.
 */
export function Npc({ name, look, target, faceTarget, speaking, inConversation, teleportDistance = 9, showTag = true, fallbackFace }: Props) {
  const body = useRef<RapierRigidBody>(null);
  const root = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const motion = useRef<CharacterMotion>({ speed: 0 });
  const pos = useRef({ x: target[0], z: target[2], rot: 0, scale: 1, appear: 1, lift: groundHeight(target[0], target[2]) });

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const p = pos.current;
    const dx = target[0] - p.x;
    const dz = target[2] - p.z;
    const dist = Math.hypot(dx, dz);
    let speed = 0;
    // Outside a conversation, never walk (or pop) into the hero: a kinematic body would shove them
    // into a wall or trap them inside it, so the NPC waits until the hero steps out of the way.
    // On a conversation stage everyone has their own mark, so the NPC always takes its blocking
    // (the hero is walking to theirs at the same time and would otherwise hold it up halfway).
    const hx = playerState.position.x;
    const hz = playerState.position.z;
    const toHero = (x: number, z: number) => (inConversation ? Infinity : Math.hypot(x - hx, z - hz));

    if (dist > teleportDistance) {
      if (toHero(target[0], target[2]) > KEEP_CLEAR) {
        p.x = target[0];
        p.z = target[2];
        p.appear = 0; // pop-in effect
      }
    } else if (dist > 0.05) {
      const step = Math.min(dist, Math.min(3.2, dist * 6) * dt);
      const nx = p.x + (dx / dist) * step;
      const nz = p.z + (dz / dist) * step;
      // Blocked only when the step closes in on the hero, so an NPC can always back away.
      if (toHero(nx, nz) > KEEP_CLEAR || toHero(nx, nz) >= toHero(p.x, p.z)) {
        speed = Math.min(3.2, dist * 6);
        p.x = nx;
        p.z = nz;
      }
    }
    motion.current.speed = speed;

    let face: number | null = null;
    if (speed > 1) face = Math.atan2(dx, dz);
    else if (faceTarget) face = Math.atan2(faceTarget[0] - p.x, faceTarget[2] - p.z);
    else {
      const pdx = playerState.position.x - p.x;
      const pdz = playerState.position.z - p.z;
      if (Math.hypot(pdx, pdz) < 5) face = Math.atan2(pdx, pdz);
      else if (fallbackFace) face = Math.atan2(fallbackFace[0] - p.x, fallbackFace[2] - p.z);
    }
    if (face !== null) {
      let diff = face - p.rot;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.rot += diff * (1 - Math.exp(-dt * 8));
    }

    p.appear = Math.min(1, p.appear + dt * 2.5);
    const targetScale = speaking ? 1.07 : 1;
    p.scale += (targetScale - p.scale) * (1 - Math.exp(-dt * 10));

    // Stand on the path, bridge or stone underfoot (the physics ground is flat).
    p.lift += (groundHeight(p.x, p.z) - p.lift) * (1 - Math.exp(-dt * 15));
    body.current?.setNextKinematicTranslation({ x: p.x, y: BODY_Y + p.lift, z: p.z });
    if (root.current) {
      root.current.rotation.y = p.rot;
      const pop = 1 - Math.pow(1 - p.appear, 3);
      root.current.scale.setScalar(p.scale * pop);
    }
    if (ring.current) {
      const visible = speaking && inConversation;
      ring.current.visible = visible;
      if (visible) ring.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4) * 0.06);
    }
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[target[0], BODY_Y, target[2]]}>
      <CylinderCollider args={[BODY_Y, 0.34]} />
      <group position={[0, -BODY_Y, 0]}>
        <group ref={root}>
          <CharacterModel {...look} motion={motion} speaking={speaking && inConversation} />
        </group>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} visible={false}>
          <ringGeometry args={[0.5, 0.62, 32]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.85} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.36, 24]} />
          <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
        </mesh>
        {showTag && !inConversation && (
          <Html position={[0, 1.75, 0]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className="name-tag">{name}</div>
          </Html>
        )}
      </group>
    </RigidBody>
  );
}
