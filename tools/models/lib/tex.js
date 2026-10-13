import sharp from 'sharp';

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed) {
  const r = rng(seed),
    perm = new Uint16Array(512);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const gx = new Float32Array(256),
    gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const mod = (a, n) => ((a % n) + n) % n;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y, px = 256, py = 256) {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi;
    const x0 = mod(xi, px),
      x1 = mod(xi + 1, px),
      y0 = mod(yi, py),
      y1 = mod(yi + 1, py);
    const g = (ix, iy, dx, dy) => {
      const h = perm[(perm[ix & 255] + iy) & 511];
      return gx[h] * dx + gy[h] * dy;
    };
    const u = fade(xf),
      v = fade(yf);
    const a = lerp(g(x0, y0, xf, yf), g(x1, y0, xf - 1, yf), u);
    const b = lerp(g(x0, y1, xf, yf - 1), g(x1, y1, xf - 1, yf - 1), u);
    return lerp(a, b, v) * 1.414;
  }
  function fbm(u, v, fx, fy, oct = 4, gain = 0.5) {
    let s = 0,
      amp = 1,
      norm = 0,
      f = 1;
    for (let o = 0; o < oct; o++) {
      s += amp * noise(u * fx * f, v * fy * f, fx * f, fy * f);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return s / norm;
  }
  return { noise, fbm };
}

export function makeCells(seed, n, m = n) {
  const r = rng(seed),
    pts = new Float32Array(n * m * 2),
    ids = new Float32Array(n * m);
  for (let i = 0; i < n * m; i++) {
    pts[i * 2] = r();
    pts[i * 2 + 1] = r();
    ids[i] = r();
  }
  const out = { f1: 0, f2: 0, id: 0 };
  return function cells(u, v) {
    const x = u * n,
      y = v * m,
      xi = Math.floor(x),
      yi = Math.floor(y);
    let f1 = 9,
      f2 = 9,
      id = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx,
          cy = yi + dy,
          k = (((cy % m) + m) % m) * n + (((cx % n) + n) % n);
        const px = cx + pts[k * 2],
          py = cy + pts[k * 2 + 1],
          d = Math.hypot(px - x, py - y);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = ids[k];
        } else if (d < f2) f2 = d;
      }
    out.f1 = f1;
    out.f2 = f2;
    out.id = id;
    return out;
  };
}

export class TexSet {
  constructor(name, w, h = w) {
    this.name = name;
    this.w = w;
    this.h = h;
    const n = w * h;
    this.color = new Float32Array(n * 3);
    this.height = new Float32Array(n);
    this.rough = new Float32Array(n).fill(0.8);
    this.metal = new Float32Array(n);
    this.ao = new Float32Array(n).fill(1);
    this.alpha = null;
  }
  paint(fn) {
    const px = { c: [0, 0, 0], h: 0, r: 0.8, m: 0, ao: 1, a: 1 };
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        px.c = [0.5, 0.5, 0.5];
        px.h = 0;
        px.r = 0.8;
        px.m = 0;
        px.ao = 1;
        px.a = 1;
        fn((x + 0.5) / this.w, (y + 0.5) / this.h, px);
        this.color[i * 3] = px.c[0];
        this.color[i * 3 + 1] = px.c[1];
        this.color[i * 3 + 2] = px.c[2];
        this.height[i] = px.h;
        this.rough[i] = px.r;
        this.metal[i] = px.m;
        this.ao[i] = px.ao;
        if (px.a < 1 && !this.alpha) this.alpha = new Float32Array(this.w * this.h).fill(1);
        if (this.alpha) this.alpha[i] = px.a;
      }
    return this;
  }
  normals(strength) {
    const { w, h } = this,
      out = new Uint8Array(w * h * 3),
      H = this.height;
    const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength,
          dRow = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
        let nx = -dx,
          ny = dRow,
          nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const i = (y * w + x) * 3;
        out[i] = Math.round((nx * 0.5 + 0.5) * 255);
        out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      }
    return out;
  }
  bakeCavity(radius = 3, amount = 0.6) {
    const { w, h } = this,
      H = this.height,
      out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0,
          n = 0;
        for (let dy = -radius; dy <= radius; dy += radius)
          for (let dx = -radius; dx <= radius; dx += radius) {
            s += H[((y + dy + h) % h) * w + ((x + dx + w) % w)];
            n++;
          }
        out[y * w + x] = H[y * w + x] - s / n;
      }
    let mx = 1e-6;
    for (const v of out) mx = Math.max(mx, Math.abs(v));
    for (let i = 0; i < w * h; i++) this.ao[i] *= clamp(1 + Math.min(0, out[i] / mx) * amount, 0, 1);
    return this;
  }
  async encode({ normalStrength = 4, quality = 88, normalQuality = 92 } = {}) {
    const { w, h } = this,
      n = w * h;
    const ch = this.alpha ? 4 : 3,
      col = new Uint8Array(n * ch),
      orm = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) col[i * ch + k] = Math.round(clamp(this.color[i * 3 + k]) * 255);
      if (this.alpha) col[i * 4 + 3] = Math.round(clamp(this.alpha[i]) * 255);
      orm[i * 3] = Math.round(clamp(this.ao[i]) * 255);
      orm[i * 3 + 1] = Math.round(clamp(this.rough[i]) * 255);
      orm[i * 3 + 2] = Math.round(clamp(this.metal[i]) * 255);
    }
    const webp = (buf, channels, q) =>
      sharp(Buffer.from(buf.buffer), { raw: { width: w, height: h, channels } })
        .webp({ quality: q, alphaQuality: 100, effort: 6 })
        .toBuffer();
    return {
      name: this.name,
      alpha: !!this.alpha,
      baseColor: await webp(col, ch, quality),
      normal: await webp(this.normals(normalStrength), 3, normalQuality),
      orm: await webp(orm, 3, 90),
    };
  }
}
