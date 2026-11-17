'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import type { Group } from 'three';
import { getLook, PLAYER_SPAWN } from '@/game/data';
import { consumeJump, getMoveIntent } from '@/game/engine/input';
import { playSound } from '@/game/engine/sound';
import { groundHeight } from '@/game/engine/terrain';
import { playerState, teleportRequest } from '@/game/engine/world-state';
import { sendPosition } from '@/game/net/coop';
import { facingTile, findNearby } from '@/game/state/director';
import { useProfile } from '@/game/state/profile-store';
import { isInputLocked, useSession } from '@/game/state/session-store';
import { CharacterModel, type CharacterMotion } from './character-model';

const HALF_HEIGHT = 0.35;
const RADIUS = 0.3;
const CENTER_Y = HALF_HEIGHT + RADIUS;
const WALK = 3.8;
const RUN = 7;

function angleLerp(from: number, to: number, t: number) {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const model = useRef<Group>(null);
  const motion = useRef<CharacterMotion>({ speed: 0 });
  const stepTimer = useRef(0);
  const lift = useRef(0);
  const wasLocked = useRef(true);
  const lookId = useProfile((s) => s.look);
  const screen = useSession((s) => s.screen);
  const look = getLook(lookId);

  // Character setup previews the look on the plaza.
  useEffect(() => {
    if (screen !== 'setup') return;
    const rb = body.current;
    if (!rb) return;
    rb.setTranslation({ x: PLAYER_SPAWN[0], y: CENTER_Y + 0.05, z: PLAYER_SPAWN[2] }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    if (model.current) model.current.rotation.y = 0;
  }, [screen]);

  useFrame((_, rawDt) => {
    const rb = body.current;
    if (!rb) return;
    const dt = Math.min(rawDt, 1 / 20);
    const s = useSession.getState();
    if (teleportRequest.target) {
      const { x, z, face } = teleportRequest.target;
      teleportRequest.target = null;
      rb.setTranslation({ x, y: CENTER_Y + 0.05, z }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (face !== undefined && model.current) model.current.rotation.y = face;
    }
    // Safety net: if the hero ever ends up below the world, put them back on the plaza.
    if (rb.translation().y < -4) {
      rb.setTranslation({ x: PLAYER_SPAWN[0], y: CENTER_Y + 0.05, z: PLAYER_SPAWN[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    const pos = rb.translation();
    const vel = rb.linvel();
    const grounded = Math.abs(vel.y) < 0.6 && pos.y < CENTER_Y + 0.12;
    const wantsJump = consumeJump();
    const locked = isInputLocked(s);

    let targetVx = 0;
    let targetVz = 0;
    let faceAngle: number | null = null;
    if (!locked) {
      const intent = getMoveIntent();
      const speed = intent.run ? RUN : WALK;
      // Camera looks down -Z, so "forward" is -Z.
      targetVx = intent.x * speed;
      targetVz = -intent.y * speed;
      if (wantsJump && grounded && !wasLocked.current) {
        rb.setLinvel({ x: vel.x, y: 6.2, z: vel.z }, true);
        playSound('blip');
      }
    } else if (s.screen === 'setup' || s.screen === 'title') {
      faceAngle = 0;
    }
    wasLocked.current = locked;

    const accel = 1 - Math.exp(-dt * 14);
    const vx = vel.x + (targetVx - vel.x) * accel;
    const vz = vel.z + (targetVz - vel.z) * accel;
    rb.setLinvel({ x: vx, y: rb.linvel().y, z: vz }, true);

    const planar = Math.hypot(vx, vz);
    motion.current.speed = planar;
    // The physics ground is flat; stand the model on the path, bridge or stone underfoot.
    lift.current += (groundHeight(pos.x, pos.z) - lift.current) * (1 - Math.exp(-dt * 15));
    if (model.current) {
      model.current.position.y = -CENTER_Y + lift.current;
      if (planar > 0.4) faceAngle = Math.atan2(vx, vz);
      if (faceAngle !== null) model.current.rotation.y = angleLerp(model.current.rotation.y, faceAngle, 1 - Math.exp(-dt * 12));
    }

    if (grounded && planar > 1) {
      stepTimer.current -= dt * (planar / WALK);
      if (stepTimer.current <= 0) {
        stepTimer.current = 0.36;
        playSound('step');
      }
    }

    playerState.position.x = pos.x;
    playerState.position.y = pos.y - CENTER_Y;
    playerState.position.z = pos.z;
    playerState.speed = planar;
    playerState.grounded = grounded;
    if (model.current) playerState.facing = model.current.rotation.y;

    if (s.screen === 'play') {
      sendPosition(pos.x, pos.z, playerState.facing, planar);
      s.setTarget(s.build.on ? null : facingTile());
      s.setNearby(locked ? null : findNearby(pos.x, pos.z));
    } else {
      s.setTarget(null);
      s.setNearby(null);
    }
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      enabledRotations={[false, false, false]}
      position={[PLAYER_SPAWN[0], CENTER_Y + 0.05, PLAYER_SPAWN[2]]}
      linearDamping={0.5}
      friction={0}
      canSleep={false}
      // Continuous collision detection: a long frame (tab switch, GPU hitch) must never
      // let the hero tunnel through the floor.
      ccd
    >
      <CapsuleCollider args={[HALF_HEIGHT, RADIUS]} friction={0} />
      <group ref={model} position={[0, -CENTER_Y, 0]}>
        <CharacterModel key={look.id} height={look.height} model={look.model} motion={motion} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.36, 24]} />
          <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>
    </RigidBody>
  );
}
