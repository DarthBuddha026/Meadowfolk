/**
 * Background music: a cozy farm-life tune, synthesized like every other sound. A swung
 * 88 bpm piece in G major — plucked-guitar arpeggios, a soft bass, an ocarina melody,
 * shaker and woodblock, a glockenspiel sparkle — in a small room reverb. It loops a
 * 64-bar form (A B A' B, where A' drops the melody for the glockenspiel), scheduled a
 * little ahead of the audio clock so the timing never depends on frame rate.
 */

const BPM = 88;
const EIGHTH = 60 / BPM / 2;
/** Swung eighths: the first of each pair takes this share of the beat. */
const SWING = 0.6;
const LOOKAHEAD = 0.3;
const TICK_MS = 60;

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Chords by bar (root midi in octave 3, quality). Two chords in a bar split it in half. */
type Chord = [root: number, minor: boolean];
const G: Chord = [55, false];
const Em: Chord = [52, true];
const C: Chord = [48, false];
const D: Chord = [50, false];
const Am: Chord = [57, true];
const SECTION_A: Chord[][] = [[G], [Em], [C], [D], [G], [Em], [C, D], [G]];
const SECTION_B: Chord[][] = [[C], [G], [Am], [Em], [C], [G], [Am], [D]];

/** Melody notes per bar: [start in eighths, midi, length in eighths]. */
type Note = [at: number, midi: number, len: number];
const MELODY_A: Note[][] = [
  [[0, 71, 2], [2, 74, 2], [4, 76, 1], [5, 74, 1], [6, 71, 2]],
  [[0, 67, 2], [2, 71, 2], [4, 69, 4]],
  [[0, 72, 2], [2, 71, 1], [3, 69, 1], [4, 67, 2], [6, 64, 2]],
  [[0, 66, 2], [2, 69, 2], [4, 74, 4]],
  [[0, 71, 2], [2, 74, 2], [4, 79, 2], [6, 78, 1], [7, 76, 1]],
  [[0, 74, 2], [2, 71, 2], [4, 76, 4]],
  [[0, 72, 2], [2, 71, 2], [4, 69, 2], [6, 66, 2]],
  [[0, 67, 6]],
];
const MELODY_B: Note[][] = [
  [[0, 76, 3], [3, 74, 1], [4, 72, 2], [6, 76, 2]],
  [[0, 79, 3], [3, 76, 1], [4, 74, 4]],
  [[0, 72, 2], [2, 74, 2], [4, 76, 2], [6, 72, 2]],
  [[0, 71, 6]],
  [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 76, 2]],
  [[0, 74, 2], [2, 71, 2], [4, 67, 4]],
  [[0, 69, 2], [2, 72, 2], [4, 71, 2], [6, 69, 2]],
  [[0, 74, 4], [4, 66, 2], [6, 69, 2]],
];
const FORM: { chords: Chord[][]; melody: Note[][] | null }[] = [
  { chords: SECTION_A, melody: MELODY_A },
  { chords: SECTION_B, melody: MELODY_B },
  { chords: SECTION_A, melody: null },
  { chords: SECTION_B, melody: MELODY_B },
];
const BARS = FORM.length * 8;

/** Guitar picking pattern over a bar, as chord-tone indices (0 root, 1 third, 2 fifth, 3 octave…). */
const PICK = [0, 2, 3, 2, 4, 2, 3, 2];
const chordTone = ([root, minor]: Chord, i: number) => {
  const steps = [0, minor ? 3 : 4, 7];
  return root + 12 * Math.floor(i / 3) + steps[i % 3];
};

export interface Music {
  stop(): void;
}

export function startMusic(ctx: AudioContext, out: AudioNode): Music {
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 4);
  bus.connect(out);

  // A short, soft room: decaying noise as the impulse response.
  const reverb = ctx.createConvolver();
  const irLen = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / irLen) ** 3;
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  reverb.connect(wet).connect(bus);
  /** Every instrument plays into this: straight to the bus and into the reverb. */
  const mix = ctx.createGain();
  mix.connect(bus);
  mix.connect(reverb);

  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  /** A gain that swells to `peak` and dies away, feeding `into`. */
  function envelope(t: number, attack: number, peak: number, decay: number, into: AudioNode = mix) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(into);
    return g;
  }

  function osc(type: OscillatorType, freq: number, t: number, end: number, into: AudioNode) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(into);
    o.start(t);
    o.stop(end);
    return o;
  }

  /** Nylon-ish pluck: bright attack that mellows as it rings. */
  function pluck(midi: number, t: number, volume: number) {
    const f = midiHz(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(700, t + 0.5);
    filter.connect(envelope(t, 0.004, volume, 1.1));
    osc('triangle', f, t, t + 1.2, filter);
    // A short buzz of string on the attack.
    osc('sawtooth', f * 1.002, t, t + 0.2, envelope(t, 0.002, 0.25, 0.15, filter));
  }

  function bass(midi: number, t: number, len: number) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.connect(envelope(t, 0.02, 0.32, len));
    osc('triangle', midiHz(midi), t, t + len + 0.1, filter);
    osc('sine', midiHz(midi), t, t + len + 0.1, filter);
  }

  /** Ocarina: a round sine with a breath of noise on the attack and a late, gentle vibrato. */
  function ocarina(midi: number, t: number, len: number) {
    const f = midiHz(midi);
    const end = t + len;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.setTargetAtTime(0.12, t + 0.05, 0.3);
    g.gain.setTargetAtTime(0.0001, end - 0.05, 0.06);
    g.connect(mix);
    const tone = osc('sine', f, t, end + 0.4, g);
    osc('sine', f * 2, t, end + 0.4, envelope(t, 0.05, 0.06, len, g));
    const vib = ctx.createOscillator();
    const depth = ctx.createGain();
    vib.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.004, t + Math.min(0.5, len));
    vib.connect(depth).connect(tone.frequency);
    vib.start(t);
    vib.stop(end + 0.4);
    const breath = ctx.createBufferSource();
    breath.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    breath.connect(bp).connect(envelope(t, 0.01, 0.03, 0.12));
    breath.start(t, Math.random() * 0.1, 0.15);
  }

  function glock(midi: number, t: number) {
    const f = midiHz(midi);
    osc('sine', f, t, t + 1.6, envelope(t, 0.002, 0.07, 1.5));
    osc('sine', f * 2.76, t, t + 0.4, envelope(t, 0.002, 0.02, 0.3));
  }

  function shaker(t: number, volume: number) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    src.connect(hp).connect(envelope(t, 0.008, volume, 0.06));
    src.start(t, Math.random() * 0.15, 0.1);
  }

  function woodblock(t: number) {
    osc('sine', 820, t, t + 0.1, envelope(t, 0.001, 0.09, 0.05));
  }

  /** A muffled kick, like a foot tapping on a wooden porch. */
  function thump(t: number) {
    const o = osc('sine', 110, t, t + 0.25, envelope(t, 0.003, 0.22, 0.18));
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.15);
  }

  /** Schedule one swung eighth note of the piece. */
  function playStep(step: number, t: number) {
    const bar = Math.floor(step / 8) % BARS;
    const pos = step % 8;
    const section = FORM[Math.floor(bar / 8)];
    const chords = section.chords[bar % 8];
    const chord = chords[Math.min(chords.length - 1, Math.floor(pos / (8 / chords.length)))];

    pluck(chordTone(chord, PICK[pos]), t, pos === 0 ? 0.14 : 0.1);
    if (pos === 0) bass(chord[0] - 12, t, EIGHTH * 3);
    if (pos === 4) bass(chordTone(chord, chords.length > 1 ? 0 : 2) - 12, t, EIGHTH * 2.5);
    if (pos % 2 === 1) shaker(t, pos === 3 || pos === 7 ? 0.05 : 0.035);
    if (pos === 0 || pos === 4) thump(t);
    if (pos === 6 && bar % 2 === 1) woodblock(t);

    if (section.melody) {
      for (const [at, midi, len] of section.melody[bar % 8]) {
        if (at === pos) ocarina(midi, t, len * EIGHTH * 0.95);
      }
    } else if (pos === 0 || pos === 3) {
      glock(chordTone(chord, pos === 0 ? 3 + (bar % 3) : 5) + 12, t);
    }
  }

  let step = 0;
  let next = ctx.currentTime + 0.1;
  const timer = window.setInterval(() => {
    // After a throttled background tab, skip ahead instead of firing a burst of late notes.
    if (next < ctx.currentTime - 0.1) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + LOOKAHEAD) {
      const swing = step % 2 === 1 ? (SWING - 0.5) * 2 * EIGHTH : 0;
      playStep(step, next + swing);
      next += EIGHTH;
      step++;
    }
  }, TICK_MS);

  return {
    stop() {
      window.clearInterval(timer);
      bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      window.setTimeout(() => bus.disconnect(), 2000);
    },
  };
}
