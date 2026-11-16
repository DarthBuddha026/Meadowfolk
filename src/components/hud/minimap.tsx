'use client';

import { useEffect, useRef } from 'react';
import { CLUBHOUSE_EXTERIOR, FARM, GREENHOUSE_EXTERIOR, HOUSES, MISSIONS, RIDGE, TERRAIN, type Pt } from '@/game/data';
import { getTerrain } from '@/game/engine/terrain';
import { playerState } from '@/game/engine/world-state';
import { useMissionContext, useNorthBankOpen } from '@/game/state/use-mission';

/** Pixels per metre on the pre-drawn Junction bitmap, and metres from the hero to the map's edge. */
const PX = 10;
const VIEW_RADIUS = 15;
const SIZE = 172;

/**
 * Junction drawn once, top-down, north up (−z), into an offscreen canvas. Until the north bank
 * opens, it lies under cloud past the ridge.
 */
function drawJunction(northOpen: boolean): HTMLCanvasElement {
  const { extent, rimInner } = TERRAIN;
  const c = document.createElement('canvas');
  c.width = extent.x * 2 * PX;
  c.height = (extent.north + extent.z) * PX;
  const g = c.getContext('2d')!;
  g.setTransform(PX, 0, 0, PX, extent.x * PX, extent.north * PX);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (pts: Pt[]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
  };

  g.fillStyle = '#8fbf62';
  g.fillRect(-extent.x, -extent.north, extent.x * 2, extent.north + extent.z);
  g.fillStyle = '#a9d47f';
  g.fillRect(-rimInner.x, -rimInner.north, rimInner.x * 2, rimInner.north + rimInner.z);
  // The ridge, either side of its cutting.
  g.fillStyle = '#8fbf62';
  const [rz0, rz1] = RIDGE.z;
  g.fillRect(-rimInner.x, rz0, RIDGE.cut.x - RIDGE.cut.half + rimInner.x, rz1 - rz0);
  g.fillRect(RIDGE.cut.x + RIDGE.cut.half, rz0, rimInner.x - RIDGE.cut.x - RIDGE.cut.half, rz1 - rz0);
  g.strokeStyle = '#7cc7d6';
  g.lineWidth = TERRAIN.river.halfWidth * 2;
  line(TERRAIN.river.points);
  g.stroke();
  g.fillStyle = '#9a6a42';
  for (const b of TERRAIN.bridges) g.fillRect(b.center[0] - b.width / 2, b.center[1] - b.length / 2, b.width, b.length);

  g.strokeStyle = g.fillStyle = '#e8cf9f';
  for (const p of TERRAIN.paths) {
    g.lineWidth = p.halfWidth * 2;
    line(p.points);
    g.stroke();
  }
  g.beginPath();
  g.arc(TERRAIN.plaza.center[0], TERRAIN.plaza.center[1], TERRAIN.plaza.radius, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f4efe4';
  g.lineWidth = 0.35;
  g.setLineDash([0.35, 0.45]);
  for (const w of TERRAIN.walkways) {
    line(w);
    g.stroke();
  }
  g.setLineDash([]);

  g.fillStyle = '#7cc7d6';
  g.beginPath();
  g.arc(TERRAIN.pond.center[0], TERRAIN.pond.center[1], TERRAIN.pond.radius, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8a6544';
  g.fillRect(FARM.x - FARM.w / 2, FARM.z - FARM.d / 2, FARM.w, FARM.d);

  g.fillStyle = '#5f8f3c';
  for (const t of getTerrain().scatter.trees) {
    g.beginPath();
    g.arc(t.x, t.z, 0.75 * t.s, 0, Math.PI * 2);
    g.fill();
  }

  const building = (x: number, z: number, w: number, d: number, rot: number, color: string) => {
    g.save();
    g.translate(x, z);
    g.rotate(-rot);
    g.fillStyle = color;
    g.strokeStyle = '#2b2340';
    g.lineWidth = 0.3;
    g.fillRect(-w / 2, -d / 2, w, d);
    g.strokeRect(-w / 2, -d / 2, w, d);
    g.restore();
  };
  for (const h of HOUSES) building(h.x, h.z, h.w, h.d, h.rot, h.roof);
  const c2 = CLUBHOUSE_EXTERIOR;
  building(c2.x, c2.z, c2.w, c2.d, 0, c2.roof);
  const gh = GREENHOUSE_EXTERIOR;
  building(gh.x, gh.z, gh.w, gh.d, 0, '#c9eef5');

  if (!northOpen) {
    g.fillStyle = '#e4e8e3';
    g.fillRect(-extent.x, -extent.north, extent.x * 2, extent.north + RIDGE.z[0]);
    g.strokeStyle = '#9aa39a';
    g.lineWidth = 0.35;
    g.setLineDash([0.8, 0.6]);
    line([[-extent.x, RIDGE.z[0]], [extent.x, RIDGE.z[0]]]);
    g.stroke();
    g.setLineDash([]);
  }
  return c;
}

/**
 * Round minimap, north up and centred on the hero, with an arrow for the way they face.
 * Junction only — the HUD hides it indoors.
 */
export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const missionId = useMissionContext((c) => c.missionId);
  const northOpen = useNorthBankOpen();

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    const g = el.getContext('2d')!;
    const junction = drawJunction(northOpen);
    const scale = SIZE / 2 / VIEW_RADIUS;
    let raf = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const { x, z } = playerState.position;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, SIZE, SIZE);
      g.save();
      g.beginPath();
      g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
      g.clip();
      // World → minimap: the hero sits at the centre.
      g.translate(SIZE / 2, SIZE / 2);
      g.scale(scale, scale);
      g.translate(-x, -z);

      g.fillStyle = '#7cc7d6';
      g.fillRect(x - VIEW_RADIUS, z - VIEW_RADIUS, VIEW_RADIUS * 2, VIEW_RADIUS * 2);
      g.drawImage(junction, -TERRAIN.extent.x, -TERRAIN.extent.north, TERRAIN.extent.x * 2, TERRAIN.extent.north + TERRAIN.extent.z);
      // Help signals: the current mission's pulses gold (pinned to the rim when out of range), the rest wait in grey.
      const pulse = 0.7 + Math.sin(t / 220) * 0.3;
      for (const m of [...MISSIONS].sort((a, b) => Number(a.id === missionId) - Number(b.id === missionId))) {
        let [sx, , sz] = m.signalPosition;
        const current = m.id === missionId;
        if (!northOpen && sz < RIDGE.z[0]) continue;   // under the cloud
        const far = Math.hypot(sx - x, sz - z);
        const edge = VIEW_RADIUS - 1.4;
        if (current && far > edge) {
          sx = x + ((sx - x) / far) * edge;
          sz = z + ((sz - z) / far) * edge;
        }
        g.beginPath();
        g.arc(sx, sz, current ? 0.9 * pulse + 0.4 : 0.55, 0, Math.PI * 2);
        g.fillStyle = current ? '#ffd166' : '#9a93ab';
        g.fill();
        g.lineWidth = 0.25;
        g.strokeStyle = '#2b2340';
        g.stroke();
      }

      // The hero: an arrow pointing the way they face (rotation.y = 0 faces +z, south).
      g.translate(x, z);
      g.rotate(-playerState.facing);
      g.beginPath();
      g.moveTo(0, 1.2);
      g.lineTo(0.8, -0.7);
      g.lineTo(0, -0.3);
      g.lineTo(-0.8, -0.7);
      g.closePath();
      g.fillStyle = '#19b3a6';
      g.fill();
      g.lineWidth = 0.3;
      g.strokeStyle = '#fff8ec';
      g.stroke();
      g.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [missionId, northOpen]);

  return (
    <div className="paper pointer-events-auto relative shrink-0 overflow-hidden rounded-full" style={{ width: SIZE + 6, height: SIZE + 6 }}>
      <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} className="block rounded-full" aria-label="Map" />
      <span className="absolute left-1/2 top-0.5 -translate-x-1/2 font-display text-[11px] font-semibold text-ink">N</span>
    </div>
  );
}
