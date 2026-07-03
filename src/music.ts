// Generative chill ambient music, synthesized live with WebAudio.
// No samples, no downloads — royalty-free by construction.

const PREF_KEY = 'wildlife-polaroid-music-vol';
const BASE_GAIN = 0.16;

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// gentle D-major-ish pads, slow four-chord loop
const CHORDS: number[][] = [
  [50, 57, 61, 66], // D  A  C# F#
  [47, 54, 62, 66], // B  F# D  F#
  [43, 55, 59, 66], // G  G  B  F#
  [45, 52, 61, 64], // A  E  C# E
];
const PENTATONIC = [62, 64, 66, 69, 71, 74, 76, 78]; // D E F# A B up two octaves

export class AmbientMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private delay: DelayNode | null = null;
  private chordTimer = 0;
  private pluckTimer = 0;
  private chordIx = 0;
  private raf = 0;
  private lastT = 0;
  volume: number; // 0..1

  constructor() {
    const stored = Number(localStorage.getItem(PREF_KEY));
    this.volume = Number.isFinite(stored) && localStorage.getItem(PREF_KEY) !== null ? Math.min(1, Math.max(0, stored)) : 0.7;
  }

  get enabled(): boolean {
    return this.volume > 0.01;
  }

  /** Call from a user gesture (browsers require one to start audio). */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = BASE_GAIN * this.volume;
      const soften = this.ctx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 2400;
      this.master.connect(soften).connect(this.ctx.destination);

      // a touch of echo makes the plucks feel like they're outdoors
      this.delay = this.ctx.createDelay(1.5);
      this.delay.delayTime.value = 0.42;
      const fb = this.ctx.createGain();
      fb.gain.value = 0.35;
      this.delay.connect(fb).connect(this.delay);
      this.delay.connect(this.master);

      this.lastT = performance.now();
      const tick = () => {
        this.raf = requestAnimationFrame(tick);
        const now = performance.now();
        const dt = (now - this.lastT) / 1000;
        this.lastT = now;
        if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
        this.chordTimer -= dt;
        this.pluckTimer -= dt;
        if (this.chordTimer <= 0) {
          this.chordTimer = 9;
          this.playChord(CHORDS[this.chordIx % CHORDS.length]);
          this.chordIx++;
        }
        if (this.pluckTimer <= 0) {
          this.pluckTimer = 2.2 + Math.random() * 4.5;
          this.pluck(PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]);
        }
      };
      tick();
    } catch {
      this.ctx = null; // no audio? the game plays on in silence
    }
  }

  private playChord(notes: number[]) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      osc.type = Math.random() < 0.5 ? 'sine' : 'triangle';
      osc.frequency.value = midiHz(n);
      osc.detune.value = (Math.random() - 0.5) * 10;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 3.2); // slow swell
      g.gain.exponentialRampToValueAtTime(0.0001, t + 10.5); // long fade
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 11);
    }
  }

  private pluck(note: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiHz(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g);
    g.connect(this.master!);
    g.connect(this.delay!);
    osc.start(t);
    osc.stop(t + 1.7);
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem(PREF_KEY, String(this.volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(BASE_GAIN * this.volume, this.ctx.currentTime, 0.25);
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }
}
