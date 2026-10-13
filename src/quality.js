export const LEVELS = {
  low: {
    name: 'low',
    label: 'Baixa',
    pr: 1,
    shadow: 0,
    seaSize: 560,
    seaSeg: 96,
    veg: 0.4,
    fogPuffs: 26,
    particles: 220,
  },
  medium: {
    name: 'medium',
    label: 'Media',
    pr: 1.35,
    shadow: 1024,
    seaSize: 600,
    seaSeg: 140,
    veg: 0.72,
    fogPuffs: 48,
    particles: 500,
  },
  high: {
    name: 'high',
    label: 'Alta',
    pr: 2,
    shadow: 2048,
    seaSize: 620,
    seaSeg: 190,
    veg: 1,
    fogPuffs: 72,
    particles: 900,
  },
};
const ORDER = ['low', 'medium', 'high'];

export function guessLevel() {
  const coarse = matchMedia('(pointer:coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4,
    mem = navigator.deviceMemory || 4;
  if (coarse) return mem <= 3 || cores <= 4 ? 'low' : 'medium';
  if (cores <= 2 || mem <= 2) return 'low';
  return 'high';
}

export class QualityManager {
  constructor(apply) {
    this.apply = apply;
    let saved = null;
    try {
      saved = localStorage.getItem('bretema.quality');
    } catch {}
    this.mode = saved && (saved === 'auto' || LEVELS[saved]) ? saved : 'auto';
    this.level = this.mode === 'auto' ? guessLevel() : this.mode;
    this.samples = [];
    this.downgrades = 0;
    this.window = 0;
    this.goodWindows = 0;
    this.fps = 60;
  }
  get current() {
    return LEVELS[this.level];
  }
  setMode(mode) {
    this.mode = mode;
    try {
      localStorage.setItem('bretema.quality', mode);
    } catch {}
    if (mode !== 'auto') this.set(mode);
    this.samples.length = 0;
    this.downgrades = 0;
  }
  set(level) {
    if (level === this.level) return;
    this.level = level;
    this.apply(LEVELS[level]);
  }
  sample(dtMs, active) {
    if (document.hidden || !document.hasFocus() || dtMs > 120) {
      this.samples.length = 0;
      this.window = 0;
      return;
    }
    if (dtMs > 0) this.samples.push(dtMs);
    this.window += dtMs;
    if (this.window < 2500) return;
    if (this.samples.length < 40) {
      this.samples.length = 0;
      this.window = 0;
      return;
    }
    const s = this.samples.sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / s.length,
      p90 = s[Math.floor(s.length * 0.9)];
    this.fps = 1000 / avg;
    this.samples.length = 0;
    this.window = 0;
    if (this.mode !== 'auto' || !active) return;
    if (this.probe) {
      const p = this.probe;
      this.probe = null;
      if (this.fps < p.fps * 1.12) {
        this.capped = true;
        this.set(p.from);
        return;
      }
    }
    const i = ORDER.indexOf(this.level);
    if ((avg > 23 || p90 > 34) && i > 0 && !this.capped) {
      this.probe = { from: this.level, fps: this.fps };
      this.set(ORDER[i - 1]);
      this.downgrades++;
      this.goodWindows = 0;
    } else if (avg < 12.5 && p90 < 18 && i < 2 && this.downgrades < 2) {
      if (++this.goodWindows >= 4) {
        this.set(ORDER[i + 1]);
        this.goodWindows = 0;
      }
    } else this.goodWindows = 0;
  }
}
