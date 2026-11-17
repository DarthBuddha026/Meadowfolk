'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  type DirectionalLight,
  type Fog,
  type Group,
  type HemisphereLight,
} from 'three';
import { playerState } from '@/game/engine/world-state';
import { clockHour, useClock } from '@/game/state/farm-store';
import { useSession } from '@/game/state/session-store';
import { QUALITY_PRESETS, useSettings } from '@/game/state/settings-store';
import { WebGPURenderer } from 'three/webgpu';
import { Animals } from './animals';
import { CameraRig } from './camera-rig';
import { Farm } from './farm';
import { FarmPlot } from './farm-plot';
import { Landmarks } from './landmarks';
import { Placements } from './placements';
import { Player } from './player';
import { PointerController } from './pointer-controller';
import { PostEffects } from './post-effects';
import { Scenery } from './scenery';
import { Terrain } from './terrain';
import { RemotePlayers, Shopkeepers } from './townsfolk';
import { ShopInteriors } from './shop-interiors';
import { FarmTrees } from './farm-trees';
import { Villagers } from './villagers';
import { Wildlife } from './wildlife';

/** Mounts only once Suspense (physics WASM, models) has resolved. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onReady, 250);
    return () => window.clearTimeout(id);
  }, [onReady]);
  return null;
}

/** Warm sky-to-earth gradient used as image-based fill light (no HDR download). */
function SkyEnvironment() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    // Kept dim on purpose: this is soft fill, the sun does the real lighting.
    g.addColorStop(0, '#8a8272');
    g.addColorStop(0.45, '#857a66');
    g.addColorStop(0.55, '#5a6442');
    g.addColorStop(1, '#3d3020');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    const tex = new CanvasTexture(canvas);
    tex.mapping = EquirectangularReflectionMapping;
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <primitive object={texture} attach="environment" />;
}

/**
 * The day: key light colour and strength, sky fill and background by hour (6 … 26 = 2 AM).
 * Dawn is peach, midday warm white, dusk orange, night a soft blue — never pitch dark.
 */
const DAY: { h: number; sun: string; sunI: number; hemi: number; sky: string }[] = [
  { h: 6, sun: '#ffc59a', sunI: 1.5, hemi: 0.55, sky: '#f3d9c6' },
  { h: 8.5, sun: '#ffe2b5', sunI: 2.7, hemi: 0.8, sky: '#cfe9e4' },
  { h: 16, sun: '#ffe2b5', sunI: 2.7, hemi: 0.8, sky: '#cfe9e4' },
  { h: 18.5, sun: '#ffaf6e', sunI: 1.9, hemi: 0.62, sky: '#f2c7a4' },
  { h: 20.5, sun: '#94a3dc', sunI: 0.75, hemi: 0.42, sky: '#55628f' },
  { h: 26, sun: '#7f8fd0', sunI: 0.6, hemi: 0.36, sky: '#323d63' },
];

const ca = new Color();
const cb = new Color();
function dayAt(hour: number) {
  let i = 0;
  while (i < DAY.length - 2 && hour > DAY[i + 1].h) i++;
  const a = DAY[i];
  const b = DAY[i + 1];
  const t = Math.max(0, Math.min(1, (hour - a.h) / (b.h - a.h)));
  return {
    sun: ca.set(a.sun).lerp(cb.set(b.sun), t).clone(),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    hemi: a.hemi + (b.hemi - a.hemi) * t,
    sky: ca.set(a.sky).lerp(cb.set(b.sky), t).clone(),
  };
}

/** Inside a building: warm, dim and steady, the room floating in the dark (as in town interiors). */
const INDOOR = { sun: new Color('#ffe2b5'), sunI: 1.6, hemi: 0.55, sky: new Color('#2a2019') };

/** A following shadow box moves in steps this big, so its texels don't swim as the hero walks. */
const SHADOW_STEP = 4;
const SHADOW_EXTENT = 32;

function aimSun(l: DirectionalLight, cx: number, cz: number) {
  l.position.set(cx + 14, 24, cz + 11);
  l.target.position.set(cx, 0, cz);
  l.target.updateMatrixWorld();
}

/**
 * One sun that follows the hero (the world is bigger than one shadow box) and walks through the
 * day. Every light and the fog are updated in place: on WebGPU a new light (or new constructor
 * args) recompiles every material.
 */
function Lighting() {
  const light = useRef<DirectionalLight>(null);
  const background = useRef<Color>(null);
  const fog = useRef<Fog>(null);
  const hemi = useRef<HemisphereLight>(null);
  const shadows = useSettings((s) => s.shadows);
  const mapSize = useSettings((s) => QUALITY_PRESETS[s.quality].shadowMapSize);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    aimSun(l, 0, 0);
    Object.assign(l.shadow.camera, { left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT });
    l.shadow.camera.updateProjectionMatrix();
  }, []);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const cx = Math.round(playerState.position.x / SHADOW_STEP) * SHADOW_STEP;
    const cz = Math.round(playerState.position.z / SHADOW_STEP) * SHADOW_STEP;
    if (cx !== l.target.position.x || cz !== l.target.position.z) aimSun(l, cx, cz);
    // The title and setup screens always show a sunny morning.
    const s = useSession.getState();
    const playing = s.screen === 'play';
    const d = playing && s.indoors ? INDOOR : dayAt(playing ? clockHour(useClock.getState().minute) : 10);
    l.color.copy(d.sun);
    l.intensity = d.sunI;
    if (hemi.current) hemi.current.intensity = d.hemi;
    background.current?.copy(d.sky);
    fog.current?.color.copy(d.sky);
  });

  return (
    <>
      <color ref={background} attach="background" args={['#cfe9e4']} />
      <fog ref={fog} attach="fog" args={['#cfe9e4', 45, 95]} />
      <hemisphereLight ref={hemi} args={['#fff3dd', '#8a6b45', 0.8]} />
      <directionalLight
        ref={light}
        intensity={2.7}
        color="#ffe2b5"
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <SkyEnvironment />
    </>
  );
}

/** The outdoors: hidden while you're inside a building (it keeps running underneath). */
function Outdoors({ children }: { children: React.ReactNode }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    const s = useSession.getState();
    if (group.current) group.current.visible = !(s.indoors && s.screen === 'play');
  });
  return <group ref={group}>{children}</group>;
}

/** Exposes which GPU backend is active when running with `?debug`. */
function BackendProbe() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    const backend = (gl.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
    Object.assign(window, { __meadowBackend: backend });
    console.info(`[Meadowfolk] renderer backend: ${backend}`);
  }, [gl]);
  return null;
}

/**
 * The one connected diorama — town, river, farm — rendered with three.js WebGPURenderer (falls
 * back to its WebGL2 backend where WebGPU is unavailable). Mounted once; screens overlay it.
 * Physics steps once per rendered frame ("vary"), so the camera, the hero and the bodies always
 * agree — no 60 Hz judder on high-refresh displays.
 */
export function WorldCanvas({ onReady }: { onReady: () => void }) {
  const maxDpr = useSettings((s) => QUALITY_PRESETS[s.quality].maxDpr);
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, maxDpr]}
      camera={{ fov: 38, near: 0.1, far: 200, position: [20, 16, 20] }}
      gl={async (props) => {
        const renderer = new WebGPURenderer({
          ...(props as ConstructorParameters<typeof WebGPURenderer>[0]),
          antialias: true,
        });
        await renderer.init();
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        return renderer as never;
      }}
    >
      <Lighting />
      <BackendProbe />
      <Suspense fallback={null}>
        <Physics gravity={[0, -20, 0]} timeStep="vary">
          <Outdoors>
            <Terrain />
            <Scenery />
            <Landmarks />
            <Farm />
            <FarmPlot />
            <FarmTrees />
            <Animals />
            <Villagers />
            <Wildlife />
          </Outdoors>
          {/* The shops' insides (rooms off the map) with their keepers behind the counters. */}
          <ShopInteriors />
          <Shopkeepers />
          <Placements />
          <Player />
        </Physics>
        <RemotePlayers />
        <CameraRig />
        <PointerController />
        <ReadySignal onReady={onReady} />
      </Suspense>
      <PostEffects />
    </Canvas>
  );
}
