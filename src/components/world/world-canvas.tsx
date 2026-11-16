'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  type Color,
  type DirectionalLight,
  type Fog,
  type HemisphereLight,
} from 'three';
import { CLUBHOUSE, GREENHOUSE, type MapId } from '@/game/data';
import { playerState } from '@/game/engine/world-state';
import { useSession } from '@/game/state/session-store';
import { QUALITY_PRESETS, useSettings } from '@/game/state/settings-store';
import { WebGPURenderer } from 'three/webgpu';
import { CameraRig } from './camera-rig';
import { Cast } from './cast';
import { GreenhouseExterior, GreenhouseInterior } from './greenhouse';
import { Farm } from './farm';
import { Landmarks } from './landmarks';
import { NorthGate } from './north-gate';
import { InsightGem, InteractionMarkers, SignalBeacons } from './markers';
import { Player } from './player';
import { PostEffects } from './post-effects';
import { Scenery } from './scenery';
import { Terrain } from './terrain';
import { Villagers } from './villagers';
import { Wildlife } from './wildlife';
import { ClubhouseInterior } from './workshop';

/** Mounts only once Suspense (physics WASM) has resolved. */
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

interface MapLook {
  background: string;
  fog: [number, number];
  center: [number, number, number];
  shadowExtent: number;
  sunIntensity: number;
  hemi: number;
  /** The shadow box follows the hero (Junction is bigger than one shadow box), instead of staying on `center`. */
  follow?: boolean;
}

const LOOKS: Record<MapId, MapLook> = {
  junction: { background: '#cfe9e4', fog: [45, 95], center: [0, 0, 0], shadowExtent: 32, sunIntensity: 2.7, hemi: 0.8, follow: true },
  clubhouse: { background: '#2a2019', fog: [40, 80], center: CLUBHOUSE.origin, shadowExtent: 10, sunIntensity: 1.6, hemi: 0.55 },
  // Glass walls: the bright 'outdoors' behind them is the background colour.
  greenhouse: { background: '#dcefe2', fog: [40, 80], center: GREENHOUSE.origin, shadowExtent: 9, sunIntensity: 2.4, hemi: 0.8 },
};

/** A following shadow box moves in steps this big, so its texels don't swim as the hero walks. */
const SHADOW_STEP = 4;

/** Aim the sun (and so its shadow box) at a point on the ground. */
function aimSun(l: DirectionalLight, cx: number, cz: number) {
  l.position.set(cx + 14, 24, cz + 11);
  l.target.position.set(cx, 0, cz);
  l.target.updateMatrixWorld();
}

/**
 * Sun that follows the active map, so shadows always cover where the hero is (on Junction it
 * follows the hero). Shadows on/off and the shadow-map size come from Options and are updated in
 * place on this one light (toggling castShadow recompiles materials once, on Save).
 */
function Sun({ look }: { look: MapLook }) {
  const light = useRef<DirectionalLight>(null);
  const shadows = useSettings((s) => s.shadows);
  const mapSize = useSettings((s) => QUALITY_PRESETS[s.quality].shadowMapSize);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const e = look.shadowExtent;
    aimSun(l, look.center[0], look.center[2]);
    Object.assign(l.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
    l.shadow.camera.updateProjectionMatrix();
  }, [look]);
  useFrame(() => {
    const l = light.current;
    if (!l || !look.follow) return;
    const cx = Math.round(playerState.position.x / SHADOW_STEP) * SHADOW_STEP;
    const cz = Math.round(playerState.position.z / SHADOW_STEP) * SHADOW_STEP;
    if (cx !== l.target.position.x || cz !== l.target.position.z) aimSun(l, cx, cz);
  });
  return (
    <directionalLight
      ref={light}
      intensity={look.sunIntensity}
      color="#ffe2b5"
      castShadow={shadows}
      shadow-mapSize={[mapSize, mapSize]}
      shadow-camera-far={80}
      shadow-bias={-0.0004}
      shadow-normalBias={0.03}
    />
  );
}

function Lighting() {
  const map = useSession((s) => s.map);
  const look = LOOKS[map];
  const background = useRef<Color>(null);
  const fog = useRef<Fog>(null);
  const hemi = useRef<HemisphereLight>(null);

  // Update in place: re-creating the fog or a light (by changing constructor args)
  // makes WebGPU recompile every material, which stalls the door transition.
  useEffect(() => {
    background.current?.set(look.background);
    if (fog.current) {
      fog.current.color.set(look.background);
      fog.current.near = look.fog[0];
      fog.current.far = look.fog[1];
    }
    if (hemi.current) hemi.current.intensity = look.hemi;
  }, [look]);

  return (
    <>
      <color ref={background} attach="background" args={[LOOKS.junction.background]} />
      <fog ref={fog} attach="fog" args={[LOOKS.junction.background, ...LOOKS.junction.fog]} />
      <hemisphereLight ref={hemi} args={['#fff3dd', '#8a6b45', LOOKS.junction.hemi]} />
      <Sun look={look} />
      <SkyEnvironment />
    </>
  );
}

/**
 * Every map stays rendered: they sit 160 m apart and never share the frustum, and
 * keeping them (and their lights) visible means the light set never changes —
 * on WebGPU a changing light set recompiles every material and stalls the door fade.
 */
function MapGroup({ id, children }: { id: MapId; children: React.ReactNode }) {
  return <group name={'map-' + id}>{children}</group>;
}

/**
 * Physics steps once per rendered frame ("vary"), so the camera, the hero and the
 * bodies always agree — no 60 Hz judder on high-refresh displays. It pauses while
 * a door transition swaps maps, so a slow frame there can't become one huge step.
 */
function PhysicsWorld({ children }: { children: React.ReactNode }) {
  const paused = useSession((s) => !!s.transition);
  return (
    <Physics gravity={[0, -20, 0]} timeStep="vary" paused={paused}>
      {children}
    </Physics>
  );
}

/** Exposes which GPU backend is active when running with `?debug`. */
function BackendProbe() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    const backend = (gl.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
    Object.assign(window, { __trioeBackend: backend });
    console.info(`[TRIOE] renderer backend: ${backend}`);
  }, [gl]);
  return null;
}

/**
 * The 3D world of Junction, rendered with three.js WebGPURenderer
 * (falls back to its WebGL2 backend where WebGPU is unavailable).
 * Mounted once; screens overlay on top of it.
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
        {/* "vary" steps physics once per rendered frame, so the camera, the hero and the
            physics body always agree — no 60 Hz judder on high-refresh displays. */}
        <PhysicsWorld>
          <MapGroup id="junction">
            <Terrain />
            <Scenery />
            <Landmarks />
            <NorthGate />
            <Farm />
            <GreenhouseExterior />
            <Villagers />
            <Wildlife />
          </MapGroup>
          <MapGroup id="clubhouse">
            <ClubhouseInterior />
          </MapGroup>
          <MapGroup id="greenhouse">
            <GreenhouseInterior />
          </MapGroup>
          <Player />
          <Cast />
        </PhysicsWorld>
        <SignalBeacons />
        <InteractionMarkers />
        <InsightGem />
        <CameraRig />
        <ReadySignal onReady={onReady} />
      </Suspense>
      <PostEffects />
    </Canvas>
  );
}
