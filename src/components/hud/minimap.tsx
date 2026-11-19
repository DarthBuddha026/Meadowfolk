'use client';

import { useEffect, useRef } from 'react';
import { CARPENTER_HOUSE, FARM, HOUSES, SHOP_SPOTS, TAVERN, TERRAIN, VINE_ROWS, type Pt } from '@/game/data';
import { GRID } from '@/game/sim/farm-map';
import { getTerrain } from '@/game/engine/terrain';
import { playerState } from '@/game/engine/world-state';

/** Pixels per metre on the pre-drawn Junction bitmap, and metres from the hero to the map's edge. */
const PX = 10;
const VIEW_RADIUS = 15;
const SIZE = 172;

/**
 * The world drawn once, top-down, north up (−z), into an offscreen canvas: the town, the river
 * and the farm on the north bank.
 */
function drawJunction(): HTMLCanvasElement {
  const { extent } = TERRAIN;
  const terrain = getTerrain();
  const c = document.createElement('canvas');
  c.width = (extent.west + extent.east) * PX;
  c.height = (extent.north + extent.south) * PX;
  const g = c.getContext('2d')!;
  g.setTransform(PX, 0, 0, PX, extent.west * PX, extent.north * PX);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = (pts: Pt[]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
  };

  // The sea all round; then the land's own outlines: grass, the beaches' sand, the rim and ridge.
  g.fillStyle = '#7cc7d6';
  g.fillRect(-extent.west, -extent.north, extent.west + extent.east, extent.north + extent.south);
  const fillLoops = (loops: Pt[][], color: string) => {
    g.fillStyle = color;
    g.beginPath();
    for (const l of loops) l.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
    g.closePath();
    g.fill('evenodd');
  };
  fillLoops(terrain.land, '#a9d47f');
  fillLoops(terrain.beach, '#f1dfb0');
  fillLoops(terrain.rim, '#8fbf62');
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
  // The vineyard: soil striped with its rows of vines.
  g.fillStyle = '#8a6544';
  g.fillRect(FARM.x - FARM.w / 2, FARM.z - FARM.d / 2, FARM.w, FARM.d);
  g.fillStyle = '#6f9c45';
  for (const dz of VINE_ROWS) g.fillRect(FARM.x - FARM.w / 2 + 0.5, FARM.z + dz - 0.3, FARM.w - 1, 0.6);

  g.fillStyle = '#5f8f3c';
  for (const t of terrain.scatter.trees) {
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
  building(TAVERN.x, TAVERN.z, TAVERN.w, TAVERN.d, TAVERN.rot, TAVERN.roof);
  const c2 = CARPENTER_HOUSE;
  building(c2.x, c2.z, c2.w, c2.d, 0, c2.roof);

  // The farm grid: a dashed outline on the north bank.
  g.strokeStyle = '#8a6a3f';
  g.lineWidth = 0.35;
  g.setLineDash([0.8, 0.6]);
  g.strokeRect(GRID.x0, GRID.z0, GRID.cols * GRID.cell, GRID.rows * GRID.cell);
  g.setLineDash([]);
  return c;
}

/**
 * Round minimap, north up and centred on the hero, with an arrow for the way they face.
 * Gold dots mark the shops; the dashed box is the farm.
 */
export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    const g = el.getContext('2d')!;
    const junction = drawJunction();
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
      const { extent } = TERRAIN;
      g.drawImage(junction, -extent.west, -extent.north, extent.west + extent.east, extent.north + extent.south);
      // The shops: a gold dot at each counter (pinned to the rim when out of range).
      const pulse = 0.85 + Math.sin(t / 300) * 0.15;
      for (const spot of Object.values(SHOP_SPOTS)) {
        let [sx, sz] = spot.counter;
        const far = Math.hypot(sx - x, sz - z);
        const edge = VIEW_RADIUS - 1.4;
        if (far > edge) {
          sx = x + ((sx - x) / far) * edge;
          sz = z + ((sz - z) / far) * edge;
        }
        g.beginPath();
        g.arc(sx, sz, 0.75 * pulse, 0, Math.PI * 2);
        g.fillStyle = '#ffd166';
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
  }, []);

  return (
    <div className="paper pointer-events-auto relative shrink-0 overflow-hidden rounded-full" style={{ width: SIZE + 6, height: SIZE + 6 }}>
      <canvas ref={canvas} style={{ width: SIZE, height: SIZE }} className="block rounded-full" aria-label="Map" />
      <span className="absolute left-1/2 top-0.5 -translate-x-1/2 font-display text-[11px] font-semibold text-ink">N</span>
    </div>
  );
}
