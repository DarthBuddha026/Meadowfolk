'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import type { Group } from 'three';
import { DOORS, getDialogueTree, getHero, getScript, INTERACT_POINTS, PLAYER_SPAWN, SHOTS, STAGES, type InteractPoint } from '@/game/data';
import { consumeJump, getMoveIntent } from '@/game/engine/input';
import { playSound } from '@/game/engine/sound';
import { groundHeight } from '@/game/engine/terrain';
import { playerState, teleportRequest } from '@/game/engine/world-state';
import { isInteractable } from '@/game/state/mission-director';
import { getMissionContext, getPhase } from '@/game/state/mission-phase-machine';
import { useProfile } from '@/game/state/profile-store';
import { useSession } from '@/game/state/session-store';
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
  const heroId = useProfile((s) => s.heroId);
  const screen = useSession((s) => s.screen);
  const hero = getHero(heroId);

  // Respawn at the plaza whenever the hero (re-)enters the System.
  useEffect(() => {
    if (screen !== 'entering' && screen !== 'hero-setup') return;
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
    // Safety net: if the hero ever ends up below the world, put them back somewhere safe.
    if (rb.translation().y < -4) {
      // Indoors, back to just inside the door; outdoors, the plaza.
      const door = Object.values(DOORS).find((d) => d.to === s.map && s.map !== 'junction');
      const safe = door ? door.spawn : PLAYER_SPAWN;
      rb.setTranslation({ x: safe[0], y: CENTER_Y + 0.05, z: safe[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    const pos = rb.translation();
    const vel = rb.linvel();
    const grounded = Math.abs(vel.y) < 0.6 && pos.y < CENTER_Y + 0.12;
    // Always drain the jump queue so Space used to advance dialogue never leaks into a jump.
    const wantsJump = consumeJump();

    let targetVx = 0;
    let targetVz = 0;
    let faceAngle: number | null = null;

    const stage = s.dialogue ? STAGES[getDialogueTree(s.dialogue.treeId)?.stageId ?? ''] : undefined;

    if (stage) {
      // Walk to the hero's mark on the conversation stage.
      const dx = stage.hero[0] - pos.x;
      const dz = stage.hero[2] - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 7) {
        rb.setTranslation({ x: stage.hero[0], y: CENTER_Y, z: stage.hero[2] }, true);
      } else if (dist > 0.08) {
        const sp = Math.min(WALK, dist * 5);
        targetVx = (dx / dist) * sp;
        targetVz = (dz / dist) * sp;
      } else {
        const f = stage.npc ?? stage.mrT ?? stage.lookAt;
        // Cheat out toward the camera so the hero reads in the shot.
        const focus = [f[0] + (stage.camera[0] - f[0]) * 0.4, 0, f[2] + (stage.camera[2] - f[2]) * 0.4];
        faceAngle = Math.atan2(focus[0] - pos.x, focus[2] - pos.z);
      }
    } else if (s.screen === 'play' && !s.panel && !s.shot && !s.transition) {
      const intent = getMoveIntent();
      const speed = intent.run ? RUN : WALK;
      // Camera looks down -Z, so "forward" is -Z.
      targetVx = intent.x * speed;
      targetVz = -intent.y * speed;
      if (wantsJump && grounded && !wasLocked.current) {
        rb.setLinvel({ x: vel.x, y: 6.2, z: vel.z }, true);
        playSound('blip');
      }
    } else if (s.screen === 'hero-setup' || s.screen === 'title') {
      faceAngle = 0;
    } else if (s.panel) {
      // Face the object being examined.
      const anchor = getScript(getMissionContext().missionId).markers[s.panel];
      if (anchor) faceAngle = Math.atan2(anchor[0] - pos.x, anchor[2] - pos.z);
    }

    wasLocked.current = s.screen !== 'play' || !!s.dialogue || !!s.panel || !!s.shot || !!s.transition;

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
      // Step out of frame during close-up shots so the camera can see the object.
      model.current.visible = !(s.shot || (s.panel && SHOTS[s.panel]));
      if (planar > 0.4) faceAngle = Math.atan2(vx, vz);
      if (faceAngle !== null) model.current.rotation.y = angleLerp(model.current.rotation.y, faceAngle, 1 - Math.exp(-dt * 12));
    }

    // Footsteps
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

    // Nearest interactable
    if (s.screen === 'play' && !s.dialogue && !s.transition) {
      const phase = getPhase();
      const script = getScript(getMissionContext().missionId);
      // Only things on the hero's current map count.
      const pointOf = (id: string): InteractPoint | undefined => {
        const point = id === 'mr-t' ? script.mentorPoint(phase) : id === 'gem' ? { map: script.map, position: script.gem, radius: 1.5 } : INTERACT_POINTS[id];
        return point && point.map === s.map ? point : undefined;
      };
      let best: string | null = null;
      let bestDist = Infinity;
      for (const id of [...Object.keys(INTERACT_POINTS), 'gem']) {
        const point = pointOf(id);
        if (!point) continue;
        const d = Math.hypot(point.position[0] - pos.x, point.position[2] - pos.z);
        if (d < point.radius && d < bestDist && isInteractable(id, phase)) {
          best = id;
          bestDist = d;
        }
      }
      // Hysteresis: keep the current target until we clearly leave it or something
      // is clearly closer, so the prompt doesn't blink at zone edges.
      const cur = s.nearbyId;
      const curPoint = cur ? pointOf(cur) : undefined;
      if (cur && cur !== best && curPoint && isInteractable(cur, phase)) {
        const d = Math.hypot(curPoint.position[0] - pos.x, curPoint.position[2] - pos.z);
        if (d < curPoint.radius + 0.35 && (best === null || d < bestDist + 0.3)) best = cur;
      }
      s.setNearby(best);
    } else {
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
        <CharacterModel height={hero.height} model={hero.model} motion={motion} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.36, 24]} />
          <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      </group>
    </RigidBody>
  );
}
