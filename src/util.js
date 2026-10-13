import * as THREE from 'three';

export const PI2 = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleDiff(a, b) {
  let d = (b - a) % PI2;
  if (d > Math.PI) d -= PI2;
  if (d < -Math.PI) d += PI2;
  return d;
}
export const fmtTime = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

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
    perm = new Uint8Array(512),
    vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = r() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 511]];
  function noise2(x, y) {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi;
    const u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi),
      b = h(xi + 1, yi),
      c = h(xi, yi + 1),
      d = h(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, oct = 3) {
    let s = 0,
      amp = 0.5,
      f = 1,
      norm = 0;
    for (let i = 0; i < oct; i++) {
      s += noise2(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  }
  return { noise2, fbm };
}

export function prismGeometry(w, h, d) {
  const x = w / 2,
    z = d / 2;
  const p = [
    -x,
    0,
    -z,
    x,
    0,
    -z,
    0,
    h,
    -z,
    x,
    0,
    z,
    -x,
    0,
    z,
    0,
    h,
    z,
    -x,
    0,
    z,
    -x,
    0,
    -z,
    0,
    h,
    -z,
    -x,
    0,
    z,
    0,
    h,
    -z,
    0,
    h,
    z,
    x,
    0,
    -z,
    x,
    0,
    z,
    0,
    h,
    z,
    x,
    0,
    -z,
    0,
    h,
    z,
    0,
    h,
    -z,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _v = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _c = new THREE.Color();
export class Builder {
  constructor(seed = 1) {
    this.pos = [];
    this.col = [];
    this.stack = [new THREE.Matrix4()];
    this.r = rng(seed);
    this.cache = new Map();
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }
  push(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, s, s));
    this.stack.push(this.top.clone().multiply(_m));
    return this;
  }
  pop() {
    this.stack.pop();
    return this;
  }
  geo(key, make) {
    if (!this.cache.has(key)) {
      const g = make();
      this.cache.set(key, g.index ? g.toNonIndexed() : g);
    }
    return this.cache.get(key);
  }
  add(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, jitter = 0.07) {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)).premultiply(this.top);
    const src = g.attributes.position;
    _c.set(color);
    for (let i = 0; i < src.count; i += 3) {
      const k = 1 + (this.r() - 0.5) * 2 * jitter;
      for (let j = 0; j < 3; j++) {
        _v.fromBufferAttribute(src, i + j).applyMatrix4(_m);
        this.pos.push(_v.x, _v.y, _v.z);
        this.col.push(_c.r * k, _c.g * k, _c.b * k);
      }
    }
    return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    return this.add(
      this.geo('box', () => new THREE.BoxGeometry(1, 1, 1)),
      color,
      x,
      y,
      z,
      rx,
      ry,
      rz,
      w,
      h,
      d,
    );
  }
  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 8, ry = 0) {
    return this.add(
      this.geo(`cyl${rt / rb}|${seg}`, () => new THREE.CylinderGeometry(rt / rb, 1, 1, seg)),
      color,
      x,
      y,
      z,
      0,
      ry,
      0,
      rb,
      h,
      rb,
    );
  }
  cone(r, h, color, x = 0, y = 0, z = 0, seg = 8, ry = 0) {
    return this.add(
      this.geo(`cone${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
      color,
      x,
      y,
      z,
      0,
      ry,
      0,
      r,
      h,
      r,
    );
  }
  ico(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0, detail = 0) {
    return this.add(
      this.geo(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail)),
      color,
      x,
      y,
      z,
      0,
      ry,
      0,
      r * sx,
      r * sy,
      r * sz,
    );
  }
  dodeca(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0) {
    return this.add(
      this.geo('dod', () => new THREE.DodecahedronGeometry(1, 0)),
      color,
      x,
      y,
      z,
      0,
      ry,
      0,
      r * sx,
      r * sy,
      r * sz,
    );
  }
  roof(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
    return this.add(
      this.geo(`roof`, () => prismGeometry(1, 1, 1)),
      color,
      x,
      y,
      z,
      0,
      ry,
      0,
      w,
      h,
      d,
    );
  }
  get empty() {
    return this.pos.length === 0;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  mesh(material, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }
}

export function softTexture(size = 128, { noise = 0, seed = 7 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  if (noise) {
    const n = makeNoise(seed),
      img = g.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4,
          v = 0.5 + 0.5 * n.fbm((x / size) * 5, (y / size) * 5, 4);
        img.data[i + 3] *= clamp(lerp(1, v * 1.6, noise), 0, 1);
      }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
