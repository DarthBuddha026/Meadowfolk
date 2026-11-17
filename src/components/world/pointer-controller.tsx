'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { PIECES } from '@/game/sim/content';
import { inGrid, inHouseArea, nearestEdge, tileAt } from '@/game/sim/farm-map';
import { buildPointer } from '@/game/engine/world-state';
import { paintAt, placeAt, removeAt, applyTool } from '@/game/state/director';
import { useSession } from '@/game/state/session-store';

const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Mouse on the 3D view. In build mode: the pointer picks a tile (walls and fences snap to its
 * nearest edge); left click places, paints or picks up, right click picks up. While playing, a
 * left click uses the tool in hand on the tile the hero faces.
 */
export function PointerController() {
  const { camera, gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();
    const groundAt = (e: PointerEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(GROUND, hit) ? hit : null;
    };
    const onMove = (e: PointerEvent) => {
      const s = useSession.getState();
      if (!s.build.on) return;
      const p = groundAt(e);
      if (!p) return s.setBuild({ hover: null });
      buildPointer.x = p.x;
      buildPointer.z = p.z;
      const [c, r] = tileAt(p.x, p.z);
      const hover: [number, number] | null = inGrid(c, r) || inHouseArea(c, r) ? [c, r] : null;
      const cur = s.build.hover;
      if (cur?.[0] !== hover?.[0] || cur?.[1] !== hover?.[1]) s.setBuild({ hover });
      else useSession.setState({ build: { ...s.build } }); // re-render the ghost for edge snapping
    };
    const onDown = (e: PointerEvent) => {
      const s = useSession.getState();
      if (s.screen !== 'play' || s.panel || s.chatOpen) return;
      if (!s.build.on) {
        if (e.button === 0 && e.pointerType === 'mouse') applyTool();
        return;
      }
      const p = groundAt(e);
      if (!p) return;
      const [c, r] = tileAt(p.x, p.z);
      if (!inGrid(c, r) && !inHouseArea(c, r)) return;
      if (e.button === 2 || s.build.remove) return removeAt(c, r, p.x, p.z);
      if (e.button !== 0) return;
      if (s.build.piece) {
        const def = PIECES[s.build.piece];
        placeAt(c, r, def.layer === 'edge' ? nearestEdge(c, r, p.x, p.z) : s.build.rot);
      } else if (s.build.color !== null) paintAt(c, r, p.x, p.z);
    };
    const noMenu = (e: MouseEvent) => {
      if (useSession.getState().build.on) e.preventDefault();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('contextmenu', noMenu);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('contextmenu', noMenu);
    };
  }, [camera, gl]);

  return null;
}
