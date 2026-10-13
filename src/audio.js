const D_MIXO = [146.83, 164.81, 185.0, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 369.99, 392.0, 440.0];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.nextNote = 0;
    this.progress = 0;
    this.lastStep = 0;
  }
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = 0.55;
    this.music.connect(this.master);
    this.echo = c.createDelay(1);
    this.echo.delayTime.value = 0.38;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const ef = c.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 2200;
    this.echo.connect(ef).connect(fb).connect(this.echo);
    ef.connect(this.music);
    const buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate),
      d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const white = c.createBuffer(1, c.sampleRate * 2, c.sampleRate),
      wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this.whiteBuf = white;
    const loop = (b) => {
      const s = c.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.start();
      return s;
    };
    this.seaGain = c.createGain();
    this.seaGain.gain.value = 0.5;
    const seaF = c.createBiquadFilter();
    seaF.type = 'lowpass';
    seaF.frequency.value = 520;
    loop(buf).connect(seaF).connect(this.seaGain).connect(this.master);
    const lfo = c.createOscillator(),
      lfoG = c.createGain();
    lfo.frequency.value = 0.09;
    lfoG.gain.value = 0.22;
    lfo.connect(lfoG).connect(this.seaGain.gain);
    lfo.start();
    this.windGain = c.createGain();
    this.windGain.gain.value = 0.02;
    this.windF = c.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.frequency.value = 700;
    this.windF.Q.value = 0.8;
    loop(white).connect(this.windF).connect(this.windGain).connect(this.master);
    this.rushGain = c.createGain();
    this.rushGain.gain.value = 0;
    const rf = c.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 1400;
    loop(white).connect(rf).connect(this.rushGain).connect(this.master);
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0;
    const df = c.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 420;
    for (const [f, type] of [
      [73.42, 'sawtooth'],
      [110, 'triangle'],
      [146.83, 'sine'],
    ]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = Math.random() * 6 - 3;
      o.connect(df);
      o.start();
    }
    df.connect(this.droneGain).connect(this.music);
    this.droneGain.gain.linearRampToValueAtTime(0.05, c.currentTime + 4);
    this.songGain = c.createGain();
    this.songGain.gain.value = 0;
    const so = c.createOscillator();
    so.frequency.value = 587.33;
    const vib = c.createOscillator(),
      vg = c.createGain();
    vib.frequency.value = 5;
    vg.gain.value = 9;
    vib.connect(vg).connect(so.frequency);
    vib.start();
    const so2 = c.createOscillator();
    so2.frequency.value = 880;
    so2.connect(this.songGain);
    so.connect(this.songGain);
    this.songGain.connect(this.echo);
    this.songGain.connect(this.master);
    so.start();
    so2.start();
    this.songMel = 0;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  get t() {
    return this.ctx.currentTime;
  }
  tone(freq, when = 0, dur = 0.3, type = 'sine', vol = 0.1, dest = this.sfx, attack = 0.01) {
    if (!this.ctx) return;
    const c = this.ctx,
      t0 = c.currentTime + when,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }
  noise(when, dur, freq, vol, type = 'lowpass', sweepTo = null) {
    if (!this.ctx) return;
    const c = this.ctx,
      t0 = c.currentTime + when,
      s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = this.whiteBuf;
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t0);
    s.stop(t0 + dur + 0.05);
  }
  pluck(freq, when = 0, vol = 0.07) {
    if (!this.ctx) return;
    this.tone(freq, when, 1.8, 'sine', vol, this.music, 0.005);
    this.tone(freq * 2, when, 0.9, 'triangle', vol * 0.25, this.music, 0.005);
    this.tone(freq, when, 1.4, 'sine', vol * 0.5, this.echo, 0.005);
  }
  bell(freq, when = 0, vol = 0.12) {
    for (const [m, v, d] of [
      [1, 1, 3.5],
      [2.76, 0.45, 2.2],
      [5.4, 0.25, 1.4],
      [8.93, 0.12, 0.9],
    ])
      this.tone(freq * m, when, d, 'sine', vol * v, this.sfx, 0.004);
  }
  start() {
    [293.66, 369.99, 440, 587.33].forEach((f, i) => this.pluck(f, i * 0.12, 0.09));
  }
  collect(n) {
    const base = [440, 493.88, 554.37, 587.33, 659.25, 739.99, 880][Math.min(n - 1, 6)];
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(base * m, i * 0.07, 0.6, 'sine', 0.07));
    this.noise(0, 0.5, 6000, 0.05, 'highpass');
  }
  impact(s) {
    this.noise(0, 0.35 + s * 0.02, 380, Math.min(0.35, 0.08 + s * 0.02));
    this.tone(70, 0, 0.35, 'sine', Math.min(0.3, 0.05 + s * 0.02));
  }
  boost() {
    this.noise(0, 0.6, 600, 0.09, 'bandpass', 2600);
  }
  ui() {
    this.tone(660, 0, 0.12, 'triangle', 0.04);
  }
  talk() {
    [0, 0.06, 0.12].forEach((w) => this.tone(380 + Math.random() * 160, w, 0.09, 'triangle', 0.025));
  }
  quest() {
    [392, 493.88, 587.33].forEach((f, i) => this.pluck(f, i * 0.14, 0.1));
  }
  ring(i) {
    this.bell(523.25 * Math.pow(2, i / 6), 0, 0.08);
  }
  fail() {
    [392, 349.23, 293.66].forEach((f, i) => this.tone(f, i * 0.16, 0.35, 'triangle', 0.06));
  }
  discover() {
    this.pluck(587.33, 0, 0.06);
    this.pluck(880, 0.18, 0.05);
  }
  arrive() {
    this.bell(293.66, 0, 0.14);
  }
  ignite() {
    this.bell(146.83, 0, 0.2);
    this.bell(220, 0.5, 0.14);
    this.bell(293.66, 1.1, 0.14);
    [293.66, 369.99, 440, 587.33, 739.99, 880, 1174.66].forEach((f, i) => this.pluck(f, 1.6 + i * 0.16, 0.11));
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(0.11, this.t, 1.5);
  }
  queimada() {
    this.noise(0, 2.2, 300, 0.18, 'lowpass', 1800);
    [293.66, 349.23, 440].forEach((f, i) => this.tone(f, 0.3 + i * 0.25, 1.4, 'sine', 0.06));
  }
  update(_dt, { speed = 0, boosting = false, progress = 0, playing = false, song = 0 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx,
      k = Math.min(1, speed / 20);
    this.windGain.gain.setTargetAtTime(0.025 + k * 0.09 + (boosting ? 0.07 : 0), c.currentTime, 0.3);
    this.windF.frequency.setTargetAtTime(500 + k * 900, c.currentTime, 0.3);
    this.rushGain.gain.setTargetAtTime(k * 0.045 + (boosting ? 0.03 : 0), c.currentTime, 0.2);
    this.songGain.gain.setTargetAtTime(song * 0.035, c.currentTime, 0.3);
    if (playing && c.currentTime > this.nextNote) {
      const density = 0.25 + progress * 0.55;
      const root = Math.floor(Math.random() * 5);
      const phrase = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < phrase; i++)
        this.pluck(D_MIXO[Math.min(D_MIXO.length - 1, root + i * (Math.random() < 0.5 ? 2 : 1) + 2)], i * 0.42, 0.045);
      this.nextNote = c.currentTime + phrase * 0.42 + (2.5 + Math.random() * 5) / density;
    }
  }
}
