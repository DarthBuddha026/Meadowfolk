'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type PerspectiveCamera } from 'three';
import { SHOTS } from '@/game/data';
import { GRID, HOUSE_AREA, villaBounds } from '@/game/sim/farm-map';
import { shopRoom } from '@/game/data';
import { zoneAt } from '@/game/state/zones';
import { getFarm } from '@/game/state/farm-store';
import { getMoveIntent } from '@/game/engine/input';
import { adjustZoom, buildFocus, cameraState, playerState } from '@/game/engine/world-state';
import { useSession } from '@/game/state/session-store';

const FOLLOW_OFFSET = new Vector3(0, 10.5, 8.2);
/** Indoors: closer, framing the room (as in the town's buildings). */
const INDOOR_OFFSET = new Vector3(0, 8.6, 7.4);
/** Build mode pulls up and back to look down over the farm. */
const BUILD_OFFSET = new Vector3(0, 17, 11);
const ORBIT_CENTER = new Vector3(0, 0, -14);

/**
 * Camera director: a slow orbit over the diorama on the title, the setup shot, a smooth high
 * follow while playing, a closer room view inside the villa (it frames the room instead of
 * chasing the hero into walls), and a higher view in build mode that WASD pans over the farm.
 */
export function CameraRig() {
  const { camera, gl, scene } = useThree();
  const look = useRef(new Vector3(0, 1, 0));
  const desiredPos = useRef(new Vector3());
  const desiredLook = useRef(new Vector3());
  const wasBuilding = useRef(false);

  // `?debug` exposes the scene graph for automated checks.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) Object.assign(window, { __meadowThree: { scene, camera } });
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
    // Map renders (`?debug`): `window.__meadowShot = { x, z, height, fov }` holds the camera straight
    // above (x, z), north up, until it is cleared.
    const shot = (window as unknown as { __meadowShot?: { x: number; z: number; height: number; fov: number } }).__meadowShot;
    if (shot) {
      const cam = state.camera as PerspectiveCamera;
      cam.position.set(shot.x, shot.height, shot.z + 0.001);
      cam.lookAt(shot.x, 0, shot.z);
      if (cam.fov !== shot.fov || cam.far < shot.height * 2) {
        cam.fov = shot.fov;
        cam.far = shot.height * 2;
        cam.updateProjectionMatrix();
      }
      return;
    }
    const dt = Math.min(rawDt, 0.25);
    const s = useSession.getState();
    const p = playerState.position;
    let speed = 3.2;

    if (s.build.on && !wasBuilding.current) {
      buildFocus.x = p.x;
      buildFocus.z = p.z;
    }
    wasBuilding.current = s.build.on;

    if (s.screen === 'loading' || s.screen === 'title') {
      const t = state.clock.elapsedTime * 0.05;
      desiredPos.current.set(ORBIT_CENTER.x + Math.sin(t) * 30, 22, ORBIT_CENTER.z + Math.cos(t) * 30);
      desiredLook.current.copy(ORBIT_CENTER);
      speed = 1.5;
    } else if (s.screen === 'setup') {
      desiredPos.current.fromArray(SHOTS.setup.camera);
      desiredLook.current.fromArray(SHOTS.setup.lookAt);
      speed = 2;
    } else if (s.build.on) {
      // Pan with WASD, kept over the farm.
      const move = getMoveIntent();
      const pan = (move.run ? 16 : 9) * dt;
      // Inside, over the house's rooms (their own space); outside, over the farm.
      const [c0, c1, r0, r1] = s.indoors ? [HOUSE_AREA.c0, HOUSE_AREA.c1, HOUSE_AREA.r0, HOUSE_AREA.r1] : [0, GRID.cols, 0, GRID.rows + 4];
      buildFocus.x = Math.max(GRID.x0 + c0, Math.min(GRID.x0 + c1, buildFocus.x + move.x * pan));
      buildFocus.z = Math.max(GRID.z0 + r0, Math.min(GRID.z0 + r1, buildFocus.z - move.y * pan));
      const z = cameraState.zoom;
      desiredPos.current.set(buildFocus.x + BUILD_OFFSET.x * z, BUILD_OFFSET.y * z, buildFocus.z + BUILD_OFFSET.z * z);
      desiredLook.current.set(buildFocus.x, 0, buildFocus.z);
      speed = 6;
    } else if (s.indoors && room()) {
      // Indoors: the focus stays inside the room, a little in from its walls.
      const r = room()!;
      const z = Math.min(cameraState.zoom, 1.2);
      const clamp = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));
      const fx = clamp(p.x, r.x0 + 2, r.x1 - 2);
      const fz = clamp(p.z, r.z0 + 1.6, r.z1 - 1.4);
      desiredPos.current.set(fx + INDOOR_OFFSET.x * z, INDOOR_OFFSET.y * z, fz + INDOOR_OFFSET.z * z);
      desiredLook.current.set(fx, 0.5, fz - 0.6);
      speed = 5;
    } else {
      const z = cameraState.zoom;
      desiredPos.current.set(p.x + FOLLOW_OFFSET.x * z, p.y + FOLLOW_OFFSET.y * z, p.z + FOLLOW_OFFSET.z * z);
      desiredLook.current.set(p.x, p.y + 0.6, p.z - 0.4);
      speed = 5;
    }

    // Cut instantly on big jumps (arriving, waking up, visiting a friend) and behind a door's fade card.
    if (s.screen === 'entering' || !!s.transition || camera.position.distanceTo(desiredPos.current) > 40) {
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

/** The room the hero is in (a shop's, or the house's) in world units. */
function room() {
  const zone = zoneAt(playerState.position.x, playerState.position.z);
  if (zone !== 'house' && zone !== 'out') return shopRoom(zone);
  const farm = getFarm();
  const b = farm && villaBounds(farm);
  return b && { x0: GRID.x0 + b.c0, x1: GRID.x0 + b.c1, z0: GRID.z0 + b.r0, z1: GRID.z0 + b.r1 };
}
