'use client';

import { useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  CatmullRomCurve3,
  ExtrudeGeometry,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Mesh,
} from 'three';
import { CLUBHOUSE, getSurface, WORKSHOP, type Vec3 } from '@/game/data';
import { BOARD_IP, displayState } from '@/game/data/mission-1/challenge';
import { useSession } from '@/game/state/session-store';
import { useDeviceFields, useMissionContext } from '@/game/state/use-mission';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * Inside the Circuit Club house (Mission 1, No Signal): Sarah's bench, her laptop
 * (showing the live sketch), the TRIOE board and its river-alert display, the club's
 * dual-band router, the ESP32 datasheet poster — and the clubroom around them.
 */

const FONT = '"JetBrains Mono", "Cascadia Code", Consolas, monospace';
const LAPTOP_YAW = 0.12;
const LAPTOP_W = 0.62;
/** The laptop's USB port: on its right side, near the front of the base. */
const LAPTOP_PORT_Z = 0.05;
const USB_PLUG = 0.05;

const SKETCH_LINES = getSurface('mission-1', 'laptop')!.tabs[0].items;

function Laptop() {
  // The editor's fields while Mission 1 is played; otherwise the sketch on the board.
  const current = useMissionContext((c) => c.missionId) === 'mission-1';
  const editing = useSession((s) => s.sketch);
  const device = useDeviceFields('mission-1');
  const fields = current ? editing : device;
  const status = useSession((s) => (current ? s.upload.status : 'idle'));
  const key = `${fields.SSID}|${fields.PASSWORD}`;
  const screen = useCanvasTexture(
    640,
    420,
    (ctx, w, h) => {
      ctx.fillStyle = '#1d1b2c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b2840';
      ctx.fillRect(0, 0, w, 34);
      ctx.fillStyle = '#19b3a6';
      ctx.fillRect(10, 8, 120, 26);
      ctx.fillStyle = '#0d2b2a';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('sketch.ino', 24, 26);
      ctx.font = `14px ${FONT}`;
      SKETCH_LINES.forEach((line, i) => {
        const y = 52 + i * 15.6;
        ctx.fillStyle = '#5c5878';
        ctx.fillText(String(i + 1).padStart(2, ' '), 12, y);
        const text = line.text.replace('{SSID}', fields.SSID).replace('{PASSWORD}', fields.PASSWORD);
        if (text.startsWith('//')) ctx.fillStyle = '#7f8ca3';
        else if (/^(#include|const)/.test(text)) ctx.fillStyle = '#ffb86b';
        else if (/void|delay|while|if/.test(text)) ctx.fillStyle = '#8be9fd';
        else ctx.fillStyle = '#f2efe6';
        ctx.fillText(text, 44, y);
      });
      if (status === 'uploading' || status === 'done') {
        ctx.fillStyle = status === 'done' ? '#3fd18b' : '#ffd166';
        ctx.fillRect(0, h - 26, w, 26);
        ctx.fillStyle = '#1d1b2c';
        ctx.font = `bold 15px ${FONT}`;
        ctx.fillText(status === 'done' ? 'Done uploading.' : 'Uploading...', 14, h - 8);
      }
    },
    `${key}|${status}`
  );

  return (
    <group position={WORKSHOP.laptop} rotation={[0, LAPTOP_YAW, 0]}>
      <mesh position={[0, 0.012, 0]} castShadow>
        <boxGeometry args={[LAPTOP_W, 0.024, 0.42]} />
        <meshStandardMaterial color="#c9cdd6" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* USB plug in the side port — the cable runs to the TRIOE board */}
      <mesh position={[LAPTOP_W / 2 + USB_PLUG / 2, 0.012, LAPTOP_PORT_Z]} castShadow>
        <boxGeometry args={[USB_PLUG, 0.02, 0.036]} />
        <meshStandardMaterial color="#2b2b33" />
      </mesh>
      <mesh position={[0, 0.026, 0.04]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.52, 0.22]} />
        <meshStandardMaterial color="#3a3d4a" />
      </mesh>
      <group position={[0, 0.024, -0.2]} rotation={[-0.28, 0, 0]}>
        <mesh position={[0, 0.21, 0]} castShadow>
          <boxGeometry args={[0.62, 0.42, 0.02]} />
          <meshStandardMaterial color="#c9cdd6" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.21, 0.011]}>
          <planeGeometry args={[0.58, 0.38]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/*
 * The TRIOE board: a blue rounded-triangle board, flat edge facing the bench front,
 * apex pointing back. Gray processor at the centre, a row of 15 male header pins
 * along each of the two slanted sides, USB + PWR/IO2 LEDs along the front edge.
 * Board-local coordinates are (x, z) on the bench plane, centroid at the origin.
 */
const BOARD_SIDE = 0.66;
const BOARD_H = (BOARD_SIDE * Math.sqrt(3)) / 2;
const BOARD_THICK = 0.024;
const BOARD_TOP = BOARD_THICK + 0.0006;
const BOARD_BLUE = '#1d5fc4';
const APEX: [number, number] = [0, (-2 * BOARD_H) / 3];
const CORNER_L: [number, number] = [-BOARD_SIDE / 2, BOARD_H / 3];
const CORNER_R: [number, number] = [BOARD_SIDE / 2, BOARD_H / 3];
const HEADER_PINS = 15;
const HEADER_PITCH = 0.03;
const HEADER_INSET = 0.042;
const CHIP = 0.11;
const LED_IO2: [number, number] = [0.05, 0.145];
const LED_PWR: [number, number] = [0.13, 0.145];
const USB_X = -0.12;
const BOARD_YAW = -0.1;

/** The acrylic plate the board and display are mounted on (board-local, the board sits on top). */
const PLATE = 0.012;
const PLATE_W = 0.78;
const PLATE_D = 0.96;
const PLATE_Z = -0.2;
/** The display module stands on a bracket just behind the board's apex, facing the front. */
const DISPLAY_W = 0.3;
const DISPLAY_H = 0.2;
const DISPLAY_TILT = -0.22;
const DISPLAY_AT: [number, number, number] = [0, PLATE + 0.2, APEX[1] - 0.2];

/** Listed from the front corner towards the apex. */
const HEADER_LABELS = {
  left: ['3V3', 'GND', '15', '2', '0', '4', '16', '17', '5', '18', '19', '21', '22', '23', 'GND'],
  right: ['VIN', 'GND', '13', '12', '14', '27', '26', '25', '33', '32', '35', '34', '39', '36', 'EN'],
};

function headerRow(from: [number, number], to: [number, number], labels: string[]) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const d: [number, number] = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  // Inward normal: the one pointing at the centroid.
  let n: [number, number] = [-d[1], d[0]];
  if (n[0] * -mid[0] + n[1] * -mid[1] < 0) n = [-n[0], -n[1]];
  const base: [number, number] = [mid[0] + n[0] * HEADER_INSET, mid[1] + n[1] * HEADER_INSET];
  const pins = labels.map((label, i) => {
    const t = (i - (HEADER_PINS - 1) / 2) * HEADER_PITCH;
    return { label, x: base[0] + d[0] * t, z: base[1] + d[1] * t };
  });
  return { pins, base, d, n, angle: Math.atan2(-d[1], d[0]) };
}

const HEADER_ROWS = [headerRow(CORNER_L, APEX, HEADER_LABELS.left), headerRow(CORNER_R, APEX, HEADER_LABELS.right)];

/** Rounded triangle outline in Shape space (x, -z), so a -90° X rotation lays it on the bench. */
function boardShape(radius: number) {
  const pts = [APEX, CORNER_R, CORNER_L].map(([x, z]) => new Vector2(x, -z));
  const shape = new Shape();
  pts.forEach((p, i) => {
    const prev = pts[(i + 2) % 3];
    const next = pts[(i + 1) % 3];
    const a = p.clone().add(prev.clone().sub(p).setLength(radius));
    const b = p.clone().add(next.clone().sub(p).setLength(radius));
    if (i === 0) shape.moveTo(a.x, a.y);
    else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  shape.closePath();
  return shape;
}

function useBoardGeometry() {
  return useMemo(() => {
    const shape = boardShape(0.045);
    const body = new ExtrudeGeometry(shape, { depth: BOARD_THICK, bevelEnabled: false, curveSegments: 8 });
    body.rotateX(-Math.PI / 2);
    const top = new ShapeGeometry(shape, 8);
    top.rotateX(-Math.PI / 2);
    // Map the silkscreen canvas over the triangle's bounding box (canvas top = apex).
    const pos = top.attributes.position;
    const uv = top.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + BOARD_SIDE / 2) / BOARD_SIDE, 1 - (pos.getZ(i) - APEX[1]) / BOARD_H);
    }
    return { body, top };
  }, []);
}

function TrioeBoard() {
  const geometry = useBoardGeometry();
  const mats = useMemo(
    () => ({
      header: new MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.6 }),
      gold: new MeshStandardMaterial({ color: '#e6c35c', metalness: 0.8, roughness: 0.3 }),
      silver: new MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.8, roughness: 0.25 }),
    }),
    []
  );

  const SILK_W = 768;
  const silkscreen = useCanvasTexture(
    SILK_W,
    Math.round((SILK_W * BOARD_H) / BOARD_SIDE),
    (ctx) => {
      const k = SILK_W / BOARD_SIDE;
      const px = (x: number, z: number): [number, number] => [(x + BOARD_SIDE / 2) * k, (z - APEX[1]) * k];
      ctx.fillStyle = BOARD_BLUE;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      // Traces fanning from every header pin into the processor.
      ctx.strokeStyle = '#3d80e3';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const row of HEADER_ROWS) {
        row.pins.forEach((p, i) => {
          const s = (i - (HEADER_PINS - 1) / 2) / ((HEADER_PINS - 1) / 2);
          const edge: [number, number] = [-row.n[0] * (CHIP / 2) + row.d[0] * s * CHIP * 0.42, -row.n[1] * (CHIP / 2) + row.d[1] * s * CHIP * 0.42];
          const bend: [number, number] = [p.x + row.n[0] * 0.075, p.z + row.n[1] * 0.075];
          ctx.beginPath();
          ctx.moveTo(...px(p.x, p.z));
          ctx.lineTo(...px(...bend));
          ctx.lineTo(...px(...edge));
          ctx.stroke();
        });
      }
      ctx.beginPath();
      ctx.moveTo(...px(USB_X, 0.16));
      ctx.lineTo(...px(USB_X, 0.1));
      ctx.lineTo(...px(-0.03, 0.06));
      ctx.moveTo(...px(LED_IO2[0], LED_IO2[1]));
      ctx.lineTo(...px(0.02, 0.06));
      ctx.stroke();
      // Pin labels, printed just inside each header row.
      ctx.fillStyle = '#f5f5f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px Arial, sans-serif';
      for (const row of HEADER_ROWS) {
        let a = Math.atan2(row.d[1], row.d[0]);
        if (Math.abs(a) > Math.PI / 2) a += Math.PI;
        for (const p of row.pins) {
          ctx.save();
          ctx.translate(...px(p.x + row.n[0] * 0.03, p.z + row.n[1] * 0.03));
          ctx.rotate(a);
          ctx.fillText(p.label, 0, 0);
          ctx.restore();
        }
      }
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText('IO2', ...px(LED_IO2[0], LED_IO2[1] - 0.035));
      ctx.fillText('PWR', ...px(LED_PWR[0], LED_PWR[1] - 0.035));
      ctx.strokeStyle = '#f5f5f0';
      ctx.lineWidth = 2;
      const [cx, cz] = px(-CHIP / 2 - 0.008, -CHIP / 2 - 0.008);
      ctx.strokeRect(cx, cz, (CHIP + 0.016) * k, (CHIP + 0.016) * k);
    },
    ''
  );

  const chipTop = useCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#7d828b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5f646c';
      ctx.beginPath();
      ctx.arc(18, 18, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9dce1';
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px Arial, sans-serif';
      ctx.fillText('TRIOE', w / 2, h / 2 + 2);
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText('ESP32-WROOM', w / 2, h / 2 + 26);
    },
    ''
  );

  const legs = Array.from({ length: 9 }, (_, i) => (i - 4) * 0.011);

  return (
    <group position={WORKSHOP.board} rotation={[0, BOARD_YAW, 0]}>
      {/* One device: the board and its display share a smoked-acrylic plate, wired in the open */}
      <RoundedBox args={[PLATE_W, PLATE, PLATE_D]} radius={0.005} position={[0, PLATE / 2, PLATE_Z]} receiveShadow>
        <meshStandardMaterial color="#9cc7d6" roughness={0.15} transparent opacity={0.55} />
      </RoundedBox>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (PLATE_W / 2 - 0.035), PLATE + 0.004, PLATE_Z + sz * (PLATE_D / 2 - 0.035)]} material={mats.silver}>
            <cylinderGeometry args={[0.011, 0.011, 0.008, 10]} />
          </mesh>
        ))
      )}
      <AlertDisplay />
      <JumperWires />
      <group position={[0, PLATE, 0]}>
      <mesh geometry={geometry.body} castShadow receiveShadow>
        <meshStandardMaterial color={BOARD_BLUE} roughness={0.55} />
      </mesh>
      <mesh geometry={geometry.top} position={[0, BOARD_TOP, 0]}>
        <meshStandardMaterial map={silkscreen} roughness={0.55} />
      </mesh>

      {/* Processor */}
      <group position={[0, BOARD_TOP, 0]}>
        <mesh position={[0, 0.011, 0]} castShadow>
          <boxGeometry args={[CHIP, 0.018, CHIP]} />
          <meshStandardMaterial color="#7d828b" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.0205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CHIP, CHIP]} />
          <meshStandardMaterial map={chipTop} roughness={0.45} metalness={0.2} />
        </mesh>
        {[0, 1, 2, 3].map((side) => (
          <group key={side} rotation={[0, (side * Math.PI) / 2, 0]}>
            {legs.map((x) => (
              <mesh key={x} position={[x, 0.003, CHIP / 2 + 0.006]} material={mats.silver}>
                <boxGeometry args={[0.005, 0.004, 0.014]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Male headers: 15 pins on each of the two slanted (adjacent) sides */}
      {HEADER_ROWS.map((row, r) => (
        <group key={r}>
          <mesh position={[row.base[0], BOARD_TOP + 0.0125, row.base[1]]} rotation={[0, row.angle, 0]} material={mats.header} castShadow>
            <boxGeometry args={[HEADER_PINS * HEADER_PITCH, 0.025, 0.025]} />
          </mesh>
          {row.pins.map((p) => (
            <mesh key={`${p.x}`} position={[p.x, BOARD_TOP + 0.045, p.z]} material={mats.gold}>
              <boxGeometry args={[0.007, 0.06, 0.007]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* PWR LED (always on) */}
      <mesh position={[LED_PWR[0], BOARD_TOP + 0.006, LED_PWR[1]]}>
        <boxGeometry args={[0.022, 0.012, 0.014]} />
        <meshStandardMaterial color="#ff6b6b" emissive="#ff2a2a" emissiveIntensity={4} toneMapped={false} />
      </mesh>
      {/* Built-in LED on IO2 (this sketch leaves it off) */}
      <mesh position={[LED_IO2[0], BOARD_TOP + 0.006, LED_IO2[1]]}>
        <boxGeometry args={[0.022, 0.012, 0.014]} />
        <meshStandardMaterial color="#9fc8ff" emissive="#2f7bff" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>

      {/* USB port + plug on the front edge (the cable itself is UsbCable) */}
      <mesh position={[USB_X, BOARD_TOP + 0.009, BOARD_H / 3 - 0.02]} material={mats.silver} castShadow>
        <boxGeometry args={[0.05, 0.018, 0.04]} />
      </mesh>
      <mesh position={[USB_X, BOARD_TOP + 0.009, BOARD_H / 3 + 0.03]}>
        <boxGeometry args={[0.042, 0.022, 0.06]} />
        <meshStandardMaterial color="#2b2b33" />
      </mesh>
      </group>
    </group>
  );
}

/** The display module's header, as [label, colour, board pin index on the left row]. */
const DISPLAY_PINS: [string, string, number][] = [
  ['VCC', '#e8594a', HEADER_LABELS.left.indexOf('3V3')],
  ['GND', '#2b2b33', HEADER_LABELS.left.indexOf('GND')],
  ['SDA', '#3d8bd9', HEADER_LABELS.left.indexOf('21')],
  ['SCL', '#f2c94c', HEADER_LABELS.left.indexOf('22')],
];
const DISPLAY_PIN_PITCH = 0.03;

/** Where display pin `i` ends (its tip, below the module's bottom edge), in board-local space. */
function displayPinTip(i: number) {
  const x = (i - (DISPLAY_PINS.length - 1) / 2) * DISPLAY_PIN_PITCH;
  return new Vector3(x, -DISPLAY_H / 2 - 0.02 - 0.03, 0.02)
    .applyAxisAngle(new Vector3(1, 0, 0), DISPLAY_TILT)
    .add(new Vector3(...DISPLAY_AT));
}

/** Dupont jumpers from the board's 3V3/GND/21/22 header pins, up and over, to the display's header. */
function JumperWires() {
  const wires = useMemo(
    () =>
      DISPLAY_PINS.map(([label, color, index], i) => {
        const pin = HEADER_ROWS[0].pins[index];
        const from = new Vector3(pin.x, PLATE + BOARD_TOP + 0.083, pin.z);
        const to = displayPinTip(i);
        const curve = new CatmullRomCurve3(
          [
            from,
            from.clone().add(new Vector3(0, 0.05, 0)),
            new Vector3((from.x + to.x) / 2, Math.max(from.y, to.y) + 0.07, (from.z + to.z) / 2),
            to.clone().add(new Vector3(0, -0.05, 0.02)),
            to,
          ],
          false,
          'centripetal'
        );
        return { label, color, from, to, geometry: new TubeGeometry(curve, 48, 0.0045, 6) };
      }),
    []
  );
  return (
    <>
      {wires.map((w) => (
        <group key={w.label}>
          <mesh geometry={w.geometry} castShadow>
            <meshStandardMaterial color={w.color} roughness={0.55} />
          </mesh>
          {/* Black Dupont housings pushed onto the pins at both ends */}
          {[w.from, w.to].map((p, k) => (
            <mesh key={k} position={[p.x, p.y + (k === 0 ? -0.012 : 0.012), p.z]}>
              <boxGeometry args={[0.011, 0.026, 0.011]} />
              <meshStandardMaterial color="#1b1b1f" roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** A point given in a bench object's local frame (origin + yaw), in world space. */
function toWorld(origin: Vec3, yaw: number, x: number, y: number, z: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Vector3(origin[0] + x * c + z * s, origin[1] + y, origin[2] - x * s + z * c);
}

/** USB cable from the board's front plug, looping across the bench into the laptop's side port. */
function UsbCable() {
  const geometry = useMemo(() => {
    const lay = 0.011; // resting on the bench top
    const boardPlug = BOARD_H / 3 + 0.06;
    const laptopPlug = LAPTOP_W / 2 + USB_PLUG;
    const start = toWorld(WORKSHOP.board, BOARD_YAW, USB_X, PLATE + BOARD_TOP + 0.009, boardPlug);
    const end = toWorld(WORKSHOP.laptop, LAPTOP_YAW, laptopPlug, 0.012, LAPTOP_PORT_Z);
    const sag = new Vector3((start.x + end.x) / 2, WORKSHOP.board[1] + lay, Math.max(start.z, end.z) + 0.07);
    const curve = new CatmullRomCurve3(
      [
        start,
        toWorld(WORKSHOP.board, BOARD_YAW, USB_X, lay + 0.006, boardPlug + 0.06),
        toWorld(WORKSHOP.board, BOARD_YAW, USB_X - 0.07, lay, boardPlug + 0.12),
        sag,
        toWorld(WORKSHOP.laptop, LAPTOP_YAW, laptopPlug + 0.12, lay, LAPTOP_PORT_Z + 0.07),
        toWorld(WORKSHOP.laptop, LAPTOP_YAW, laptopPlug + 0.04, 0.012, LAPTOP_PORT_Z),
        end,
      ],
      false,
      'centripetal'
    );
    return new TubeGeometry(curve, 96, lay, 8);
  }, []);
  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color="#2b2b33" roughness={0.6} />
    </mesh>
  );
}

const POSTER_ROWS = getSurface('mission-1', 'poster')!.tabs[0].items;

function DatasheetPoster() {
  const texture = useCanvasTexture(
    600,
    760,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff8ec';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2b2340';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#2b2340';
      ctx.font = 'bold 44px Arial, sans-serif';
      ctx.fillText('ESP32-WROOM', 40, 80);
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillStyle = '#19b3a6';
      ctx.fillText('DATASHEET & PINOUT', 40, 122);
      // board sketch
      const apex = [250, 150];
      const left = [130, 358];
      const right = [370, 358];
      ctx.fillStyle = BOARD_BLUE;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 14;
      ctx.strokeStyle = BOARD_BLUE;
      ctx.beginPath();
      ctx.moveTo(apex[0], apex[1]);
      ctx.lineTo(right[0], right[1]);
      ctx.lineTo(left[0], left[1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Header pins along the two slanted sides
      ctx.fillStyle = '#e6c35c';
      for (const corner of [left, right]) {
        for (let i = 0; i < 15; i++) {
          const t = 0.14 + (i / 14) * 0.72;
          const x = corner[0] + (apex[0] - corner[0]) * t + (corner === left ? 14 : -14);
          const y = corner[1] + (apex[1] - corner[1]) * t + 6;
          ctx.fillRect(x - 3, y - 3, 6, 6);
        }
      }
      ctx.fillStyle = '#9aa0a8';
      ctx.fillRect(228, 266, 44, 44);
      const leds: [string, string, number][] = [
        ['IO2', '#4d8dff', 268],
        ['PWR', '#ff4d4d', 296],
      ];
      ctx.font = 'bold 22px Arial, sans-serif';
      leds.forEach(([label, color, x], i) => {
        const ly = 250 + i * 50;
        ctx.strokeStyle = '#2b2340';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 340);
        ctx.lineTo(430, ly);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, 340, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(440, ly, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b2340';
        ctx.fillText(label, 460, ly + 8);
      });
      ctx.fillStyle = '#2b2340';
      ctx.font = 'bold 21px Arial, sans-serif';
      POSTER_ROWS.forEach((row, i) => {
        const y = 430 + i * 62;
        ctx.fillStyle = i % 2 === 0 ? '#f3e7d0' : '#fff8ec';
        ctx.fillRect(30, y - 38, w - 60, 56);
        ctx.fillStyle = '#2b2340';
        ctx.fillText(row.text, 44, y - 4, w - 84);
      });
    },
    ''
  );

  const [x, , z] = WORKSHOP.poster.position;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]} rotation={[0, WORKSHOP.poster.rotationY, 0]}>
      <CuboidCollider args={[0.55, 0.9, 0.25]} position={[0, 0.9, 0]} />
      {[-0.42, 0.42].map((lx) => (
        <mesh key={lx} position={[lx, 0.75, -0.12]} rotation={[-0.12, 0, 0]} material={getWorldMaterials().woodDark} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 1.55, 8]} />
        </mesh>
      ))}
      <RoundedBox args={[1.04, 1.32, 0.06]} radius={0.03} position={[0, 1.15, 0]} rotation={[-0.12, 0, 0]} material={getWorldMaterials().wood} castShadow />
      <mesh position={[0, 1.15, 0.034]} rotation={[-0.12, 0, 0]}>
        <planeGeometry args={[0.96, 1.23]} />
        <meshStandardMaterial map={texture} roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

/* ------------------------------------------------------------------ */
/* Circuit Club interior — its own map, entered through the house door */
/* ------------------------------------------------------------------ */

function ProjectBantayBoard() {
  const texture = useCanvasTexture(
    640,
    384,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbfaf6';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2b2340';
      ctx.fillStyle = '#2b2340';
      ctx.font = 'bold 40px "Comic Sans MS", "Segoe Print", sans-serif';
      ctx.fillText('PROJECT BANTAY', 28, 54);
      ctx.font = '22px "Comic Sans MS", "Segoe Print", sans-serif';
      ctx.fillStyle = '#5a5170';
      ctx.fillText('river early-warning network — Circuit Club', 30, 86);
      // The river, and the hub every node reports to
      ctx.strokeStyle = '#4f86b8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let x = 250; x <= 390; x += 4) ctx.lineTo(x, 345 + Math.sin(x / 11) * 6);
      ctx.stroke();
      ctx.strokeStyle = '#2b2340';
      ctx.fillStyle = '#ffb020';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(320, 225, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2b2340';
      ctx.font = 'bold 18px "Comic Sans MS", "Segoe Print", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HUB', 320, 231);
      const parts: [string, string, number, number, string][] = [
        ['DISPLAY', 'Sarah', 95, 140, '#2f7bff'],
        ['GARDEN', 'Mika', 95, 235, '#19b3a6'],
        ['RIVER', 'Jordan', 95, 330, '#4f86b8'],
        ['DASHBOARD', 'Alex', 545, 140, '#e8594a'],
        ['SIGN', 'Mang Ben', 545, 235, '#f2a03c'],
        ['STAY UP!', 'Taylor', 545, 330, '#8b5cf6'],
      ];
      parts.forEach(([label, who, x, y, color]) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.strokeRect(x - 80, y - 32, 160, 64);
        ctx.fillStyle = color;
        ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", sans-serif';
        ctx.fillText(label, x, y - 2);
        ctx.fillStyle = '#5a5170';
        ctx.font = '19px "Comic Sans MS", "Segoe Print", sans-serif';
        ctx.fillText(who, x, y + 23);
        ctx.beginPath();
        ctx.setLineDash([8, 8]);
        ctx.moveTo(x < 320 ? x + 80 : x - 80, y);
        ctx.lineTo(x < 320 ? 290 : 350, 225);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    },
    ''
  );
  const m = getWorldMaterials();
  return (
    <group>
      <RoundedBox args={[2.5, 1.5, 0.08]} radius={0.04} material={m.woodDark} castShadow />
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[2.36, 1.38]} />
        <meshStandardMaterial map={texture} roughness={0.6} />
      </mesh>
      <RoundedBox args={[1.4, 0.06, 0.1]} radius={0.02} position={[0, -0.78, 0.06]} material={m.wood} />
    </group>
  );
}

function ClubBanner() {
  const texture = useCanvasTexture(
    512,
    160,
    (ctx, w, h) => {
      ctx.fillStyle = '#19b3a6';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h * 0.7);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff8ec';
      ctx.font = 'bold 54px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CIRCUIT CLUB', w / 2, 72);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText('★ we fix things together ★', w / 2, 108);
    },
    ''
  );
  return (
    <mesh>
      <planeGeometry args={[2.2, 0.69]} />
      <meshStandardMaterial map={texture} transparent alphaTest={0.5} roughness={0.8} side={2} />
    </mesh>
  );
}

const BOOK_COLORS = ['#d9674a', '#4f86b8', '#f2c14e', '#6f9c43', '#8b5cf6', '#e58c5a', '#19b3a6'];

function Bookshelf() {
  const m = getWorldMaterials();
  const books = useMemo(() => {
    const list: { x: number; y: number; h: number; w: number; c: string; tilt: number }[] = [];
    [0.42, 1.02, 1.62].forEach((y, row) => {
      let x = -0.78;
      let i = row * 5;
      while (x < 0.72) {
        const w = 0.08 + ((i * 7) % 5) * 0.015;
        const h = 0.34 + ((i * 3) % 4) * 0.04;
        list.push({ x: x + w / 2, y: y + h / 2, h, w, c: BOOK_COLORS[i % BOOK_COLORS.length], tilt: i % 9 === 4 ? 0.25 : 0 });
        x += w + 0.015;
        i++;
      }
    });
    return list;
  }, []);
  return (
    <group>
      <RoundedBox args={[1.8, 2.1, 0.55]} radius={0.05} position={[0, 1.05, -0.05]} material={m.woodDark} castShadow receiveShadow />
      {[0.4, 1.0, 1.6].map((y) => (
        <RoundedBox key={y} args={[1.66, 0.04, 0.5]} radius={0.015} position={[0, y, 0.02]} material={m.wood} />
      ))}
      {books.map((b, i) => (
        <RoundedBox key={i} args={[b.w, b.h, 0.36]} radius={0.015} position={[b.x, b.y, 0.06]} rotation={[0, 0, b.tilt]} castShadow>
          <meshStandardMaterial color={b.c} roughness={0.7} />
        </RoundedBox>
      ))}
    </group>
  );
}

function Plant({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.44, 18]} />
        <meshStandardMaterial color="#c96f45" roughness={0.85} />
      </mesh>
      {[
        [0, 0.7, 0, 0.3],
        [0.16, 0.85, 0.06, 0.22],
        [-0.14, 0.88, -0.05, 0.24],
        [0.02, 1.05, 0.0, 0.2],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <sphereGeometry args={[r, 16, 12]} />
          <meshStandardMaterial color={i % 2 ? '#6f9c43' : '#7faa4c'} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** The carpet runs down the middle of the room, from just in front of the bench to the door mat. */
const CARPET = { w: 3.7, d: 8.9, z: 0.45 };

/** The room shell: plank floor, carpet, cut-away walls (low front wall), windows, doorway. */
function Room() {
  const m = getWorldMaterials();
  const [W, D] = CLUBHOUSE.size;
  const H = CLUBHOUSE.wallHeight;
  const T = 0.3;
  const mats = useMemo(
    () => ({
      wall: new MeshStandardMaterial({ map: m.plaster, color: '#f4e4c8', roughness: 0.95 }),
      daylight: new MeshStandardMaterial({ color: '#e8f6ff', emissive: '#cfeeff', emissiveIntensity: 1.1, roughness: 0.3 }),
      outside: new MeshStandardMaterial({ color: '#fff1d0', emissive: '#ffe2a8', emissiveIntensity: 1.6, toneMapped: false }),
    }),
    [m]
  );
  const planks = Math.round(W / 0.6);
  const frontLen = W / 2 + T - 0.85;

  return (
    <>
      {/* Floor: the planks' tops are y = 0, where the physics floor (and every character's feet) is */}
      <RoundedBox args={[W + T * 2, 0.4, D + T * 2]} radius={0.08} position={[0, -0.21, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#6d4128" roughness={0.9} />
      </RoundedBox>
      {Array.from({ length: planks }).map((_, i) => (
        <RoundedBox
          key={i}
          args={[0.58, 0.06, D]}
          radius={0.025}
          smoothness={2}
          position={[-W / 2 + 0.3 + i * (W / planks), -0.03, 0]}
          material={i % 3 === 1 ? m.woodDark : m.wood}
          receiveShadow
        />
      ))}
      {/* Carpet down the middle, from the bench to the door, with a woven border (thin: feet stand on it) */}
      <RoundedBox args={[CARPET.w, 0.012, CARPET.d]} radius={0.005} position={[0, 0.006, CARPET.z]} receiveShadow>
        <meshStandardMaterial color="#1797b3" roughness={1} />
      </RoundedBox>
      {[
        [0, CARPET.z - CARPET.d / 2 + 0.25, CARPET.w - 0.5, 0.05],
        [0, CARPET.z + CARPET.d / 2 - 0.25, CARPET.w - 0.5, 0.05],
        [-CARPET.w / 2 + 0.25, CARPET.z, 0.05, CARPET.d - 0.5],
        [CARPET.w / 2 - 0.25, CARPET.z, 0.05, CARPET.d - 0.5],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.014, z]}>
          <boxGeometry args={[w, 0.004, d]} />
          <meshStandardMaterial color="#f2d79b" roughness={1} />
        </mesh>
      ))}

      {/* Back + side walls */}
      <RoundedBox args={[W + T * 2, H, T]} radius={0.06} position={[0, H / 2, -D / 2 - T / 2]} material={mats.wall} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[T, H, D + T * 2]} radius={0.06} position={[s * (W / 2 + T / 2), H / 2, 0]} material={mats.wall} castShadow receiveShadow />
      ))}
      {/* Wainscot + top trim */}
      <RoundedBox args={[W, 0.85, 0.06]} radius={0.02} position={[0, 0.43, -D / 2 + 0.03]} material={m.wood} receiveShadow />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.06, 0.85, D]} radius={0.02} position={[s * (W / 2 - 0.03), 0.43, 0]} material={m.wood} receiveShadow />
      ))}
      <RoundedBox args={[W + T * 2 + 0.1, 0.14, T + 0.12]} radius={0.04} position={[0, H + 0.05, -D / 2 - T / 2]} material={m.woodDark} />
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[T + 0.12, 0.14, D + T * 2 + 0.1]} radius={0.04} position={[s * (W / 2 + T / 2), H + 0.05, 0]} material={m.woodDark} />
      ))}

      {/* Windows with daylight: over the router, behind the diagram board, and over each side area */}
      <RoomWindow position={[-2.04, 1.75, -D / 2 + 0.02]} glass={mats.daylight} />
      <RoomWindow position={[4.0, 1.75, -D / 2 + 0.02]} glass={mats.daylight} />
      <RoomWindow position={[-W / 2 + 0.02, 1.7, -3.6]} rotY={Math.PI / 2} glass={mats.daylight} />
      <RoomWindow position={[W / 2 - 0.02, 1.7, 0.6]} rotY={-Math.PI / 2} glass={mats.daylight} />

      {/* Low front wall (cut-away) with the doorway in the middle */}
      {[-1, 1].map((s) => (
        <RoundedBox
          key={s}
          args={[frontLen, 0.7, T]}
          radius={0.06}
          position={[s * (0.85 + frontLen / 2), 0.35, D / 2 + T / 2]}
          material={mats.wall}
          castShadow
          receiveShadow
        />
      ))}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.24, 2.3, 0.38]} radius={0.05} position={[s * 0.85, 1.15, D / 2 + T / 2]} material={m.woodDark} castShadow />
      ))}
      <RoundedBox args={[1.95, 0.26, 0.38]} radius={0.05} position={[0, 2.38, D / 2 + T / 2]} material={m.woodDark} castShadow />
      {/* Bright outdoors seen through the open doorway */}
      <mesh position={[0, 1.12, D / 2 + T + 0.05]} material={mats.outside}>
        <planeGeometry args={[1.46, 2.2]} />
      </mesh>
      <RoundedBox args={[1.4, 0.03, 0.8]} radius={0.01} position={[0, 0.045, D / 2 - 0.55]} receiveShadow>
        <meshStandardMaterial color="#b5543f" roughness={1} />
      </RoundedBox>
    </>
  );
}

function RoomWindow({ position, rotY = 0, glass }: { position: Vec3; rotY?: number; glass: MeshStandardMaterial }) {
  const m = getWorldMaterials();
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <RoundedBox args={[1.2, 1.0, 0.1]} radius={0.04} material={m.wood} castShadow />
      <mesh position={[0, 0, 0.055]} material={glass}>
        <planeGeometry args={[1.0, 0.82]} />
      </mesh>
      <mesh position={[0, 0, 0.07]} material={m.woodDark}>
        <boxGeometry args={[0.06, 0.84, 0.03]} />
      </mesh>
      <mesh position={[0, 0, 0.07]} material={m.woodDark}>
        <boxGeometry args={[1.02, 0.06, 0.03]} />
      </mesh>
      <RoundedBox args={[1.32, 0.08, 0.2]} radius={0.03} position={[0, -0.54, 0.06]} material={m.woodDark} />
    </group>
  );
}

function Workbench() {
  const m = getWorldMaterials();
  const { center: bc, size: bs } = WORKSHOP.bench;
  return (
    <RigidBody type="fixed" colliders={false} position={bc}>
      <CuboidCollider args={[bs[0] / 2, bs[1] / 2, bs[2] / 2]} position={[0, bs[1] / 2, 0]} />
      <RoundedBox args={[bs[0], 0.08, bs[2]]} radius={0.03} position={[0, bs[1] - 0.04, 0]} material={m.wood} castShadow receiveShadow />
      {[
        [-bs[0] / 2 + 0.15, -bs[2] / 2 + 0.15],
        [bs[0] / 2 - 0.15, -bs[2] / 2 + 0.15],
        [-bs[0] / 2 + 0.15, bs[2] / 2 - 0.15],
        [bs[0] / 2 - 0.15, bs[2] / 2 - 0.15],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, (bs[1] - 0.08) / 2, z]} material={m.woodDark} castShadow>
          <cylinderGeometry args={[0.05, 0.06, bs[1] - 0.08, 10]} />
        </mesh>
      ))}
      <RoundedBox args={[bs[0] - 0.2, 0.04, bs[2] - 0.25]} radius={0.015} position={[0, 0.22, 0]} material={m.woodDark} />
      {/* Parts bin, mug, desk lamp */}
      <RoundedBox args={[0.5, 0.12, 0.32]} radius={0.04} position={[1.6, bs[1] + 0.06, -0.2]} castShadow>
        <meshStandardMaterial color="#4f86b8" />
      </RoundedBox>
      <mesh position={[-1.75, bs[1] + 0.07, -0.25]} castShadow>
        <cylinderGeometry args={[0.06, 0.055, 0.14, 14]} />
        <meshStandardMaterial color="#ffd166" />
      </mesh>
      <group position={[-1.35, bs[1], -0.3]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.1, 0.12, 0.04, 16]} />
          <meshStandardMaterial color="#2b2340" />
        </mesh>
        <mesh position={[0.06, 0.25, 0]} rotation={[0, 0, -0.35]}>
          <cylinderGeometry args={[0.015, 0.015, 0.46, 8]} />
          <meshStandardMaterial color="#2b2340" />
        </mesh>
        <mesh position={[0.17, 0.46, 0.05]} rotation={[0.6, 0, -0.5]}>
          <coneGeometry args={[0.11, 0.14, 16, 1, true]} />
          <meshStandardMaterial color="#e8594a" side={2} />
        </mesh>
        <mesh position={[0.2, 0.42, 0.08]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          <meshStandardMaterial color="#fff6d8" emissive="#ffd28a" emissiveIntensity={3} toneMapped={false} />
        </mesh>
      </group>
    </RigidBody>
  );
}

/** A dining-style chair: seat, leg, and a low back on the side away from the table. */
function Chair({ position, backTo }: { position: Vec3; backTo: number }) {
  const m = getWorldMaterials();
  return (
    <group position={position}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.22, 0.08, 18]} />
        <meshStandardMaterial color="#d9674a" />
      </mesh>
      <mesh position={[0, 0.2, 0]} material={m.woodDark}>
        <cylinderGeometry args={[0.04, 0.05, 0.4, 8]} />
      </mesh>
      <RoundedBox args={[0.06, 0.34, 0.38]} radius={0.02} position={[backTo * 0.2, 0.62, 0]} material={m.woodDark} castShadow />
    </group>
  );
}

/** The meeting table on the left: a long table with three chairs down each side, and the club's clutter. */
function MeetingTable() {
  const m = getWorldMaterials();
  const L = 3.4;
  const T = 1.5;
  const H = 0.72;
  return (
    <RigidBody type="fixed" colliders={false} position={[-4.07, 0, 0.6]}>
      <CuboidCollider args={[1.4, 0.45, 1.75]} position={[0, 0.45, 0]} />
      <RoundedBox args={[T, 0.08, L]} radius={0.03} position={[0, H - 0.04, 0]} material={m.wood} castShadow receiveShadow />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (T / 2 - 0.12), (H - 0.08) / 2, sz * (L / 2 - 0.15)]} material={m.woodDark} castShadow>
            <boxGeometry args={[0.08, H - 0.08, 0.08]} />
          </mesh>
        ))
      )}
      <RoundedBox args={[T - 0.3, 0.04, L - 0.4]} radius={0.015} position={[0, 0.2, 0]} material={m.woodDark} />
      {[-1.1, 0, 1.1].flatMap((z) => [-1, 1].map((s) => <Chair key={`${z}${s}`} position={[s * 1.15, 0, z]} backTo={s} />))}
      {/* Notebook, mug, scattered plans and a spare TRIOE board */}
      <RoundedBox args={[0.3, 0.03, 0.4]} radius={0.01} position={[0.25, H + 0.015, -0.9]} rotation={[0, 0.25, 0]} castShadow>
        <meshStandardMaterial color="#4f86b8" />
      </RoundedBox>
      <mesh position={[-0.4, H + 0.06, 0.25]} castShadow>
        <cylinderGeometry args={[0.06, 0.055, 0.12, 14]} />
        <meshStandardMaterial color="#f6f2ea" />
      </mesh>
      {[
        [0.1, 0.75, -0.2],
        [-0.25, 1.0, 0.35],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x, H + 0.004 + i * 0.002, z]} rotation={[-Math.PI / 2, 0, r]}>
          <planeGeometry args={[0.42, 0.3]} />
          <meshStandardMaterial color="#fbfaf6" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0.3, H + 0.008, 0.1]} rotation={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.012, 3]} />
        <meshStandardMaterial color="#1d5fc4" roughness={0.55} />
      </mesh>
    </RigidBody>
  );
}

/** A three-seat sofa facing its local +z. */
function Sofa({ position, rotY }: { position: Vec3; rotY: number }) {
  const fabric = '#e58c5a';
  const dark = '#c96f45';
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, rotY, 0]}>
      <CuboidCollider args={[1.2, 0.4, 0.45]} position={[0, 0.4, 0]} />
      <RoundedBox args={[2.4, 0.28, 0.9]} radius={0.06} position={[0, 0.2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={dark} roughness={0.9} />
      </RoundedBox>
      {[-0.54, 0.54].map((x) => (
        <RoundedBox key={x} args={[1.04, 0.16, 0.66]} radius={0.06} position={[x, 0.42, 0.08]} castShadow receiveShadow>
          <meshStandardMaterial color={fabric} roughness={0.9} />
        </RoundedBox>
      ))}
      <RoundedBox args={[2.4, 0.58, 0.24]} radius={0.08} position={[0, 0.6, -0.33]} castShadow receiveShadow>
        <meshStandardMaterial color={fabric} roughness={0.9} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[0.22, 0.46, 0.9]} radius={0.07} position={[s * 1.09, 0.45, 0]} castShadow>
          <meshStandardMaterial color={dark} roughness={0.9} />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.38, 0.32, 0.12]} radius={0.06} position={[-0.72, 0.66, -0.15]} rotation={[-0.3, 0.15, 0]} castShadow>
        <meshStandardMaterial color="#ffd166" roughness={0.9} />
      </RoundedBox>
    </RigidBody>
  );
}

/** The low coffee table between the sofas: books, a mug and a little plant. */
function CoffeeTable({ position }: { position: Vec3 }) {
  const m = getWorldMaterials();
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CuboidCollider args={[0.65, 0.22, 0.33]} position={[0, 0.22, 0]} />
      <RoundedBox args={[1.3, 0.06, 0.65]} radius={0.025} position={[0, 0.42, 0]} material={m.wood} castShadow receiveShadow />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.56, 0.2, sz * 0.25]} material={m.woodDark}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
          </mesh>
        ))
      )}
      {['#d9674a', '#4f86b8', '#f2c14e'].map((c, i) => (
        <RoundedBox key={c} args={[0.32, 0.05, 0.24]} radius={0.01} position={[-0.35, 0.475 + i * 0.05, 0]} rotation={[0, i * 0.2, 0]} castShadow>
          <meshStandardMaterial color={c} roughness={0.7} />
        </RoundedBox>
      ))}
      <mesh position={[0.15, 0.51, 0.1]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.12, 14]} />
        <meshStandardMaterial color="#ffd166" />
      </mesh>
      <group position={[0.42, 0.45, -0.08]} scale={0.35}>
        <Plant position={[0, 0, 0]} />
      </group>
    </RigidBody>
  );
}

function Furniture() {
  const m = getWorldMaterials();
  return (
    <>
      {/* Back wall, left to right: bookshelf, router cabinet (Router), bench (Workbench) */}
      <RigidBody type="fixed" colliders={false} position={[-4.47, 0, -5.7]}>
        <CuboidCollider args={[0.9, 1.05, 0.3]} position={[0, 1.05, 0]} />
        <Bookshelf />
      </RigidBody>
      {/* Club banner above the bench; the Project Bantay whiteboard above the meeting table */}
      <group position={[1.28, 2.15, -5.95]}>
        <ClubBanner />
      </group>
      <group position={[-5.94, 1.6, 0.6]} rotation={[0, Math.PI / 2, 0]}>
        <ProjectBantayBoard />
      </group>
      <MeetingTable />
      {/* Lounge: two sofas facing each other across the coffee table */}
      <Sofa position={[4.07, 0, -1.17]} rotY={0} />
      <CoffeeTable position={[4.07, 0, 0.6]} />
      <Sofa position={[4.07, 0, 2.36]} rotY={Math.PI} />
      {/* Sarah's stool at the bench */}
      <group position={[-0.35, 0, -4.45]}>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.24, 0.22, 0.08, 18]} />
          <meshStandardMaterial color="#d9674a" />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={m.woodDark}>
          <cylinderGeometry args={[0.04, 0.05, 0.4, 8]} />
        </mesh>
      </group>
      {/* A plant in each front corner */}
      <Plant position={[-5.04, 0, 5.04]} />
      <Plant position={[5.04, 0, 5.04]} />
      {/* Floor lamp between the bookshelf and the meeting table */}
      <group position={[-5.45, 0, -2.2]}>
        <mesh position={[0, 0.8, 0]} material={m.woodDark}>
          <cylinderGeometry args={[0.03, 0.03, 1.6, 8]} />
        </mesh>
        <mesh position={[0, 1.65, 0]}>
          <cylinderGeometry args={[0.16, 0.26, 0.28, 18, 1, true]} />
          <meshStandardMaterial color="#fff1d0" emissive="#ffcf80" emissiveIntensity={1.4} side={2} />
        </mesh>
      </group>
    </>
  );
}

/** Walls of the room for physics, including an invisible blocker in the doorway. */
function RoomColliders() {
  const [W, D] = CLUBHOUSE.size;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[W / 2 + 0.5, 0.5, D / 2 + 0.5]} position={[0, -0.5, 0]} />
      <CuboidCollider args={[W / 2 + 0.3, 1.5, 0.15]} position={[0, 1.5, -D / 2 - 0.15]} />
      <CuboidCollider args={[0.15, 1.5, D / 2 + 0.3]} position={[-W / 2 - 0.15, 1.5, 0]} />
      <CuboidCollider args={[0.15, 1.5, D / 2 + 0.3]} position={[W / 2 + 0.15, 1.5, 0]} />
      <CuboidCollider args={[W / 2 + 0.3, 1.5, 0.15]} position={[0, 1.5, D / 2 + 0.15]} />
    </RigidBody>
  );
}

/* ------------------------------------------------------------------ */
/* Mission 1 — the river-alert display and the club router             */
/* ------------------------------------------------------------------ */

/**
 * Sarah's river-alert display: a bare screen module on a bracket behind the board,
 * wired to the board's header (see JumperWires). It shows whatever the running sketch
 * tells it to. Board-local, like the rest of the device.
 */
function AlertDisplay() {
  const state = displayState(useDeviceFields('mission-1'));
  const screen = useCanvasTexture(
    256,
    170,
    (ctx, w, h) => {
      ctx.fillStyle = '#071018';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#7fd8ff';
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('RIVER ALERT', 18, 36);
      ctx.fillRect(18, 46, w - 36, 2);
      if (state === 'online') {
        ctx.fillStyle = '#5dffa8';
        ctx.font = `bold 26px ${FONT}`;
        ctx.fillText('ONLINE', 18, 86);
        ctx.font = `16px ${FONT}`;
        ctx.fillText(BOARD_IP, 18, 112);
        ctx.fillStyle = '#d6f3ff';
        ctx.fillText('River: waiting for', 18, 138);
        ctx.fillText('data...', 18, 158);
      } else {
        ctx.fillStyle = '#d6f3ff';
        ctx.font = `bold 22px ${FONT}`;
        ctx.fillText('Connecting...', 18, 96);
      }
    },
    state
  );
  const dots = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    // The sketch prints a dot every half second while it waits; the screen pulses with it.
    if (dots.current) dots.current.visible = state !== 'online' && Math.floor(clock.elapsedTime * 2) % 2 === 0;
  });

  return (
    <>
      {/* Bracket: a foot on the plate and an upright tilted back with the module */}
      <mesh position={[0, PLATE + 0.006, DISPLAY_AT[2] - 0.04]} castShadow>
        <boxGeometry args={[0.2, 0.012, 0.1]} />
        <meshStandardMaterial color="#2b2340" roughness={0.6} />
      </mesh>
      <group position={DISPLAY_AT} rotation={[DISPLAY_TILT, 0, 0]}>
        <mesh position={[0, -0.03, -0.022]} castShadow>
          <boxGeometry args={[0.2, DISPLAY_H + 0.1, 0.012]} />
          <meshStandardMaterial color="#2b2340" roughness={0.6} />
        </mesh>
        {/* Bare module: blue PCB, screen, brass screws, a 4-pin header on the bottom edge */}
        <mesh castShadow>
          <boxGeometry args={[DISPLAY_W + 0.04, DISPLAY_H + 0.05, 0.012]} />
          <meshStandardMaterial color="#1d5fc4" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.006, 0.008]}>
          <boxGeometry args={[DISPLAY_W, DISPLAY_H, 0.006]} />
          <meshStandardMaterial color="#0b0f16" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.006, 0.0115]}>
          <planeGeometry args={[DISPLAY_W - 0.012, DISPLAY_H - 0.012]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
        <mesh ref={dots} position={[DISPLAY_W / 2 - 0.035, -DISPLAY_H / 2 + 0.03, 0.012]}>
          <planeGeometry args={[0.03, 0.012]} />
          <meshBasicMaterial color="#d6f3ff" toneMapped={false} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sy) => (
            <mesh key={`${sx}${sy}`} position={[sx * (DISPLAY_W / 2 + 0.008), sy * (DISPLAY_H / 2 + 0.01), 0.008]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.006, 10]} />
              <meshStandardMaterial color="#e6c35c" metalness={0.8} roughness={0.3} />
            </mesh>
          ))
        )}
        {DISPLAY_PINS.map(([label], i) => (
          <mesh key={label} position={[(i - (DISPLAY_PINS.length - 1) / 2) * DISPLAY_PIN_PITCH, -DISPLAY_H / 2 - 0.035, 0.02]}>
            <boxGeometry args={[0.006, 0.03, 0.006]} />
            <meshStandardMaterial color="#e6c35c" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** The club's dual-band router, on a low cabinet: two antennas, status lights, a sticker. */
function Router() {
  const m = getWorldMaterials();
  const solved = displayState(useDeviceFields('mission-1')) === 'online';
  const leds = useRef<(MeshStandardMaterial | null)[]>([]);
  const sticker = useCanvasTexture(
    256,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#fbfaf6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b2340';
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.fillText('ClubNet  · 2.4 GHz', 12, 30);
      ctx.fillText('ClubNet_5G · 5 GHz', 12, 58);
      ctx.font = '15px Arial, sans-serif';
      ctx.fillText('Password: fixthings2gether', 12, 90);
      ctx.fillStyle = '#7f8ca3';
      ctx.font = '13px Arial, sans-serif';
      ctx.fillText('Dual-band Wi-Fi router', 12, 114);
    },
    ''
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // POWER steady; each band flickers with its own traffic (2.4G gets busier once the board joins).
    const levels = [1, Math.sin(t * (solved ? 23 : 9)) > 0.2 ? 1 : 0.2, Math.sin(t * 13 + 1) > 0.1 ? 1 : 0.2];
    leds.current.forEach((mat, i) => {
      if (mat) mat.emissiveIntensity = levels[i] * 3;
    });
  });
  const [cx, , cz] = WORKSHOP.cabinet;
  const [rx, ry, rz] = WORKSHOP.router;
  return (
    <>
      <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
        <CuboidCollider args={[0.7, 0.31, 0.25]} position={[0, 0.31, 0]} />
        <RoundedBox args={[1.4, 0.62, 0.5]} radius={0.04} position={[0, 0.31, 0]} material={m.woodDark} castShadow receiveShadow />
        {[-0.35, 0.35].map((dx) => (
          <mesh key={dx} position={[dx, 0.33, 0.252]} material={m.wood}>
            <boxGeometry args={[0.62, 0.48, 0.01]} />
          </mesh>
        ))}
        {[-0.08, 0.08].map((dx) => (
          <mesh key={dx} position={[dx, 0.36, 0.262]}>
            <sphereGeometry args={[0.02, 8, 6]} />
            <meshStandardMaterial color="#e8c35a" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </RigidBody>
      <group position={[rx, ry, rz]} rotation={[0, 0.2, 0]}>
        <RoundedBox args={[0.42, 0.07, 0.26]} radius={0.025} position={[0, 0.035, 0]} castShadow>
          <meshStandardMaterial color="#f4f2ee" roughness={0.5} />
        </RoundedBox>
        {[-0.15, 0.15].map((dx) => (
          <mesh key={dx} position={[dx, 0.2, -0.1]} rotation={[0, 0, dx > 0 ? -0.18 : 0.18]} castShadow>
            <capsuleGeometry args={[0.014, 0.26, 4, 8]} />
            <meshStandardMaterial color="#2b2b33" roughness={0.6} />
          </mesh>
        ))}
        {['#5dffa8', '#7fd8ff', '#7fd8ff'].map((color, i) => (
          <mesh key={i} position={[-0.09 + i * 0.07, 0.04, 0.131]}>
            <boxGeometry args={[0.03, 0.012, 0.004]} />
            <meshStandardMaterial
              ref={(mat) => {
                leds.current[i] = mat;
              }}
              color={color}
              emissive={color}
              emissiveIntensity={3}
              toneMapped={false}
            />
          </mesh>
        ))}
        {/* The sticker card, lying in front of the router where everyone copies the password from */}
        <mesh position={[0.24, 0.006, 0.19]} rotation={[-Math.PI / 2 + 0.12, 0, 0.12]}>
          <planeGeometry args={[0.2, 0.1]} />
          <meshStandardMaterial map={sticker} roughness={0.8} />
        </mesh>
      </group>
    </>
  );
}

/** The Circuit Club interior map, where Mission 1 takes place. */
export function ClubhouseInterior() {
  return (
    <group>
      <group position={CLUBHOUSE.origin}>
        <Room />
        <Furniture />
        <RoomColliders />
        <pointLight position={[-4.0, 2.2, 0.6]} color="#ffcf8a" intensity={7} distance={7} decay={1.6} />
        <pointLight position={[1.3, 2.3, -4.2]} color="#fff0d8" intensity={6} distance={7} decay={1.6} />
      </group>
      <Workbench />
      <Laptop />
      <TrioeBoard />
      <UsbCable />
      <Router />
      <DatasheetPoster />
    </group>
  );
}
