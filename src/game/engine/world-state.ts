/**
 * Mutable per-frame world state shared between 3D systems without
 * triggering React renders (player position, camera zoom).
 */

export const playerState = {
  position: { x: 0, y: 0, z: 0 },
  speed: 0,
  grounded: true,
  /** Model yaw in radians; 0 faces +z (south). */
  facing: 0,
};

/** Pending teleport, consumed by the player on the next frame. */
export const teleportRequest: { target: { x: number; z: number; face?: number } | null } = { target: null };

/** Move the hero (optionally setting which way they face, in radians). */
export function requestTeleport(x: number, z: number, face?: number) {
  teleportRequest.target = { x, z, face };
}

export const cameraState = {
  zoom: 1,
  minZoom: 0.55,
  maxZoom: 1.6,
};

export function adjustZoom(delta: number) {
  cameraState.zoom = Math.min(cameraState.maxZoom, Math.max(cameraState.minZoom, cameraState.zoom + delta));
}
