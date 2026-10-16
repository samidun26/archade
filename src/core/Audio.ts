// Procedural 1930s soundtrack + cartoon sound effects, all synthesized with Web Audio.
// The sequencer also provides the musical beat clock that the world dances to.

type Note = [pos: number, len: number, midi: number]; // pos/len in eighth notes within a bar

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ songs
interface Song {
  bpm: number;
  swing: number;
  chords: number[][]; // per bar: midi notes (root first)
  melody: Note[][]; // per bar
  style: 'rag' | 'hot' | 'waltz';
}

const F = [53, 57, 60, 65];
const D7 = [50, 54, 57, 60];
const G7 = [55, 59, 62, 65];
const C7 = [48, 52, 55, 58];
const Bb = [46, 50, 53, 58];
const Bdim = [47, 50, 53, 56];
const F7 = [53, 57, 60, 63];

// "Ballyhoo Rag" (original): A A B A form in F major
const ragA: Note[][] = [
  [[0, 1, 72], [1, 1, 69], [2, 1, 72], [3, 2, 77], [5, 1, 81], [6, 2, 77]],
  [[0, 2, 78], [2, 1, 76], [3, 1, 74], [4, 2, 72], [6, 2, 69]],
  [[0, 1, 71], [1, 1, 74], [2, 1, 77], [3, 2, 79], [5, 1, 77], [6, 1, 74], [7, 1, 71]],
  [[0, 2, 72], [2, 1, 76], [3, 1, 79], [4, 3, 82], [7, 1, 81]],
  [[0, 1, 72], [1, 1, 69], [2, 1, 72], [3, 2, 77], [5, 1, 81], [6, 2, 77]],
  [[0, 1, 78], [1, 1, 81], [2, 2, 84], [4, 1, 81], [5, 1, 78], [6, 2, 74]],
  [[0, 1, 79], [1, 1, 77], [2, 1, 74], [3, 1, 71], [4, 1, 72], [5, 1, 76], [6, 1, 79], [7, 1, 76]],
  [[0, 4, 77], [4, 1, 72], [5, 1, 69], [6, 2, 65]],
];
const ragB: Note[][] = [
  [[0, 2, 74], [2, 1, 77], [3, 1, 82], [4, 2, 81], [6, 2, 77]],
  [[0, 2, 74], [2, 1, 77], [3, 1, 80], [4, 2, 83], [6, 2, 80]],
  [[0, 1, 81], [1, 1, 79], [2, 1, 77], [3, 1, 76], [4, 2, 77], [6, 2, 72]],
  [[0, 2, 78], [2, 2, 81], [4, 2, 84], [6, 2, 81]],
  [[0, 3, 79], [3, 1, 77], [4, 1, 74], [5, 1, 71], [6, 2, 74]],
  [[0, 1, 79], [1, 1, 81], [2, 1, 79], [3, 1, 77], [4, 4, 74]],
  [[0, 1, 76], [1, 1, 79], [2, 1, 82], [3, 1, 84], [4, 2, 82], [6, 2, 79]],
  [[0, 1, 76], [1, 1, 74], [2, 1, 72], [3, 1, 70], [4, 2, 67], [6, 2, 72]],
];
const chordsA = [F, D7, G7, C7, F, D7, G7, F];
const chordsB = [Bb, Bdim, F, D7, G7, G7, C7, C7];

const RAG: Song = {
  bpm: 128,
  swing: 0.62,
  style: 'rag',
  chords: [...chordsA, ...chordsA, ...chordsB, ...chordsA],
  melody: [...ragA, ...ragA.map((b, i) => (i === 7 ? [[0, 2, 77], [2, 1, 81], [3, 1, 84], [4, 4, 89]] as Note[] : b)), ...ragB, ...ragA],
};

// "Baron's Bluster" (original): hot jazz in D minor for the boss
const Dm = [50, 53, 57, 62];
const Gm = [55, 58, 62, 67];
const A7 = [45, 49, 52, 55];
const Bb7 = [46, 50, 53, 56];
const hotMel: Note[][] = [
  [[0, 1, 74], [1, 1, 77], [2, 1, 81], [3, 1, 86], [4, 1, 84], [5, 1, 81], [6, 2, 77]],
  [[0, 1, 76], [1, 1, 77], [2, 1, 76], [3, 1, 74], [4, 2, 73], [6, 2, 69]],
  [[0, 1, 73], [1, 1, 76], [2, 1, 79], [3, 1, 81], [4, 1, 82], [5, 1, 81], [6, 1, 79], [7, 1, 76]],
  [[0, 3, 81], [3, 1, 79], [4, 1, 77], [5, 1, 76], [6, 2, 73]],
  [[0, 1, 74], [1, 1, 77], [2, 1, 81], [3, 1, 86], [4, 1, 84], [5, 1, 81], [6, 2, 77]],
  [[0, 1, 79], [1, 1, 82], [2, 1, 86], [3, 1, 82], [4, 2, 79], [6, 2, 74]],
  [[0, 1, 76], [1, 1, 79], [2, 1, 82], [3, 1, 85], [4, 2, 88], [6, 2, 85]],
  [[0, 2, 86], [2, 1, 81], [3, 1, 77], [4, 4, 74]],
];
const HOT: Song = {
  bpm: 172,
  swing: 0.58,
  style: 'hot',
  chords: [Dm, Dm, A7, A7, Dm, Gm, A7, Dm, Gm, Gm, Dm, Dm, Bb7, A7, Dm, A7],
  melody: [...hotMel, ...hotMel.map((b) => b.map(([p, l, n]) => [p, l, n + (p % 2 ? 0 : 0)] as Note))],
};

// "Picture Show Waltz" (original) for the title + finale
const WALTZ: Song = {
  bpm: 132,
  swing: 0.5,
  style: 'waltz',
  chords: [F, F, C7, C7, C7, C7, F, F, F7, Bb, F, D7, G7, C7, F, F],
  melody: [
    [[0, 4, 77], [4, 2, 76]],
    [[0, 4, 74], [4, 2, 72]],
    [[0, 2, 70], [2, 2, 72], [4, 2, 76]],
    [[0, 6, 79]],
    [[0, 4, 79], [4, 2, 77]],
    [[0, 4, 76], [4, 2, 74]],
    [[0, 2, 72], [2, 2, 76], [4, 2, 79]],
    [[0, 6, 77]],
    [[0, 4, 81], [4, 2, 79]],
    [[0, 4, 77], [4, 2, 74]],
    [[0, 2, 72], [2, 2, 77], [4, 2, 81]],
    [[0, 6, 78]],
    [[0, 4, 79], [4, 2, 77]],
    [[0, 2, 76], [2, 2, 74], [4, 2, 72]],
    [[0, 6, 77]],
    [[0, 6, 77]],
  ],
};

export type TrackName = 'rag' | 'hot' | 'waltz' | 'none';
export interface Mix {
  drums: number;
  piano: number;
  bass: number;
  lead: number;
  bells: number;
}
const MIX_TOWN: Mix = { drums: 1, piano: 1, bass: 1, lead: 1, bells: 0 };

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private crackle: AudioBufferSourceNode | null = null;
  private song: Song = RAG;
  private track: TrackName = 'none';
  private nextBar = 0;
  private barIndex = 0;
  private startTime = 0;
  private timer: number | null = null;
  private mix: Mix = { ...MIX_TOWN };
  private targetMix: Mix = { ...MIX_TOWN };
  private tempoScale = 1;
  musicVol = 0.7;
  sfxVol = 0.8;
  muted = false;
  private fallbackStart = performance.now();
  private lastBeat = 0;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    // a gentle "old radio" tone on the music
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    this.musicBus.connect(tone).connect(this.master);
    this.sfxBus.connect(this.master);
    this.applyVolumes();
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startCrackle();
    if (this.track !== 'none') this.startSong(this.track, true);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : this.musicVol * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.muted ? 0 : this.sfxVol * 0.9, t, 0.05);
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  setMix(m: Partial<Mix>) {
    this.targetMix = { ...MIX_TOWN, ...m };
  }

  setTempoScale(s: number) {
    this.tempoScale = s;
  }

  /** Musical beat counter (quarter notes) — drives the world's bounce. */
  get beat() {
    if (!this.ctx || this.track === 'none') {
      return ((performance.now() - this.fallbackStart) / 1000) * (128 / 60);
    }
    const spb = 60 / (this.song.bpm * this.tempoScale);
    const b = (this.ctx.currentTime - this.startTime) / spb;
    this.lastBeat = b;
    return b;
  }

  play(track: TrackName) {
    if (track === this.track) return;
    this.track = track;
    if (!this.ctx) return;
    this.startSong(track, false);
  }

  private startSong(track: TrackName, fresh: boolean) {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (track === 'none' || !this.ctx) return;
    this.song = track === 'hot' ? HOT : track === 'waltz' ? WALTZ : RAG;
    this.barIndex = 0;
    const now = this.ctx.currentTime + (fresh ? 0.1 : 0.15);
    this.startTime = now;
    this.nextBar = now;
    this.timer = window.setInterval(() => this.schedule(), 40);
    this.schedule();
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    // ease the mix toward the zone's target once per scheduling tick
    for (const k of Object.keys(this.mix) as (keyof Mix)[]) this.mix[k] += (this.targetMix[k] - this.mix[k]) * 0.15;
    const beatsPerBar = this.song.style === 'waltz' ? 3 : 4;
    const spb = 60 / (this.song.bpm * this.tempoScale);
    while (this.nextBar < ctx.currentTime + 0.25) {
      this.playBar(this.nextBar, this.barIndex % this.song.chords.length, spb);
      this.nextBar += spb * beatsPerBar;
      this.barIndex++;
    }
  }

  private eighth(bar: number, pos: number, spb: number) {
    // swing: odd eighths are pushed late
    const beat = Math.floor(pos / 2);
    const off = pos % 2 === 1 ? this.song.swing : 0;
    return bar + (beat + off) * spb;
  }

  private playBar(t0: number, i: number, spb: number) {
    const s = this.song;
    const chord = s.chords[i];
    const mel = s.melody[i % s.melody.length] ?? [];
    const mx = this.mix;
    if (s.style === 'waltz') {
      // oom-pah-pah
      this.tuba(t0, chord[0] - 12, spb * 0.9, 0.5 * mx.bass);
      for (const b of [1, 2]) for (const n of chord.slice(1)) this.piano(t0 + b * spb, n + 12, spb * 0.6, 0.12 * mx.piano);
      for (const [p, l, n] of mel) this.clarinet(t0 + (p / 2) * spb, n, (l / 2) * spb * 0.95, 0.16 * mx.lead);
      for (const [p, , n] of mel) if (mx.bells > 0.05) this.bell(t0 + (p / 2) * spb, n + 12, 0.08 * mx.bells);
      if (mx.drums > 0.05) {
        this.brush(t0 + spb, 0.06 * mx.drums);
        this.brush(t0 + 2 * spb, 0.05 * mx.drums);
      }
      return;
    }
    const hot = s.style === 'hot';
    // stride left hand: bass on 1 & 3 (root, then fifth), chord stabs on 2 & 4
    const root = chord[0];
    const fifth = chord[2] ?? root + 7;
    if (hot) {
      // walking bass
      const walk = [root, root + 3, fifth - 12 + 12, root + 10];
      for (let b = 0; b < 4; b++) this.tuba(t0 + b * spb, (b === 2 ? fifth : walk[b]) - 12, spb * 0.8, 0.42 * mx.bass);
    } else {
      this.tuba(t0, root - 12, spb * 0.9, 0.48 * mx.bass);
      this.tuba(t0 + 2 * spb, fifth - 24, spb * 0.9, 0.42 * mx.bass);
    }
    this.piano(t0, root - 12, spb * 0.8, 0.22 * mx.piano);
    this.piano(t0 + 2 * spb, fifth - 12, spb * 0.8, 0.2 * mx.piano);
    for (const b of [1, 3]) for (const n of chord.slice(1)) this.piano(t0 + b * spb, n + 12, spb * 0.45, 0.11 * mx.piano);
    if (hot) for (const b of [1, 3]) this.brass(t0 + b * spb + spb * 0.5, chord.slice(1).map((n) => n + 12), spb * 0.35, 0.07 * mx.lead);
    // melody
    for (const [p, l, n] of mel) {
      const t = this.eighth(t0, p, spb);
      const dur = (l / 2) * spb * 0.92;
      if (mx.lead > 0.02) this.clarinet(t, n, dur, (hot ? 0.15 : 0.14) * mx.lead);
      if (mx.bells > 0.02) this.bell(t, n + 12, 0.1 * mx.bells);
    }
    // drums
    if (mx.drums > 0.02) {
      const d = mx.drums;
      this.kick(t0, 0.5 * d);
      this.kick(t0 + 2 * spb, 0.4 * d);
      this.brush(t0 + spb, 0.12 * d);
      this.brush(t0 + 3 * spb, 0.12 * d);
      for (let e = 0; e < 8; e++) this.hat(this.eighth(t0, e, spb), (e % 2 ? 0.035 : 0.05) * d);
      if (i % 4 === 3) this.woodblock(this.eighth(t0, 7, spb), 0.12 * d);
      if (hot && i % 8 === 7) this.cymbal(t0 + 3 * spb, 0.12 * d);
    }
  }

  // ------------------------------------------------------------------ instruments
  private env(g: GainNode, t: number, a: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  private piano(t: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 6), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + dur + 0.3);
    g.connect(lp).connect(this.musicBus);
    for (const [type, mult, amp] of [
      ['triangle', 1, 1],
      ['sine', 2, 0.35],
      ['square', 1.003, 0.08],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
    this.env(g, t, 0.004, vel, dur + 0.4);
  }

  private tuba(t: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 2;
    const g = ctx.createGain();
    o.connect(lp).connect(g).connect(this.musicBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.03);
    g.gain.setTargetAtTime(vel * 0.6, t + 0.05, 0.1);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.8, 0.05);
    o.start(t);
    o.stop(t + dur + 0.4);
  }

  private clarinet(t: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.6;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.3, dur));
    vib.connect(vg).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(4200, f * 3.2);
    lp.Q.value = 1.2;
    const g = ctx.createGain();
    o.connect(lp).connect(g).connect(this.musicBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.035);
    g.gain.setValueAtTime(vel * 0.9, t + Math.max(0.04, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.12);
    vib.stop(t + dur + 0.12);
  }

  private brass(t: number, notes: number[], dur: number, vel: number) {
    const ctx = this.ctx!;
    for (const n of notes) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3;
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.exponentialRampToValueAtTime(1800, t + 0.06);
      bp.frequency.exponentialRampToValueAtTime(700, t + dur);
      const g = ctx.createGain();
      o.connect(bp).connect(g).connect(this.musicBus);
      this.env(g, t, 0.02, vel, dur);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private bell(t: number, midi: number, vel: number, out?: AudioNode) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    for (const [mult, amp, dec] of [
      [1, 1, 0.9],
      [2.76, 0.4, 0.4],
      [5.4, 0.2, 0.2],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      o.connect(g).connect(out ?? this.musicBus);
      this.env(g, t, 0.003, vel * amp, dec);
      o.start(t);
      o.stop(t + dec + 0.1);
    }
  }

  private noise(t: number, dur: number, out: AudioNode, filt: BiquadFilterType, freq: number, q: number, vel: number, attack = 0.002) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filt;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(out);
    this.env(g, t, attack, vel, dur);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  private kick(t: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    o.connect(g).connect(this.musicBus);
    this.env(g, t, 0.003, vel, 0.16);
    o.start(t);
    o.stop(t + 0.2);
  }
  private brush(t: number, vel: number) {
    this.noise(t, 0.14, this.musicBus, 'bandpass', 2600, 0.7, vel, 0.01);
  }
  private hat(t: number, vel: number) {
    this.noise(t, 0.035, this.musicBus, 'highpass', 7000, 0.5, vel);
  }
  private cymbal(t: number, vel: number) {
    this.noise(t, 1.2, this.musicBus, 'highpass', 5000, 0.3, vel);
  }
  private woodblock(t: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = 820;
    const g = ctx.createGain();
    o.connect(g).connect(this.musicBus);
    this.env(g, t, 0.002, vel, 0.07);
    o.start(t);
    o.stop(t + 0.1);
  }

  private startCrackle() {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.02;
      if (Math.random() < 0.0006) d[i] = (Math.random() * 2 - 1) * 0.7;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    src.connect(hp).connect(g).connect(this.musicBus);
    src.start();
    this.crackle = src;
  }

  // ------------------------------------------------------------------ sound effects
  sfx(name: SfxName, opts: { pitch?: number; vol?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + 0.005;
    const out = this.sfxBus;
    const p = opts.pitch ?? 1;
    const v = opts.vol ?? 1;
    const sweep = (type: OscillatorType, f0: number, f1: number, dur: number, vel: number, at = t, vib = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0 * p, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * p), at + dur);
      if (vib) {
        const l = ctx.createOscillator();
        l.frequency.value = vib;
        const lg = ctx.createGain();
        lg.gain.value = f0 * p * 0.06;
        l.connect(lg).connect(o.frequency);
        l.start(at);
        l.stop(at + dur + 0.05);
      }
      const g = ctx.createGain();
      o.connect(g).connect(out);
      this.env(g, at, 0.005, vel * v, dur);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    switch (name) {
      case 'jump':
        sweep('sine', 260, 620, 0.16, 0.35, t, 18);
        sweep('triangle', 520, 1240, 0.12, 0.08);
        break;
      case 'doublejump':
        sweep('sine', 520, 1300, 0.18, 0.3, t, 24);
        this.bell(t + 0.04, 96, 0.08, out);
        break;
      case 'land':
        this.noise(t, 0.09, out, 'lowpass', 500, 1, 0.25 * v);
        sweep('sine', 140, 60, 0.1, 0.2);
        break;
      case 'step':
        sweep('triangle', 300 + Math.random() * 60, 200, 0.04, 0.06);
        break;
      case 'dash': {
        const f = this.noise(t, 0.28, out, 'bandpass', 600, 1.5, 0.4 * v, 0.03);
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
        break;
      }
      case 'bounce':
        sweep('sine', 150, 520, 0.45, 0.45, t, 14);
        sweep('triangle', 300, 1040, 0.3, 0.1);
        break;
      case 'coin':
        this.bell(t, 83, 0.18 * v, out);
        this.bell(t + 0.07, 88, 0.2 * v, out);
        break;
      case 'reel': {
        const notes = [65, 69, 72, 77, 81, 84];
        notes.forEach((n, i) => this.brassSfx(t + i * 0.09, n, 0.22, 0.16 * v));
        this.brassSfx(t + 0.6, 89, 0.9, 0.18 * v);
        this.noise(t + 0.6, 1.4, out, 'highpass', 5000, 0.3, 0.12 * v);
        break;
      }
      case 'jingle': {
        [72, 76, 79, 84].forEach((n, i) => this.bell(t + i * 0.1, n, 0.15 * v, out));
        break;
      }
      case 'lantern': {
        const f = this.noise(t, 0.4, out, 'lowpass', 300, 1, 0.4 * v, 0.06);
        f.frequency.setValueAtTime(200, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
        this.bell(t + 0.15, 84, 0.12 * v, out);
        this.bell(t + 0.25, 91, 0.1 * v, out);
        break;
      }
      case 'blip':
        sweep('square', 340, 330, 0.045, 0.06);
        break;
      case 'ui':
        sweep('triangle', 900, 900, 0.04, 0.12);
        break;
      case 'confirm':
        this.bell(t, 84, 0.14 * v, out);
        this.bell(t + 0.06, 91, 0.12 * v, out);
        break;
      case 'back':
        sweep('triangle', 500, 300, 0.08, 0.12);
        break;
      case 'splash': {
        this.noise(t, 0.5, out, 'lowpass', 1400, 0.6, 0.5 * v, 0.01);
        for (let i = 0; i < 5; i++) sweep('sine', 900 - i * 120, 500 - i * 60, 0.06, 0.08, t + 0.15 + i * 0.07);
        break;
      }
      case 'bell':
        [1, 2.4, 3.9, 5.2].forEach((m, i) => {
          const o = ctx.createOscillator();
          o.frequency.value = 520 * m * p;
          const g = ctx.createGain();
          o.connect(g).connect(out);
          this.env(g, t, 0.002, (0.3 / (i + 1)) * v, 2.2 / (i * 0.5 + 1));
          o.start(t);
          o.stop(t + 2.4);
        });
        break;
      case 'hurt':
        sweep('square', 300, 120, 0.18, 0.2);
        sweep('sine', 1200, 300, 0.6, 0.18, t + 0.1, 8);
        break;
      case 'shoot':
        sweep('square', 1100, 380, 0.07, 0.05);
        break;
      case 'hit':
        sweep('triangle', 500, 250, 0.06, 0.12);
        this.noise(t, 0.04, out, 'bandpass', 1800, 1, 0.08 * v);
        break;
      case 'super':
        sweep('sawtooth', 200, 1600, 0.6, 0.16);
        [65, 69, 72, 77].forEach((n) => this.brassSfx(t + 0.45, n + 12, 0.6, 0.1 * v));
        break;
      case 'knockout':
        [53, 57, 60, 65, 69].forEach((n) => this.brassSfx(t, n, 1.4, 0.14 * v));
        this.noise(t, 2.2, out, 'highpass', 3000, 0.3, 0.25 * v);
        sweep('sine', 80, 40, 0.6, 0.5);
        break;
      case 'thunder': {
        this.noise(t, 0.12, out, 'highpass', 2000, 0.5, 0.5 * v);
        this.noise(t + 0.05, 1.6, out, 'lowpass', 300, 0.7, 0.6 * v, 0.05);
        break;
      }
      case 'wind': {
        const f = this.noise(t, 1.6, out, 'bandpass', 500, 0.8, 0.35 * v, 0.3);
        f.frequency.setValueAtTime(300, t);
        f.frequency.linearRampToValueAtTime(900, t + 0.8);
        f.frequency.linearRampToValueAtTime(400, t + 1.6);
        break;
      }
      case 'slide':
        sweep('sine', 400, 1600, 0.4, 0.2, t, 0);
        break;
      case 'slidedown':
        sweep('sine', 1500, 300, 0.5, 0.2, t, 0);
        break;
      case 'buy':
        this.bell(t, 96, 0.2 * v, out);
        this.bell(t + 0.08, 100, 0.2 * v, out);
        this.noise(t, 0.12, out, 'highpass', 4000, 0.5, 0.1 * v);
        break;
      case 'pop':
        sweep('sine', 600, 1400, 0.08, 0.25);
        break;
      case 'boss-hit':
        sweep('square', 220, 90, 0.12, 0.12);
        break;
      case 'drop':
        sweep('sine', 900, 200, 0.25, 0.15);
        break;
      case 'card':
        this.noise(t, 0.3, out, 'highpass', 6000, 0.3, 0.15 * v);
        this.brassSfx(t, 77, 0.3, 0.12 * v);
        this.brassSfx(t + 0.12, 81, 0.5, 0.12 * v);
        break;
    }
  }

  private brassSfx(t: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.05);
    bp.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain();
    o.connect(bp).connect(g).connect(this.sfxBus);
    this.env(g, t, 0.015, vel, dur);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** NPC "voice": a short pitched blip per letter. */
  voice(base: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    const f = base * (0.85 + Math.random() * 0.35);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (0.9 + Math.random() * 0.25), t + 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    o.connect(lp).connect(g).connect(this.sfxBus);
    this.env(g, t, 0.004, 0.07 * this.sfxVol, 0.06);
    o.start(t);
    o.stop(t + 0.08);
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    this.crackle?.stop();
    this.ctx?.close();
  }

  get lastBeatValue() {
    return this.lastBeat;
  }
}

export type SfxName =
  | 'jump'
  | 'doublejump'
  | 'land'
  | 'step'
  | 'dash'
  | 'bounce'
  | 'coin'
  | 'reel'
  | 'jingle'
  | 'lantern'
  | 'blip'
  | 'ui'
  | 'confirm'
  | 'back'
  | 'splash'
  | 'bell'
  | 'hurt'
  | 'shoot'
  | 'hit'
  | 'super'
  | 'knockout'
  | 'thunder'
  | 'wind'
  | 'slide'
  | 'slidedown'
  | 'buy'
  | 'pop'
  | 'boss-hit'
  | 'drop'
  | 'card';

export const MIXES: Record<string, Partial<Mix>> = {
  town: { drums: 1, piano: 1, bass: 1, lead: 1, bells: 0 },
  docks: { drums: 0.7, piano: 0.8, bass: 1, lead: 0.9, bells: 0.3 },
  carnival: { drums: 1.2, piano: 1.1, bass: 1.1, lead: 1, bells: 0.5 },
  forest: { drums: 0, piano: 0.4, bass: 0.6, lead: 0.4, bells: 1 },
  bluff: { drums: 0.5, piano: 0.8, bass: 0.8, lead: 0.8, bells: 0.6 },
  sky: { drums: 0.3, piano: 0.6, bass: 0.6, lead: 0.7, bells: 1.0 },
};
