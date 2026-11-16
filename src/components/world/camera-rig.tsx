'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { CLUBHOUSE, getDialogueTree, GREENHOUSE, SHOTS, STAGES, type MapId, type Vec3 } from '@/game/data';
import { adjustZoom, cameraState, playerState } from '@/game/engine/world-state';
import { useSession } from '@/game/state/session-store';

const FOLLOW_OFFSET = new Vector3(0, 10.5, 8.2);
const INDOOR_OFFSET = new Vector3(0, 8.6, 7.4);
const ORBIT_CENTER = new Vector3(1, 0, -2);

/** Indoor maps: where the follow camera may roam, so it frames the room instead of chasing into walls. */
const INTERIORS: Partial<Record<MapId, { origin: Vec3; x: number; z: [number, number] }>> = {
  clubhouse: { origin: CLUBHOUSE.origin, x: 2.6, z: [-3.6, 3.6] },
  greenhouse: { origin: GREENHOUSE.origin, x: 2.6, z: [-3.2, 3.0] },
};

/**
 * Camera director: orbit on the title, framed shots for conversations and
 * close inspection, and a smooth third-person follow while exploring.
 */
export function CameraRig() {
  const { camera, gl, scene } = useThree();
  const look = useRef(new Vector3(0, 1, 0));
  const desiredPos = useRef(new Vector3());
  const desiredLook = useRef(new Vector3());

  //  exposes the scene graph for automated checks.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) Object.assign(window, { __trioeThree: { scene, camera } });
  }, [scene, camera]);

  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      adjustZoom(e.deltaY * 0.0012);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [gl]);

  useFrame((state, rawDt) => {
    // Exponential smoothing stays stable with large steps, so only guard against tab-switch spikes.
    const dt = Math.min(rawDt, 0.25);
    const s = useSession.getState();
    const p = playerState.position;
    let speed = 3.2;

    const stage = s.dialogue ? STAGES[getDialogueTree(s.dialogue.treeId)?.stageId ?? ''] : undefined;
    const panelShot = s.panel && SHOTS[s.panel];

    if (s.screen === 'loading' && state.clock.elapsedTime < 1.2) {
      // Warm-up: glance into each interior behind the loading screen so their GPU
      // pipelines are compiled before the player ever walks through a door.
      const room = state.clock.elapsedTime < 0.6 ? STAGES.workshop : STAGES.garden;
      desiredPos.current.fromArray(room.camera);
      desiredLook.current.fromArray(room.lookAt);
      camera.position.copy(desiredPos.current);
      look.current.copy(desiredLook.current);
      camera.lookAt(look.current);
      return;
    } else if (s.screen === 'loading' || s.screen === 'title') {
      const t = state.clock.elapsedTime * 0.06;
      desiredPos.current.set(ORBIT_CENTER.x + Math.sin(t) * 24, 17, ORBIT_CENTER.z + Math.cos(t) * 24);
      desiredLook.current.copy(ORBIT_CENTER);
      speed = 1.5;
    } else if (s.screen === 'hero-setup') {
      desiredPos.current.fromArray(SHOTS.heroSetup.camera);
      desiredLook.current.fromArray(SHOTS.heroSetup.lookAt);
      speed = 2;
    } else if (stage) {
      desiredPos.current.fromArray(stage.camera);
      desiredLook.current.fromArray(stage.lookAt);
      speed = 2.6;
    } else if (panelShot) {
      desiredPos.current.fromArray(panelShot.camera);
      desiredLook.current.fromArray(panelShot.lookAt);
      speed = 3.5;
    } else if (s.shot && SHOTS[s.shot]) {
      desiredPos.current.fromArray(SHOTS[s.shot].camera);
      desiredLook.current.fromArray(SHOTS[s.shot].lookAt);
      speed = 2.2;
    } else if (INTERIORS[s.map]) {
      // Indoors: closer, and the framing stays on the room instead of chasing into walls.
      const room = INTERIORS[s.map]!;
      const z = Math.min(cameraState.zoom, 1.2);
      const [ox, , oz] = room.origin;
      const fx = ox + Math.max(-room.x, Math.min(room.x, p.x - ox));
      const fz = oz + Math.max(room.z[0], Math.min(room.z[1], p.z - oz));
      desiredPos.current.set(fx, INDOOR_OFFSET.y * z, fz + INDOOR_OFFSET.z * z);
      desiredLook.current.set(fx, 0.5, fz - 0.6);
      speed = 5;
    } else {
      const z = cameraState.zoom;
      desiredPos.current.set(p.x + FOLLOW_OFFSET.x * z, p.y + FOLLOW_OFFSET.y * z, p.z + FOLLOW_OFFSET.z * z);
      desiredLook.current.set(p.x, p.y + 0.6, p.z - 0.4);
      speed = 5;
    }

    // Cut instantly on big jumps (entering the system, walking through a door).
    if (s.screen === 'entering' || camera.position.distanceTo(desiredPos.current) > 40) {
      // Snap behind the hero while the arrival cinematic covers the screen.
      camera.position.copy(desiredPos.current);
      look.current.copy(desiredLook.current);
    } else {
      const k = 1 - Math.exp(-dt * speed);
      camera.position.lerp(desiredPos.current, k);
      look.current.lerp(desiredLook.current, k);
    }
    camera.lookAt(look.current);
  });

  return null;
}
