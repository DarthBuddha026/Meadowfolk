/**
 * Tiny WebAudio synth — every game sound is generated, so the game ships
 * with zero audio assets. Call `unlockAudio()` from a user gesture first;
 * it also starts the background music (`music.ts`).
 */

import { startMusic, type Music } from './music';

export type SoundId = 'blip' | 'select' | 'clue' | 'step' | 'nudge' | 'upload' | 'success' | 'gem' | 'open' | 'close' | 'door' | 'unlock';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let music: Music | null = null;
/** Music sits well under the sound effects. */
const MUSIC_LEVEL = 0.65;

export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (!music && master) {
    const level = ctx.createGain();
    level.gain.value = MUSIC_LEVEL;
    level.connect(master);
    music = startMusic(ctx, level);
  }
}

export function setMuted(value: boolean) {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.35, ctx.currentTime, 0.05);
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', volume = 0.4, slideTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function noiseTick(volume = 0.08) {
  if (!ctx || !master) return;
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = 900 + Math.random() * 300;
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(filter).connect(gain).connect(master);
  src.start();
}

/* ------------------------------------------------------------------ */
/* Ambient loops — continuous sounds whose level the world sets         */
/* ------------------------------------------------------------------ */

export type AmbientId = 'pump' | 'sprinkler';

const ambients: Partial<Record<AmbientId, GainNode>> = {};
const ambientLevels: Partial<Record<AmbientId, number>> = {};
let noise: AudioBuffer | null = null;

/** Two seconds of white noise, looped by every noisy ambient. */
function noiseBuffer(): AudioBuffer | null {
  if (!ctx) return null;
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function loopNoise(filterType: BiquadFilterType, freq: number, q: number, volume: number, into: AudioNode) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(into);
  // Start each loop at a different point so layered noises never phase.
  src.start(0, Math.random() * 2);
}

/** A slow wobble on a gain: value ± depth at `rate` Hz. */
function wobble(param: AudioParam, value: number, depth: number, rate: number) {
  if (!ctx) return;
  param.value = value;
  const lfo = ctx.createOscillator();
  const amount = ctx.createGain();
  lfo.frequency.value = rate;
  amount.gain.value = depth;
  lfo.connect(amount).connect(param);
  lfo.start();
}

function createAmbient(id: AmbientId): GainNode | null {
  if (!ctx || !master) return null;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(master);
  if (id === 'pump') {
    // An electric motor: a low saw + sub, low-passed, with the fast flutter of its windings…
    const motor = ctx.createGain();
    wobble(motor.gain, 0.75, 0.2, 23);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 420;
    lowpass.Q.value = 1.2;
    const voices: [OscillatorType, number, number][] = [
      ['sawtooth', 100, 0.3],
      ['sine', 50, 0.55],
      ['triangle', 200.6, 0.12],
    ];
    voices.forEach(([type, freq, volume]) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = volume;
      osc.connect(gain).connect(lowpass);
      osc.start();
    });
    lowpass.connect(motor).connect(out);
    // …and water rushing through the pipes.
    loopNoise('bandpass', 520, 0.9, 0.35, out);
  } else {
    // Spray: a bright hiss that swells as the heads sweep round, over a softer patter on the leaves.
    const sweep = ctx.createGain();
    wobble(sweep.gain, 0.7, 0.3, 0.45);
    loopNoise('highpass', 2600, 0.7, 0.45, sweep);
    loopNoise('bandpass', 5200, 1.4, 0.25, sweep);
    sweep.connect(out);
    loopNoise('bandpass', 1100, 0.8, 0.16, out);
  }
  return out;
}

/**
 * Set an ambient loop's level (0 = silent). Called every frame by the world; it only
 * touches the audio graph when the level actually changes, and glides between levels.
 */
export function setAmbient(id: AmbientId, level: number) {
  if (!ctx) return;
  const last = ambientLevels[id] ?? 0;
  if (Math.abs(level - last) < 0.005) return;
  const gain = ambients[id] ?? (level > 0 ? (ambients[id] = createAmbient(id) ?? undefined) : undefined);
  if (!gain) return;
  ambientLevels[id] = level;
  gain.gain.setTargetAtTime(level, ctx.currentTime, 0.2);
}

/** Current ambient levels (for the `?debug` API). */
export function getAmbientLevels(): Partial<Record<AmbientId, number>> {
  return { ...ambientLevels };
}

export function playSound(id: SoundId) {
  if (!ctx || muted) return;
  switch (id) {
    case 'blip':
      tone(660, 0, 0.06, 'triangle', 0.15);
      break;
    case 'select':
      tone(520, 0, 0.08, 'triangle', 0.25);
      tone(780, 0.05, 0.1, 'triangle', 0.2);
      break;
    case 'open':
      tone(400, 0, 0.12, 'sine', 0.25, 640);
      break;
    case 'close':
      tone(560, 0, 0.1, 'sine', 0.2, 360);
      break;
    case 'door':
      // wooden creak + latch + soft chime
      tone(180, 0, 0.35, 'triangle', 0.18, 120);
      noiseTick(0.12);
      tone(880, 0.22, 0.25, 'sine', 0.12);
      tone(1175, 0.3, 0.35, 'sine', 0.1);
      break;
    case 'clue':
      [784, 988, 1319].forEach((f, i) => tone(f, i * 0.07, 0.35, 'sine', 0.25));
      break;
    case 'nudge':
      tone(330, 0, 0.18, 'triangle', 0.22);
      tone(294, 0.12, 0.22, 'triangle', 0.18);
      break;
    case 'step':
      noiseTick(0.06);
      break;
    case 'upload':
      for (let i = 0; i < 6; i++) tone(900 + i * 60, i * 0.08, 0.05, 'square', 0.05);
      break;
    case 'success':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.5, 'triangle', 0.25));
      break;
    case 'gem':
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(f, i * 0.06, 0.7, 'sine', 0.2));
      tone(262, 0, 1.2, 'sine', 0.2);
      break;
    case 'unlock':
      // wooden clunk as the barrier lets go, then a rising fanfare as it swings up
      tone(150, 0, 0.25, 'triangle', 0.22, 95);
      noiseTick(0.1);
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35 + i * 0.11, 0.6, 'triangle', 0.18));
      tone(196, 0.35, 1.4, 'sine', 0.16);
      break;
  }
}
