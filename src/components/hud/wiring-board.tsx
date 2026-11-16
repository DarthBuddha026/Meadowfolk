'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { animate } from 'framer-motion';
import type { BoardPt, WireCable, WireDevice, WirePort, WiringBoard as Board } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { examineEvidence } from '@/game/state/mission-director';
import { useSession } from '@/game/state/session-store';

/** How close (board units) a dropped plug must land to a port to go in. */
const SNAP = 4.5;
/** How tall (board units) a device's side face is drawn — the 2.5D depth. */
const DEPTH = 1.8;

const netOf = (p: WirePort) => p.net ?? p.id;

const INK = '#2b2340';

/** How many header pins the diagram draws along each slanted side of the TRIOE board. */
const ART_PINS = 8;

/**
 * Where header pin `i` (counted from the front corner) sits on the triangular TRIOE board
 * drawn in the box x/y/w/h. `side` -1 = the left row, 1 = the right row. Wiring data
 * for an `esp32` device puts its ports on these points.
 */
function esp32Pin(d: { x: number; y: number; w: number; h: number }, side: -1 | 1, i: number): BoardPt {
  const corner: BoardPt = [d.x + (side < 0 ? 0 : d.w), d.y + d.h];
  const dx = d.x + d.w / 2 - corner[0];
  const dy = -d.h;
  const len = Math.hypot(dx, dy);
  const t = 0.1 + (0.8 * i) / (ART_PINS - 1);
  // Inset 2.4 along the inward normal.
  return [corner[0] + dx * t + ((side * dy) / len) * 2.4, corner[1] + dy * t - ((side * dx) / len) * 2.4];
}

/** A device drawn the way it looks on Sarah's bench. */
function DeviceArt({ d, board }: { d: WireDevice; board: Board }) {
  const { x, y, w, h } = d;

  if (d.art === 'laptop') {
    const hinge = y + h * 0.56;
    const code: [string, number, number][] = [
      ['#7f8ca3', 0, 13],
      ['#ffb86b', 0, 9],
      ['#ffb86b', 0, 16],
      ['#8be9fd', 0, 8],
      ['#f2efe6', 1.5, 12],
      ['#f2efe6', 1.5, 15],
      ['#8be9fd', 1.5, 10],
      ['#f2efe6', 0, 2],
    ];
    return (
      <g>
        <rect x={x + 1} y={y + h - 0.5} width={w} height={3} rx={1} fill={INK} opacity={0.3} filter="url(#wb-soft)" />
        {/* Base with its keyboard, seen from above and in front */}
        <path d={`M${x + 2},${hinge} L${x + w - 2},${hinge} L${x + w},${y + h - 1.5} L${x},${y + h - 1.5} Z`} fill="#c9cdd6" stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
        <rect x={x} y={y + h - 1.5} width={w} height={1.5} rx={0.5} fill="#9a9fab" stroke={INK} strokeWidth={0.5} />
        <path d={`M${x + 5},${hinge + 2} L${x + w - 5},${hinge + 2} L${x + w - 4},${y + h - 4.5} L${x + 4},${y + h - 4.5} Z`} fill="#3a3d4a" />
        {/* Lid: the sketch on screen */}
        <rect x={x + 2} y={y} width={w - 4} height={hinge - y} rx={1} fill="#c9cdd6" stroke={INK} strokeWidth={0.5} />
        <rect x={x + 3.2} y={y + 1.2} width={w - 6.4} height={hinge - y - 2.4} rx={0.4} fill="#1d1b2c" />
        <rect x={x + 3.8} y={y + 1.8} width={6} height={1.3} fill="#19b3a6" />
        {code.map(([color, indent, len], i) => (
          <line key={i} x1={x + 4.5 + indent} x2={x + 4.5 + indent + len} y1={y + 4.6 + i * 1.5} y2={y + 4.6 + i * 1.5} stroke={color} strokeWidth={0.5} />
        ))}
        <text x={x + w / 2} y={y + h + 3.4} textAnchor="middle" fontSize={2.4} fontWeight={700} fill={INK}>
          {d.label}
        </text>
      </g>
    );
  }

  if (d.art === 'display') {
    const pins = board.cables.filter((c) => c.from[1] === y + h && c.from[0] >= x && c.from[0] <= x + w).map((c) => c.from[0]);
    return (
      <g>
        <rect x={x + 1} y={y + 2.2} width={w} height={h} rx={1} fill={INK} opacity={0.3} filter="url(#wb-soft)" />
        <rect x={x} y={y + 1} width={w} height={h} rx={1} fill="#123e85" stroke={INK} strokeWidth={0.5} />
        <rect x={x} y={y} width={w} height={h} rx={1} fill="#1d5fc4" stroke={INK} strokeWidth={0.5} />
        <rect x={x + 2} y={y + 1.5} width={w - 4} height={h - 6} rx={0.4} fill="#071018" stroke={INK} strokeWidth={0.3} />
        <text x={x + 3.5} y={y + 4.7} fontSize={2.1} fontFamily="monospace" fontWeight={700} fill="#7fd8ff">
          RIVER ALERT
        </text>
        <line x1={x + 3.5} x2={x + w - 3.5} y1={y + 5.6} y2={y + 5.6} stroke="#7fd8ff" strokeWidth={0.25} />
        <text x={x + 3.5} y={y + 9.2} fontSize={2.1} fontFamily="monospace" fontWeight={700} fill="#d6f3ff">
          Connecting...
        </text>
        {[
          [x + 1.1, y + 1.1],
          [x + w - 1.1, y + 1.1],
          [x + 1.1, y + h - 1.1],
          [x + w - 1.1, y + h - 1.1],
        ].map(([cx, cy]) => (
          <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={0.6} fill="#e6c35c" stroke={INK} strokeWidth={0.2} />
        ))}
        {/* The module's pin header, where its jumper wires start */}
        {pins.length > 0 && <rect x={Math.min(...pins) - 1.6} y={y + h - 0.9} width={Math.max(...pins) - Math.min(...pins) + 3.2} height={1.9} rx={0.3} fill="#1b1b1f" />}
      </g>
    );
  }

  if (d.art === 'plate') {
    // The smoked-acrylic plate a device is mounted on, with a brass foot in each corner.
    return (
      <g>
        <rect x={x + 1} y={y + 1.6} width={w} height={h} rx={1.5} fill={INK} opacity={0.25} filter="url(#wb-soft)" />
        <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#e3e9ea" stroke="#7f8b93" strokeWidth={0.4} opacity={0.92} />
        {[
          [x + 2, y + 2],
          [x + w - 2, y + 2],
          [x + 2, y + h - 2],
          [x + w - 2, y + h - 2],
        ].map(([cx, cy]) => (
          <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={0.9} fill="#c8ccd2" stroke={INK} strokeWidth={0.25} />
        ))}
      </g>
    );
  }

  if (d.art === 'enclosure') {
    // Mika's weatherproof control box, lid swung open: grey walls, the back panel, cable glands in the floor.
    const wall = 2.2;
    return (
      <g>
        <rect x={x + 1} y={y + 2} width={w} height={h} rx={2} fill={INK} opacity={0.3} filter="url(#wb-soft)" />
        <rect x={x} y={y} width={w} height={h} rx={2} fill="#8d939c" stroke={INK} strokeWidth={0.5} />
        <rect x={x + wall} y={y + wall} width={w - wall * 2} height={h - wall * 2} rx={1} fill="#6f757e" />
        <rect x={x + wall} y={y + wall} width={w - wall * 2} height={1.4} fill="#000" opacity={0.18} />
        {/* The clear lid, swung up out of the way */}
        <rect x={x + 3} y={y - 3.2} width={w - 6} height={2.6} rx={0.6} fill="#b9d6e6" stroke={INK} strokeWidth={0.3} opacity={0.75} />
        {[-2, -1, 0, 1, 2].map((k) => (
          <g key={k}>
            <rect x={x + w / 2 + k * 4 - 1.4} y={y + h - wall - 0.4} width={2.8} height={wall + 1.6} rx={0.5} fill="#202024" />
            <circle cx={x + w / 2 + k * 4} cy={y + h - wall + 0.2} r={0.7} fill="#3a3a40" />
          </g>
        ))}
      </g>
    );
  }

  if (d.art === 'relay') {
    // The relay module: blue PCB, its label, the black relay can (with the indicator LED) and the green screw terminal.
    return (
      <g>
        <rect x={x + 0.8} y={y + 1.4} width={w} height={h} rx={0.8} fill={INK} opacity={0.35} filter="url(#wb-soft)" />
        <rect x={x} y={y + 0.8} width={w} height={h} rx={0.8} fill="#123e85" stroke={INK} strokeWidth={0.4} />
        <rect x={x} y={y} width={w} height={h} rx={0.8} fill="#1d5fc4" stroke={INK} strokeWidth={0.4} />
        <text x={x + w * 0.56} y={y + 3.2} textAnchor="middle" fontSize={2.1} fontWeight={700} fill="#f5f5f0">
          RELAY MODULE
        </text>
        <text x={x + w * 0.56} y={y + 5.6} textAnchor="middle" fontSize={1.6} fontWeight={700} fill="#f5f5f0">
          IN · Trigger: LOW level
        </text>
        <rect x={x + w * 0.4} y={y + h * 0.48} width={w * 0.34} height={h * 0.42} rx={0.8} fill="#202024" stroke={INK} strokeWidth={0.3} />
        <rect x={x + w * 0.4} y={y + h * 0.48} width={w * 0.34} height={1} rx={0.5} fill="#fff" opacity={0.2} />
        <circle cx={x + 4.6} cy={y + 2.6} r={1.8} fill="#ff2a2a" opacity={0.45} filter="url(#wb-soft)" />
        <rect x={x + 4} y={y + 2.2} width={1.3} height={0.9} fill="#ff6b6b" stroke={INK} strokeWidth={0.15} />
        <rect x={x + w - 3.6} y={y + h * 0.3} width={3.4} height={h * 0.62} rx={0.4} fill="#3b8f5a" stroke={INK} strokeWidth={0.3} />
      </g>
    );
  }

  if (d.art === 'meter') {
    // The multimeter: yellow body, a selector dial under the LCD (drawn from `board.meter`), probe jacks on top.
    const dial: BoardPt = [x + w / 2, y + h * 0.66];
    return (
      <g>
        <rect x={x + 1} y={y + 2} width={w} height={h} rx={3} fill={INK} opacity={0.3} filter="url(#wb-soft)" />
        <rect x={x} y={y + DEPTH} width={w} height={h} rx={3} fill="#c99a1e" stroke={INK} strokeWidth={0.5} />
        <rect x={x} y={y} width={w} height={h} rx={3} fill="#f2c94c" stroke={INK} strokeWidth={0.5} />
        <rect x={x + 1.5} y={y + 1.5} width={w - 3} height={h - 3} rx={2} fill="#3a3440" />
        <circle cx={dial[0]} cy={dial[1]} r={w * 0.26} fill="#2b2b33" stroke="#c8ccd2" strokeWidth={0.4} />
        <rect x={dial[0] - 0.5} y={dial[1] - w * 0.24} width={1} height={w * 0.2} rx={0.4} fill="#f2c94c" />
        {['V⎓', 'Ω', '♪'].map((t, i) => (
          <text key={t} x={dial[0] + (i - 1) * 4.2} y={dial[1] - w * 0.32} textAnchor="middle" fontSize={1.6} fontWeight={700} fill="#f5f5f0">
            {t}
          </text>
        ))}
      </g>
    );
  }

  if (d.art === 'esp32') {
    // The TRIOE board: a blue triangle, apex up, headers along both slanted sides.
    const apex: BoardPt = [x + w / 2, y];
    const tri = `${apex[0]},${apex[1]} ${x + w},${y + h} ${x},${y + h}`;
    const chip: BoardPt = [x + w / 2, y + (h * 2) / 3];
    const rows = ([-1, 1] as const).map((side) => Array.from({ length: ART_PINS }, (_, i) => esp32Pin(d, side, i)));
    return (
      <g>
        <polygon points={tri} transform="translate(1 2.6)" fill={INK} opacity={0.3} filter="url(#wb-soft)" />
        <polygon points={tri} transform={`translate(0 ${DEPTH * 0.7})`} fill="#123e85" stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
        <polygon points={tri} fill="#1d5fc4" stroke={INK} strokeWidth={0.5} strokeLinejoin="round" />
        {/* Traces fanning from every header pin into the processor */}
        {rows.flat().map(([px, py], i) => (
          <line key={i} x1={px} y1={py} x2={chip[0]} y2={chip[1]} stroke="#3d80e3" strokeWidth={0.35} />
        ))}
        {rows.map((row, r) => (
          <g key={r}>
            <line x1={row[0][0]} y1={row[0][1]} x2={row[ART_PINS - 1][0]} y2={row[ART_PINS - 1][1]} stroke="#1b1b1f" strokeWidth={2.6} strokeLinecap="round" />
            {row.map(([px, py], i) => (
              <rect key={i} x={px - 0.45} y={py - 0.45} width={0.9} height={0.9} fill="#e6c35c" />
            ))}
          </g>
        ))}
        {/* Processor */}
        <rect x={chip[0] - 3.6} y={chip[1] - 3} width={7.2} height={7.2} rx={0.4} fill="#565b63" />
        <rect x={chip[0] - 3.6} y={chip[1] - 3.6} width={7.2} height={7.2} rx={0.4} fill="#7d828b" stroke={INK} strokeWidth={0.3} />
        <text x={chip[0]} y={chip[1] + 0.2} textAnchor="middle" fontSize={1.7} fontWeight={700} fill="#e8eaee">
          TRIOE
        </text>
        <text x={chip[0]} y={chip[1] + 1.8} textAnchor="middle" fontSize={0.95} fontWeight={700} fill="#e8eaee">
          ESP32-WROOM
        </text>
        {/* USB socket on the front edge, IO2 and the lit PWR LED */}
        <rect x={x + w * 0.4 - 2} y={y + h - 3.4} width={4} height={3.6} rx={0.3} fill="#c8ccd2" stroke={INK} strokeWidth={0.3} />
        <rect x={x + w * 0.56} y={y + h - 4} width={1.5} height={1} fill="#9fc8ff" stroke={INK} strokeWidth={0.2} />
        <circle cx={x + w * 0.69} cy={y + h - 3.5} r={2} fill="#ff2a2a" opacity={0.4} filter="url(#wb-soft)" />
        <rect x={x + w * 0.69 - 0.75} y={y + h - 4} width={1.5} height={1} fill="#ff6b6b" stroke={INK} strokeWidth={0.2} />
      </g>
    );
  }

  return null;
}

/** Outward direction of the device edge `pt` sits on (straight down when it is on none). */
function edgeOut([x, y]: BoardPt, devices: WireDevice[]): BoardPt {
  for (const d of devices) {
    const inX = x >= d.x && x <= d.x + d.w;
    const inY = y >= d.y && y <= d.y + d.h;
    if (inX && y === d.y) return [0, -1];
    if (inX && y === d.y + d.h) return [0, 1];
    if (inY && x === d.x) return [-1, 0];
    if (inY && x === d.x + d.w) return [1, 0];
  }
  return [0, 1];
}

/** A cable leaving its fixed end along `out` and entering `end` along `into` (null = a loose, drooping end). */
function cablePath([fx, fy]: BoardPt, out: BoardPt, [ex, ey]: BoardPt, into: BoardPt | null) {
  const k = 5 + Math.hypot(ex - fx, ey - fy) * 0.3;
  const [ix, iy] = into ?? [0, 1];
  return `M${fx},${fy} C${fx + out[0] * k},${fy + out[1] * k} ${ex + ix * k},${ey + iy * k} ${ex},${ey}`;
}

/**
 * A hands-on cable board (Grandpa Boldoo style): drag a cable's loose end onto a port,
 * or tap the plug and then the port. Guided boards walk through numbered steps; probe
 * boards let the player put the multimeter's red and black probes anywhere.
 */
export function WiringBoard({ board }: { board: Board }) {
  const svg = useRef<SVGSVGElement>(null);
  const ports = useMemo(() => board.devices.flatMap((d) => d.ports), [board]);
  const portById = (id: string) => ports.find((p) => p.id === id)!;
  const finished = useSession((s) => (board.done ? s.examined.includes(board.done.id) : false));
  // Which port each cable is plugged into. A finished guided board comes back fully plugged.
  const [plugged, setPlugged] = useState<Record<string, string>>(() =>
    finished && board.steps ? Object.fromEntries(board.steps.map((s) => [s.cable, s.port])) : {}
  );
  /** The loose end being dragged or springing back. */
  const [loose, setLoose] = useState<{ cable: string; at: BoardPt } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const press = useRef<{ cable: string; moved: boolean } | null>(null);

  const stepIndex = board.steps ? board.steps.findIndex((s) => plugged[s.cable] !== s.port) : -1;
  const step = board.steps && stepIndex >= 0 ? board.steps[stepIndex] : null;
  const movable = (c: WireCable) => (board.steps ? step?.cable === c.id : true);
  const held = loose?.cable ?? selected;

  /** The multimeter's reading for the probes' current places. */
  const readingFor = (p: Record<string, string>) => {
    if (!board.readings || !p.red || !p.black) return null;
    const a = netOf(portById(p.red));
    const b = netOf(portById(p.black));
    return board.readings.find((r) => (r.nets[0] === a && r.nets[1] === b) || (r.nets[0] === b && r.nets[1] === a)) ?? null;
  };
  const reading = readingFor(plugged);
  const examined = useSession((s) => (reading ? s.examined.includes(reading.id) : false));

  const endOf = (c: WireCable): BoardPt => {
    if (loose?.cable === c.id) return loose.at;
    const port = plugged[c.id];
    return port ? [portById(port).x, portById(port).y] : c.rest;
  };

  const toBoard = (e: PointerEvent): BoardPt => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y];
  };

  const springBack = (cable: WireCable, from: BoardPt) => {
    animate(0, 1, {
      duration: 0.35,
      ease: 'easeOut',
      onUpdate: (t) => setLoose({ cable: cable.id, at: [from[0] + (cable.rest[0] - from[0]) * t, from[1] + (cable.rest[1] - from[1]) * t] }),
      onComplete: () => setLoose(null),
    });
  };

  /** Try to plug `cable` into `port` (null = dropped on nothing). */
  const drop = (cable: WireCable, port: WirePort | null, from: BoardPt) => {
    setSelected(null);
    const taken = port && Object.entries(plugged).some(([c, p]) => p === port.id && c !== cable.id);
    const allowed = port && !taken && (!step || (step.cable === cable.id && step.port === port.id));
    if (!port || !allowed) {
      if (port) playSound('nudge');
      setPlugged(Object.fromEntries(Object.entries(plugged).filter(([c]) => c !== cable.id)));
      springBack(cable, from);
      return;
    }
    setLoose(null);
    const next = { ...plugged, [cable.id]: port.id };
    setPlugged(next);
    playSound('select');
    if (board.steps && board.done && board.steps.every((s) => next[s.cable] === s.port)) examineEvidence(board.done);
    const r = readingFor(next);
    if (r) examineEvidence(r);
  };

  const nearestPort = (at: BoardPt) => {
    let best: WirePort | null = null;
    let bestD = SNAP;
    for (const p of ports) {
      const d = Math.hypot(p.x - at[0], p.y - at[1]);
      if (d < bestD) [best, bestD] = [p, d];
    }
    return best;
  };

  const onPlugDown = (e: PointerEvent, cable: WireCable) => {
    if (!movable(cable)) {
      playSound('nudge');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { cable: cable.id, moved: false };
  };
  const onPlugMove = (e: PointerEvent, cable: WireCable) => {
    if (press.current?.cable !== cable.id) return;
    const at = toBoard(e);
    if (!press.current.moved && Math.hypot(at[0] - endOf(cable)[0], at[1] - endOf(cable)[1]) < 1.5) return;
    press.current.moved = true;
    setSelected(null);
    setLoose({ cable: cable.id, at });
  };
  const onPlugUp = (e: PointerEvent, cable: WireCable) => {
    if (press.current?.cable !== cable.id) return;
    const { moved } = press.current;
    press.current = null;
    if (!moved) {
      playSound('blip');
      setSelected(selected === cable.id ? null : cable.id);
      return;
    }
    const at = toBoard(e);
    drop(cable, nearestPort(at), at);
  };

  const choosePort = (port: WirePort) => {
    const cable = board.cables.find((c) => c.id === selected);
    if (cable) drop(cable, port, endOf(cable));
  };
  const keyed = (e: KeyboardEvent, act: () => void) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    act();
  };

  return (
    <div className="space-y-2">
      {board.steps && (
        <div className="min-h-[4.25rem] rounded-xl border-2 border-ink bg-sun/40 px-3 py-2 text-sm font-bold">
          {step ? (
            <>
              <span className="mr-2 font-display text-xs tracking-widest text-ink-soft">
                STEP {stepIndex + 1}/{board.steps.length}
              </span>
              {step.text}
            </>
          ) : (
            <>
              ✓ {board.done?.text}
              {board.done?.note && <span className="mt-1 block text-xs italic text-ink-soft">{board.done.note}</span>}
            </>
          )}
        </div>
      )}

      <svg ref={svg} viewBox="0 0 100 64" className="w-full touch-none select-none rounded-xl border-2 border-ink [&_path]:pointer-events-none [&_text]:pointer-events-none">
        <defs>
          <linearGradient id="wb-bench" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3e2bd" />
            <stop offset="1" stopColor="#dcc294" />
          </linearGradient>
          <linearGradient id="wb-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0.3} />
            <stop offset="0.5" stopColor="#fff" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.14} />
          </linearGradient>
          <radialGradient id="wb-socket" cx="0.5" cy="0.65" r="0.6">
            <stop offset="0" stopColor="#000" />
            <stop offset="1" stopColor="#3a3650" />
          </radialGradient>
          <filter id="wb-soft" x="-20%" y="-20%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="0.9" />
          </filter>
        </defs>

        {/* The bench the parts lie on */}
        <rect width={100} height={64} fill="url(#wb-bench)" />
        {[16, 32, 48].map((y) => (
          <line key={y} x1={0} x2={100} y1={y} y2={y} stroke="#b89a66" strokeWidth={0.2} opacity={0.5} />
        ))}

        {/* Devices as raised slabs: soft shadow, a darker side face, a lit top face */}
        {board.devices.map((d) =>
          d.art ? (
            <DeviceArt key={d.id} d={d} board={board} />
          ) : (
          <g key={d.id}>
            <rect x={d.x + 1} y={d.y + DEPTH + 1.4} width={d.w} height={d.h} rx={2} fill="#2b2340" opacity={0.3} filter="url(#wb-soft)" />
            <rect x={d.x} y={d.y + DEPTH} width={d.w} height={d.h} rx={2} fill={d.color} stroke="#2b2340" strokeWidth={0.5} />
            <rect x={d.x} y={d.y + DEPTH} width={d.w} height={d.h} rx={2} fill="#000" opacity={0.38} />
            <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={2} fill={d.color} stroke="#2b2340" strokeWidth={0.5} />
            <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={2} fill="url(#wb-sheen)" />
            <rect x={d.x + 0.9} y={d.y + 0.9} width={d.w - 1.8} height={d.h - 1.8} rx={1.3} fill="none" stroke="#fff" strokeWidth={0.3} opacity={0.28} />
            <text x={d.x + d.w / 2} y={d.y + d.h / 2 + 1} textAnchor="middle" fontSize={2.6} fontWeight={700} fill="#fff8ec">
              {d.label}
            </text>
          </g>
          )
        )}

        {board.links?.map((l, i) => {
          const end = (e: string | BoardPt): [BoardPt, BoardPt] => {
            if (typeof e !== 'string') {
              const [ox, oy] = edgeOut(e, board.devices);
              return [e, [-ox, -oy]];
            }
            const p = portById(e);
            return [[p.x, p.y], p.out ?? edgeOut([p.x, p.y], board.devices)];
          };
          const [a, aOut] = end(l.from);
          const [b, bOut] = end(l.to);
          const d = cablePath(a, aOut, b, bOut);
          return (
            <g key={i} pointerEvents="none">
              <path d={d} fill="none" stroke="#2b2340" strokeWidth={1.8} strokeLinecap="round" />
              <path d={d} fill="none" stroke={l.color} strokeWidth={1.1} strokeLinecap="round" />
              <path d={d} transform="translate(-0.15 -0.25)" fill="none" stroke="#fff" strokeWidth={0.25} strokeLinecap="round" opacity={0.4} />
            </g>
          );
        })}

        {board.meter && (
          <g>
            {/* The multimeter's recessed LCD */}
            <rect x={board.meter[0] - 11} y={board.meter[1] - 4.6} width={22} height={7} rx={0.8} fill="#2b2340" />
            <rect x={board.meter[0] - 10.4} y={board.meter[1] - 3.8} width={20.8} height={5.8} rx={0.5} fill="#cfe3c0" />
            <text x={board.meter[0]} y={board.meter[1] + 0.6} textAnchor="middle" fontSize={4} fontFamily="monospace" fontWeight={700} fill="#2b2340">
              {reading ? reading.value : '– – –'}
            </text>
          </g>
        )}

        {ports.map((p) => {
          const glow = held && (step ? step.cable === held && step.port === p.id : true);
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={selected ? 0 : -1}
              aria-label={`Port ${p.label}`}
              onClick={() => choosePort(p)}
              onKeyDown={(e) => keyed(e, () => choosePort(p))}
              className={`outline-none ${selected ? 'cursor-pointer' : ''}`}
            >
              {glow && (
                <circle cx={p.x} cy={p.y} r={3} fill="#ffd166" opacity={0.8}>
                  <animate attributeName="r" values="2.4;3.4;2.4" dur="1s" repeatCount="indefinite" />
                </circle>
              )}
              {/* A metal-rimmed socket with a dark recess */}
              <circle cx={p.x} cy={p.y + 0.35} r={1.9} fill="#2b2340" opacity={0.45} />
              <circle cx={p.x} cy={p.y} r={1.9} fill="#c8ccd2" stroke="#2b2340" strokeWidth={0.35} />
              <circle cx={p.x} cy={p.y} r={1.15} fill="url(#wb-socket)" />
              <path d={`M${p.x - 1.3},${p.y - 0.8} A1.55,1.55 0 0 1 ${p.x + 0.6},${p.y - 1.4}`} fill="none" stroke="#fff" strokeWidth={0.3} opacity={0.8} />
            </g>
          );
        })}

        {board.cables.map((c) => {
          const end = endOf(c);
          const canMove = movable(c);
          const port = loose?.cable === c.id ? null : plugged[c.id];
          const out = edgeOut(c.from, board.devices);
          const d = cablePath(c.from, out, end, port ? (portById(port).out ?? edgeOut(end, board.devices)) : null);
          return (
            <g key={c.id}>
              {/* Round cable: a shadow on the bench, the sheath, a highlight along its top */}
              <path d={d} transform="translate(0.8 1.7)" fill="none" stroke="#2b2340" strokeWidth={2.2} strokeLinecap="round" opacity={0.25} filter="url(#wb-soft)" />
              <path d={d} fill="none" stroke="#2b2340" strokeWidth={2.2} strokeLinecap="round" />
              <path d={d} fill="none" stroke={c.color} strokeWidth={1.4} strokeLinecap="round" />
              <path d={d} transform="translate(-0.2 -0.3)" fill="none" stroke="#fff" strokeWidth={0.35} strokeLinecap="round" opacity={0.45} />
              <g
                role="button"
                tabIndex={canMove ? 0 : -1}
                aria-label={`${c.label} cable${selected === c.id ? ' (picked up — choose a port)' : ''}`}
                onPointerDown={(e) => onPlugDown(e, c)}
                onPointerMove={(e) => onPlugMove(e, c)}
                onPointerUp={(e) => onPlugUp(e, c)}
                onPointerCancel={() => (press.current = null)}
                onKeyDown={(e) => keyed(e, () => canMove && setSelected(selected === c.id ? null : c.id))}
                className={`outline-none focus-visible:[&>rect]:stroke-[#ffd166] ${canMove ? 'cursor-grab' : 'cursor-not-allowed'}`}
              >
                <circle cx={end[0]} cy={end[1]} r={4.5} fill="transparent" />
                {/* The plug is a little block: side face below, lit top face */}
                <path d={`M${end[0] - 1.6},${end[1]} v2.4 a0.6,0.6 0 0 0 0.6,0.6 h2 a0.6,0.6 0 0 0 0.6,-0.6 v-2.4 z`} fill="#2b2340" />
                <rect
                  x={end[0] - 1.6}
                  y={end[1] - 1.6}
                  width={3.2}
                  height={3.2}
                  rx={0.6}
                  fill={c.color}
                  stroke={selected === c.id ? '#ffd166' : '#2b2340'}
                  strokeWidth={selected === c.id ? 0.9 : 0.5}
                />
                <rect x={end[0] - 1.1} y={end[1] - 1.2} width={2.2} height={0.7} rx={0.3} fill="#fff" opacity={0.45} pointerEvents="none" />
              </g>
              <text x={c.from[0] - out[0] * 3} y={c.from[1] - out[1] * 3 + 0.8} textAnchor={out[0] > 0 ? 'end' : out[0] < 0 ? 'start' : 'middle'} fontSize={2.2} fontWeight={700} fill="#fff8ec" stroke="#2b2340" strokeWidth={0.55} paintOrder="stroke">
                {c.label}
              </text>
            </g>
          );
        })}

        {/* Port labels last, so no cable hides them */}
        {ports.map((p) => {
          const [ox, oy] = p.out ?? edgeOut([p.x, p.y], board.devices);
          // The label goes inside the device unless the port asks for outside.
          const [lx, ly] = p.labelOutside ? [ox, oy] : [-ox, -oy];
          return (
          <text key={p.id} x={p.x + lx * 4} y={p.y + ly * 4 + 0.8} textAnchor={lx < -0.3 ? 'end' : lx > 0.3 ? 'start' : 'middle'} fontSize={2.2} fontWeight={700} fill="#fff8ec" stroke="#2b2340" strokeWidth={0.55} paintOrder="stroke">
            {p.label}
          </text>
          );
        })}
      </svg>

      <p className="text-xs font-bold text-ink-soft">
        {selected ? 'Now tap a port for it.' : 'Drag a cable end onto a port — or tap the plug, then the port.'}
      </p>

      {reading && (
        <div className="rounded-lg bg-white px-3 py-2 text-sm font-semibold">
          {reading.text}
          {examined && reading.note && <span className="mt-1 block text-xs font-bold italic text-ink-soft">{reading.note}</span>}
        </div>
      )}
    </div>
  );
}
