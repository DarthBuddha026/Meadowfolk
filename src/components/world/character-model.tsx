'use client';

import { Suspense, useEffect, useMemo, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  AnimationMixer,
  LoopOnce,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { LOOKS, SHOP_SPOTS, VILLAGERS } from '@/game/data';

/**
 * Every character — players, shopkeepers, villagers — wears a rigged model; the fallback is the plain base
 * model: `public/models/base-character.glb`, the mazko chibi base model with its own
 * skin material and black outline shell, rigged with a Mixamo-style skeleton and
 * keyframed by `scripts/build-base-character.py`. A character with its own `model` wears that
 * instead (Dr Fe: the "Cute Chibi Girl" body, built by `scripts/build-dr-fe.py`, with the same
 * skeleton and clips; Sarah, Mika and the villagers: the "Low Poly Characters" chibis, restyled
 * and rigged the same way by `scripts/build-pack-villager.py`).
 * Like WoraWork's characters, every model is animated by clips (Idle, Lookaround, Talk, Walk, Run) that crossfade as the character
 * stops, walks, runs or talks. Feet at y = 0, facing +Z.
 */

export interface CharacterMotion {
  speed: number;
}

export interface CharacterLook {
  /** Multiplies `height` (kids are ~0.86). */
  scale?: number;
  /** Standing height in world units (default 1.4). */
  height?: number;
  /** Its own rigged model (GLB url, same clip names); defaults to the plain base model. */
  model?: string;
}

interface Props extends CharacterLook {
  motion: MutableRefObject<CharacterMotion>;
  speaking?: boolean;
}

const BASE_URL = '/models/base-character.glb';
useGLTF.preload(BASE_URL);
for (const look of LOOKS) if (look.model) useGLTF.preload(look.model);
for (const spot of Object.values(SHOP_SPOTS)) useGLTF.preload(spot.model);
for (const villager of VILLAGERS) useGLTF.preload(villager.model);

export function CharacterModel(props: Props) {
  // The GLB is preloaded with the world; this boundary only guards a cold cache,
  // so a character can never suspend the physics world around it.
  return (
    <Suspense fallback={null}>
      <BaseCharacter {...props} />
    </Suspense>
  );
}

type Clip = 'Idle' | 'Lookaround' | 'Talk' | 'Walk' | 'Run';
const isGait = (c: Clip) => c === 'Walk' || c === 'Run';

/**
 * Ground covered by one Walk / Run cycle, in body heights (printed by the build script). A
 * model with other proportions (Dr Fe) carries its own as `walk_stride` / `run_stride` extras.
 */
const STRIDE = { Walk: 0.656, Run: 0.782 };
/**
 * Cadence caps, in cycles per second. Slow walkers' feet stay planted; past the cap (the
 * hero is quick for a chibi) the steps stop speeding up and the feet slide a little, as
 * WoraWork's do.
 */
const MAX_RATE = { Walk: 2.2, Run: 2.6 };
/** Speeds (world units/s) where walking and running take over. */
const WALK_FROM = 0.3;
const RUN_FROM = 5.2;
/** Crossfade between clips, in seconds (WoraWork uses the same). */
const FADE = 0.3;
/** Standing still this long plays a look around. */
const LOOK_AFTER = 5;

/** One character's clips: picks Idle / Lookaround / Talk / Walk / Run and crossfades between them. */
class CharacterAnimator {
  readonly root: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions = {} as Record<Clip, AnimationAction>;
  private current: Clip = 'Idle';
  private stillFor = 0;
  private readonly stride = { ...STRIDE };

  constructor(scene: Object3D, clips: AnimationClip[]) {
    this.root = clone(scene);
    this.root.traverse((o) => {
      if (o.userData.walk_stride) this.stride.Walk = o.userData.walk_stride;
      if (o.userData.run_stride) this.stride.Run = o.userData.run_stride;
      if ((o as Mesh).isMesh) {
        // The models carry a black outline shell (an inverted hull); characters are drawn without it.
        const outline = ((o as Mesh).material as Material).name === 'solidifyoutline';
        o.visible = !outline;
        o.castShadow = !outline;
        o.receiveShadow = !outline;
      }
    });
    this.mixer = new AnimationMixer(this.root);
    for (const clip of clips) this.actions[clip.name as Clip] = this.mixer.clipAction(clip);
    this.actions.Lookaround.setLoop(LoopOnce, 1);
  }

  start() {
    const idle = this.actions.Idle;
    this.current = 'Idle';
    this.stillFor = 0;
    idle.play();
    // Start each character at a different point of its idle so a crowd doesn't breathe in step.
    idle.time = Math.random() * idle.getClip().duration;
  }

  stop() {
    this.mixer.stopAllAction();
  }

  update(dt: number, speed: number, speaking: boolean, tall: number) {
    const { actions } = this;
    let next: Clip;
    if (speed > RUN_FROM) next = 'Run';
    else if (speed > WALK_FROM) next = 'Walk';
    else if (speaking) next = 'Talk';
    else if (this.current === 'Lookaround') {
      // Hand back to Idle while the one-shot look around still has a fade left in it.
      const look = actions.Lookaround;
      next = look.time < look.getClip().duration - FADE ? 'Lookaround' : 'Idle';
    } else {
      this.stillFor += dt;
      next = this.stillFor > LOOK_AFTER ? 'Lookaround' : 'Idle';
    }
    if (next !== 'Idle') this.stillFor = 0;

    if (next !== this.current) {
      const prev = actions[this.current];
      const action = actions[next].reset();
      // Walk <-> Run keep the legs in step: both cycles start at the left heel strike.
      if (isGait(next) && isGait(this.current)) {
        action.time = (prev.time / prev.getClip().duration) * action.getClip().duration;
      }
      action.fadeIn(FADE).play();
      prev.fadeOut(FADE);
      this.current = next;
    }

    // Gait clips advance with the ground covered, so steps match the speed.
    for (const gait of ['Walk', 'Run'] as const) {
      const rate = Math.min(MAX_RATE[gait], Math.max(speed, 0.6) / (this.stride[gait] * tall));
      actions[gait].timeScale = rate * actions[gait].getClip().duration;
    }
    this.mixer.update(dt);
  }
}

function BaseCharacter({ scale = 1, height = 1.4, model = BASE_URL, motion, speaking = false }: Props) {
  const { scene, animations } = useGLTF(model);
  const animator = useMemo(() => new CharacterAnimator(scene, animations), [scene, animations]);

  useEffect(() => {
    animator.start();
    return () => animator.stop();
  }, [animator]);

  useFrame((_, dt) => animator.update(Math.min(dt, 1 / 20), motion.current.speed, speaking, height * scale));

  return <primitive object={animator.root} scale={height * scale} />;
}
