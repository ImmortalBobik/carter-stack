// Velvety, non-fatiguing CC0 Kenney WAV audio engine with warm studio low-pass filter

const SFX_FILES = {
  placeSoft: 'assets/sfx/switch-in.wav',
  placeWarm: 'assets/sfx/switch-out.wav',
  perfectSoft: 'assets/sfx/spark-soft.wav',
  perfectWarm: 'assets/sfx/spark-warm.wav',
  expand: 'assets/sfx/reverse.wav',
  start: 'assets/sfx/start.wav',
  missThud: 'assets/sfx/crash-thud.wav',
  missLow: 'assets/sfx/crash-low.wav'
};

// Warm musical major pentatonic pitch progression for consecutive perfect drops
const PERFECT_RATES = [0.84, 0.89, 0.94, 1.0, 1.06, 1.12, 1.19, 1.26];

export class WarmStackAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.rawCache = new Map();
    this.muted = false;
    this.preloadRaw();
  }

  preloadRaw() {
    for (const [key, url] of Object.entries(SFX_FILES)) {
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((buf) => {
          if (buf) {
            this.rawCache.set(key, buf);
            if (this.ctx) this.decodeKey(key, buf);
          }
        })
        .catch(() => {});
    }
  }

  ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();

      const warmBus = this.ctx.createBiquadFilter();
      warmBus.type = 'lowpass';
      warmBus.frequency.value = 2500;
      warmBus.Q.value = 0.65;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 22;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.18;

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.54;

      this.master.connect(warmBus);
      warmBus.connect(comp);
      comp.connect(this.ctx.destination);

      for (const [key, raw] of this.rawCache.entries()) {
        this.decodeKey(key, raw);
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  decodeKey(key, raw) {
    if (!this.ctx || this.buffers.has(key)) return;
    this.ctx.decodeAudioData(raw.slice(0))
      .then((decoded) => this.buffers.set(key, decoded))
      .catch(() => {});
  }

  playBuffer(key, { volume = 0.48, rate = 1.0, cutoff = 2100, delay = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const startAt = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(volume, startAt + 0.006);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(startAt);
  }

  playStart() {
    this.playBuffer('start', { volume: 0.42, rate: 0.94, cutoff: 1900 });
  }

  playSlice(score) {
    const rate = 0.86 + (score % 5) * 0.03;
    this.playBuffer('placeSoft', { volume: 0.44, rate, cutoff: 1650 });
  }

  playPerfect(streak, expanded = false) {
    const rate = PERFECT_RATES[Math.min(PERFECT_RATES.length - 1, Math.max(0, streak - 1))];
    this.playBuffer('perfectSoft', { volume: 0.52, rate, cutoff: 2250 });
    this.playBuffer('perfectWarm', { volume: 0.25, rate: rate * 0.94, cutoff: 1850, delay: 0.025 });
    if (expanded) {
      this.playBuffer('expand', { volume: 0.5, rate: 0.88, cutoff: 1550, delay: 0.03 });
    }
  }

  playMiss() {
    this.playBuffer('missThud', { volume: 0.52, rate: 0.82, cutoff: 1150 });
    this.playBuffer('missLow', { volume: 0.44, rate: 0.68, cutoff: 950, delay: 0.02 });
  }
}
