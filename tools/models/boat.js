import * as THREE from 'three';
import { ModelBuilder, M, sweep, rectProfile, circleProfile, roundedBox } from './lib/model.js';
import { hex, rng, makeNoise } from './lib/tex.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function section(t) {
  const z = lerp(-3.3, 2.6, t);
  const w = 1.32 * (1 - Math.pow(1 - t, 2.1)) * (1 - 0.28 * smoothstep(0.75, 1, t));
  const sheer = 0.62 + 0.95 * Math.pow(1 - t, 3.2) + 0.18 * t;
  const keel = -0.58 * (1 - 0.65 * Math.pow(1 - t, 4));
  return [[0, keel], [w * 0.78, keel * 0.5], [w, 0.12], [w * 0.97, sheer * 0.55], [w * 0.94, sheer], z];
}
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t,
    t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
function hullPt(t, s, out = V()) {
  const sec = section(t),
    z = sec[5],
    P = sec.slice(0, 5);
  const ext = [[-P[1][0], P[1][1]], ...P, [P[4][0] * 2 - P[3][0], P[4][1] * 2 - P[3][1]]];
  const x = Math.min(3.9999, Math.max(0, s * 4)),
    i = Math.floor(x),
    f = x - i;
  out.set(
    cr(ext[i][0], ext[i + 1][0], ext[i + 2][0], ext[i + 3][0], f),
    cr(ext[i][1], ext[i + 1][1], ext[i + 2][1], ext[i + 3][1], f),
    z,
  );
  return out;
}
function hullNormal(t, s, out = V()) {
  const e = 1e-3,
    a = hullPt(Math.min(1, t + e), s),
    b = hullPt(Math.max(0, t - e), s),
    c = hullPt(t, Math.min(1, s + e)),
    d = hullPt(t, Math.max(0, s - e));
  const dt = a.sub(b),
    ds = c.sub(d);
  out.crossVectors(ds, dt).normalize();
  const p = hullPt(t, s);
  if (out.x * p.x + out.y * (p.y - 0.3) < 0) out.negate();
  if (!isFinite(out.x)) out.set(1, 0, 0);
  return out;
}
const mirror = (g) => {
  const m = g.clone();
  m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const idx = m.index;
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i];
      a[i] = a[i + 1];
      a[i + 1] = t;
    }
  } else {
    const p = m.attributes;
    for (const k of Object.keys(p)) {
      const at = p[k],
        n = at.itemSize;
      for (let i = 0; i < at.count; i += 3)
        for (let j = 0; j < n; j++) {
          const v = at.array[(i + 1) * n + j];
          at.array[(i + 1) * n + j] = at.array[(i + 2) * n + j];
          at.array[(i + 2) * n + j] = v;
        }
    }
  }
  m.computeVertexNormals();
  return m;
};

function grid(fn, NT, NS, { flip = false } = {}) {
  const pos = [],
    uv = [],
    idx = [];
  for (let i = 0; i <= NT; i++)
    for (let j = 0; j <= NS; j++) {
      const [p, u, v] = fn(i / NT, j / NS);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  for (let i = 0; i < NT; i++)
    for (let j = 0; j < NS; j++) {
      const a = i * (NS + 1) + j,
        b = a + 1,
        c = a + NS + 1,
        d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildBoat() {
  const mb = new ModelBuilder('dorna');
  mb.material('HullPaint', { set: 'paint', tile: 2, rough: 1, metal: 1 });
  mb.material('InteriorPaint', { set: 'paint', tile: 2, color: hex(0xcfc2a4), rough: 1, metal: 1 });
  mb.material('Wood', { set: 'wood', tile: 1.2, rough: 1, metal: 1 });
  mb.material('WoodDark', { set: 'wood', tile: 1.2, color: [0.62, 0.56, 0.5], rough: 1, metal: 1 });
  mb.material('Rope', { set: 'rope', tile: 1, rough: 1, metal: 1 });
  mb.material('Net', { set: 'net', tile: 0.45, rough: 1, metal: 1, double: true, mask: true });
  mb.material('NetCore', { color: hex(0x1f3a31), rough: 0.9, metal: 0 });
  mb.material('Bronze', { set: 'bronze', tile: 0.3, rough: 1, metal: 1 });
  mb.material('Sail', { set: 'canvas', rough: 1, metal: 1, double: true });
  mb.material('Wicker', { set: 'wicker', tile: 1, rough: 1, metal: 1 });
  mb.material('Cork', { set: 'wood', tile: 0.4, color: hex(0xd08b4a), rough: 1, metal: 1 });
  mb.material('LanternGlass', {
    color: hex(0xffe0a8),
    rough: 0.15,
    metal: 0,
    emissive: hex(0xffc070),
    emissiveStrength: 2.5,
  });

  const hull = mb.node('Hull');
  const STRAKES = 9,
    LAP = 0.022,
    NT = 64;
  const paint = [0x6e2a1f, 0x6e2a1f, 0x6e2a1f, 0x1d5873, 0x1d5873, 0x1d5873, 0x1d5873, 0xe8e2d2, 0xb3382a].map(hex);
  for (let k = 0; k < STRAKES; k++) {
    const s0 = k / STRAKES,
      s1 = (k + 1) / STRAKES;
    const g = grid(
      (ft, fs) => {
        const t = ft,
          s = lerp(s0, s1, fs),
          p = hullPt(t, s),
          n = hullNormal(t, s);
        p.addScaledVector(n, LAP * (1 - fs) * smoothstep(0, 0.06, t));
        return [p, p.z, s * 2.2];
      },
      NT,
      4,
      { flip: true },
    );
    const gm = mirror(g);
    hull.add('HullPaint', g, { uv: 'keep', color: paint[k] });
    hull.add('HullPaint', gm, { uv: 'keep', color: paint[k] });
    if (k > 0) {
      const st = grid(
        (ft, fs) => {
          const t = ft,
            p = hullPt(t, s0),
            n = hullNormal(t, s0);
          p.addScaledVector(n, LAP * fs * smoothstep(0, 0.06, t));
          return [p, p.z, s0 * 2.2 + fs * 0.02];
        },
        NT,
        1,
      );
      hull.add('HullPaint', st, { uv: 'keep', color: paint[k].map((c) => c * 0.8) });
      hull.add('HullPaint', mirror(st), { uv: 'keep', color: paint[k].map((c) => c * 0.8) });
    }
  }
  const inner = grid(
    (ft, fs) => {
      const p = hullPt(ft, fs),
        n = hullNormal(ft, fs);
      p.addScaledVector(n, -0.035);
      return [p, p.z, fs * 2.2];
    },
    NT,
    12,
  );
  hull.add('InteriorPaint', inner, { uv: 'keep' });
  hull.add('InteriorPaint', mirror(inner), { uv: 'keep' });
  const tr = [];
  for (let j = 0; j <= 24; j++) tr.push(hullPt(1, j / 24));
  const trShape = new THREE.Shape();
  trShape.moveTo(-tr[24].x, tr[24].y);
  for (let j = 24; j >= 0; j--) trShape.lineTo(-tr[j].x, tr[j].y);
  for (let j = 1; j <= 24; j++) trShape.lineTo(tr[j].x, tr[j].y);
  const trG = new THREE.ShapeGeometry(trShape);
  hull.add('HullPaint', trG, { matrix: M(0, 0, 2.6 + 0.005), uv: 'box', color: hex(0x1d5873) });
  hull.add('InteriorPaint', mirror(trG), { matrix: M(0, 0, 2.6 - 0.03), uv: 'box' });
  hull.add(
    'WoodDark',
    sweep(
      [...tr.map((p) => V(p.x + 0.01, p.y, 2.62)).reverse(), ...tr.slice(1).map((p) => V(-p.x - 0.01, p.y, 2.62))],
      rectProfile(0.07, 0.05),
    ),
    { uv: 'keep' },
  );

  const rail = [],
    rub = [];
  for (let i = 0; i <= 48; i++) {
    const t = 0.004 + (i / 48) * 0.996;
    const p = hullPt(t, 1),
      n = hullNormal(t, 1);
    rail.push(
      p
        .clone()
        .addScaledVector(n, -0.008)
        .add(V(0, 0.03, 0)),
    );
    rub.push(hullPt(t, 0.935).addScaledVector(hullNormal(t, 0.935), LAP + 0.012));
  }
  const railG = sweep(
    rail,
    [
      [-0.06, -0.035],
      [0.05, -0.035],
      [0.055, 0.03],
      [0.0, 0.045],
      [-0.06, 0.03],
    ],
    { closed: true },
  );
  hull.add('Wood', railG, { uv: 'keep' });
  hull.add('Wood', mirror(railG), { uv: 'keep' });
  const rubG = sweep(
    rub,
    [
      [-0.02, -0.022],
      [0.0, -0.03],
      [0.02, -0.02],
      [0.026, 0.0],
      [0.02, 0.02],
      [0.0, 0.03],
      [-0.02, 0.022],
    ],
    { closed: true },
  );
  hull.add('WoodDark', rubG, { uv: 'keep' });
  hull.add('WoodDark', mirror(rubG), { uv: 'keep' });
  const keel = [];
  for (let i = 0; i <= 40; i++) keel.push(hullPt(0.01 + (i / 40) * 0.99, 0).add(V(0, -0.04, 0)));
  hull.add('WoodDark', sweep(keel, rectProfile(0.09, 0.12)), { uv: 'keep' });
  const stem = [
    V(0, -0.24, -3.05),
    V(0, -0.21, -3.3),
    V(0, 0.25, -3.36),
    V(0, 0.9, -3.38),
    V(0, 1.5, -3.4),
    V(0, 1.82, -3.46),
  ];
  hull.add('WoodDark', sweep(stem, rectProfile(0.17, 0.12), { up: V(1, 0, 0) }), { uv: 'keep' });
  hull.add('WoodDark', roundedBox(0.13, 0.1, 0.18, 0.03), { matrix: M(0, 1.86, -3.47, -0.2) });
  hull.add(
    'WoodDark',
    sweep([V(0, -0.42, 2.5), V(0, -0.2, 2.63), V(0, 0.9, 2.66)], rectProfile(0.1, 0.1), { up: V(1, 0, 0) }),
    { uv: 'keep' },
  );

  for (let t = 0.1; t < 0.95; t += 0.075) {
    const path = [];
    for (let j = 0; j <= 14; j++) {
      const s = 0.04 + (j / 14) * 0.93;
      path.push(hullPt(t, s).addScaledVector(hullNormal(t, s), -0.06));
    }
    const f = sweep(path, rectProfile(0.05, 0.045), { up: V(0, 0, 1) });
    hull.add('Wood', f, { uv: 'keep' });
    hull.add('Wood', mirror(f), { uv: 'keep' });
  }
  const yAt = (t, y) => {
    let best = 0,
      bd = 9;
    for (let j = 0; j <= 200; j++) {
      const s = j / 200,
        p = hullPt(t, s);
      if (Math.abs(p.y - y) < bd) {
        bd = Math.abs(p.y - y);
        best = s;
      }
    }
    return hullPt(t, best).addScaledVector(hullNormal(t, best), -0.07).x;
  };
  const stringer = [];
  for (let i = 0; i <= 30; i++) {
    const t = 0.12 + (i / 30) * 0.8,
      x = yAt(t, 0.3);
    stringer.push(V(x, 0.3, lerp(-3.3, 2.6, t)));
  }
  const strG = sweep(stringer, rectProfile(0.05, 0.08));
  hull.add('Wood', strG, { uv: 'keep' });
  hull.add('Wood', mirror(strG), { uv: 'keep' });
  const FLOOR = -0.3;
  for (let k = -3; k <= 3; k++) {
    const xo = k * 0.17;
    let z0 = 9,
      z1 = -9;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100,
        hw = yAt(t, FLOOR);
      if (hw > Math.abs(xo) + 0.1) {
        const z = lerp(-3.3, 2.6, t);
        z0 = Math.min(z0, z);
        z1 = Math.max(z1, z);
      }
    }
    if (z1 > z0)
      hull.add('Wood', roundedBox(0.15, 0.035, z1 - z0, 0.012, 2), { matrix: M(xo, FLOOR, (z0 + z1) / 2), uv: 'box' });
  }
  for (const z of [-1.2, 0.4, 1.7]) {
    const t = (z + 3.3) / 5.9,
      hw = yAt(t, 0.36);
    hull.add('Wood', roundedBox(hw * 2 + 0.02, 0.055, 0.3, 0.018, 3), { matrix: M(0, 0.385, z), uv: 'box' });
    for (const sx of [-1, 1])
      hull.add(
        'WoodDark',
        sweep(
          [V(sx * (hw - 0.02), 0.36, z), V(sx * (hw - 0.02), 0.2, z), V(sx * (hw - 0.09), 0.34, z)],
          rectProfile(0.04, 0.04),
        ),
        { uv: 'keep' },
      );
  }
  const mast = new THREE.LatheGeometry(
    [V(0, -0.42, 0), V(0.085, -0.42, 0), V(0.082, 1, 0), V(0.07, 4.6, 0), V(0.055, 6, 0), V(0.0, 6.04, 0)],
    12,
  );
  hull.add('WoodDark', mast, { matrix: M(0, 0, -1.1), uv: 'cyl' });
  hull.add('Bronze', new THREE.TorusGeometry(0.09, 0.018, 6, 16), { matrix: M(0, 0.44, -1.1, Math.PI / 2) });
  hull.add('Bronze', new THREE.CylinderGeometry(0.075, 0.075, 0.12, 12), { matrix: M(0, 5.86, -1.1) });

  const blade = new THREE.Shape();
  blade.moveTo(0, 0.75);
  blade.lineTo(0, -0.58);
  blade.quadraticCurveTo(0.25, -0.66, 0.5, -0.6);
  blade.quadraticCurveTo(0.52, -0.1, 0.32, 0.35);
  blade.lineTo(0.12, 0.55);
  blade.lineTo(0.12, 0.75);
  const bladeG = new THREE.ExtrudeGeometry(blade, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 10,
  });
  bladeG.translate(0, 0, -0.03);
  hull.add('WoodDark', bladeG, { matrix: M(0, 0, 2.72, 0, -Math.PI / 2), uv: 'box' });
  for (const y of [-0.25, 0.35]) {
    hull.add('Bronze', new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), { matrix: M(0, y, 2.69) });
    hull.add('Bronze', roundedBox(0.05, 0.03, 0.16, 0.01), { matrix: M(0, y + 0.06, 2.65) });
  }
  hull.add(
    'WoodDark',
    sweep([V(0, 0.78, 2.76), V(0, 0.86, 2.5), V(0, 0.84, 2.05), V(0, 0.8, 1.7)], rectProfile(0.06, 0.055), {
      scale: (u) => lerp(1, 0.7, u),
    }),
    { uv: 'keep' },
  );
  hull.add('WoodDark', new THREE.SphereGeometry(0.04, 10, 8), { matrix: M(0, 0.8, 1.68) });

  for (const sx of [-1, 1])
    for (const z of [-0.15, 1.0]) {
      const t = (z + 3.3) / 5.9,
        p = hullPt(t, 1);
      hull.add('WoodDark', new THREE.CylinderGeometry(0.02, 0.025, 0.2, 8), {
        matrix: M(sx * (p.x - 0.01), p.y + 0.14, z),
      });
    }
  for (const sx of [-1, 1]) {
    const x = sx * 0.5,
      y = 0.45;
    hull.add('Wood', sweep([V(x, y, -1.7), V(x, y, 1.3)], circleProfile(0.028, 8)), { uv: 'keep' });
    hull.add(
      'Wood',
      sweep(
        [V(x, y, 1.3), V(x, y, 1.85)],
        [
          [-0.11, -0.012],
          [0.11, -0.012],
          [0.11, 0.012],
          [-0.11, 0.012],
        ],
        { up: V(0, 1, 0), scale: (u) => lerp(0.5, 1, Math.min(1, u * 3)) },
      ),
      { uv: 'keep' },
    );
    hull.add('WoodDark', sweep([V(x, y, -1.95), V(x, y, -1.7)], circleProfile(0.022, 8)), { uv: 'keep' });
  }

  hull.add(
    'WoodDark',
    sweep([V(0, 0.38, 2.15), V(0, 1.5, 2.15), V(0, 1.52, 2.1), V(0, 1.5, 1.92)], rectProfile(0.045, 0.045)),
    { uv: 'keep' },
  );
  hull.add('Bronze', new THREE.CylinderGeometry(0.11, 0.12, 0.04, 12), { matrix: M(0, 1.0, 1.9) });
  hull.add('Bronze', new THREE.ConeGeometry(0.13, 0.12, 12), { matrix: M(0, 1.33, 1.9) });
  hull.add('Bronze', new THREE.TorusGeometry(0.04, 0.008, 6, 12), { matrix: M(0, 1.42, 1.9) });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    hull.add('Bronze', new THREE.CylinderGeometry(0.008, 0.008, 0.3, 5), {
      matrix: M(Math.cos(a) * 0.09, 1.16, 1.9 + Math.sin(a) * 0.09),
    });
  }
  hull.add('LanternGlass', new THREE.CylinderGeometry(0.085, 0.085, 0.26, 12), { matrix: M(0, 1.15, 1.9) });

  const N = makeNoise(5),
    r = rng(9);
  const heap = new THREE.IcosahedronGeometry(1, 3),
    hp = heap.attributes.position,
    v = V();
  for (let i = 0; i < hp.count; i++) {
    v.fromBufferAttribute(hp, i);
    const d = 1 + N.noise(v.x * 2.2 + 3, v.z * 2.2 + v.y) * 0.22 + N.noise(v.x * 6, v.y * 6 + v.z) * 0.06;
    v.multiplyScalar(d);
    v.y = Math.max(v.y, -0.2);
    hp.setXYZ(i, v.x * 0.52, v.y * 0.3, v.z * 0.42);
  }
  heap.computeVertexNormals();
  hull.add('Net', heap, { matrix: M(-0.38, FLOOR + 0.07, -0.55, 0, 0.3), uv: 'box' });
  hull.add('NetCore', heap.clone(), { matrix: M(-0.38, FLOOR + 0.065, -0.55, 0, 0.3, 0, 0.94, 0.9, 0.94), uv: 'box' });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 1.6 - 0.6,
      x = -0.38 + Math.cos(a) * 0.36,
      z = -0.55 + Math.sin(a) * 0.3;
    hull.add('Cork', new THREE.CylinderGeometry(0.05, 0.05, 0.07, 10), {
      matrix: M(x, FLOOR + 0.13 + r() * 0.05, z, Math.PI / 2 + (r() - 0.5) * 0.5, a, (r() - 0.5) * 0.4),
      uv: 'cyl',
    });
  }
  const creel = new THREE.LatheGeometry(
    [
      V(0.0, 0, 0),
      V(0.2, 0, 0),
      V(0.27, 0.1, 0),
      V(0.27, 0.26, 0),
      V(0.18, 0.38, 0),
      V(0.12, 0.4, 0),
      V(0.12, 0.36, 0),
      V(0.17, 0.26, 0),
    ],
    18,
  );
  hull.add('Wicker', creel, { matrix: M(0.45, FLOOR + 0.02, 0.95), uv: 'unit' });
  hull.add('Wicker', new THREE.TorusGeometry(0.12, 0.015, 6, 18), {
    matrix: M(0.45, FLOOR + 0.42, 0.95, Math.PI / 2),
    uv: 'box',
  });
  const coil = [];
  for (let i = 0; i <= 140; i++) {
    const a = (i / 140) * Math.PI * 2 * 3.3,
      rr = 0.09 + (i / 140) * 0.14;
    coil.push(
      V(
        0.3 + Math.cos(a) * rr,
        FLOOR + 0.045 + Math.sin(i * 0.7) * 0.006 + (i > 120 ? (i - 120) * 0.002 : 0),
        -1.85 + Math.sin(a) * rr,
      ),
    );
  }
  const coilG = sweep(coil, circleProfile(0.016, 7));
  ropeUV(coilG, 0.016);
  hull.add('Rope', coilG, { uv: 'unit' });
  const hal = sweep(
    [V(0.06, 5.8, -1.06), V(0.07, 3, -1.02), V(0.06, 0.5, -1.02), V(0.12, 0.41, -1.12)],
    circleProfile(0.011, 6),
  );
  ropeUV(hal, 0.011);
  hull.add('Rope', hal, { uv: 'unit' });

  const yard = mb.node('Yard', [0, 0, -1.1]);
  const th = [0, 4.5, -1.15 + 1.1],
    pk = [0, 5.9, 1.55 + 1.1],
    dir = V(pk[0] - th[0], pk[1] - th[1], pk[2] - th[2]).normalize();
  const y0 = V(...th).addScaledVector(dir, -0.25),
    y1 = V(...pk).addScaledVector(dir, 0.25);
  yard.add(
    'WoodDark',
    sweep([y0, y0.clone().lerp(y1, 0.5), y1], circleProfile(0.045, 10), { scale: (u) => 1 - Math.abs(u - 0.5) * 0.6 }),
    { uv: 'keep' },
  );
  yard.add('Rope', new THREE.TorusGeometry(0.12, 0.018, 6, 14), {
    matrix: M(0, th[1] + 0.02, 0, Math.PI / 2),
    uv: 'box',
  });

  const sail = mb.node('Sail', [0, 0, -1.1]);
  const corners = { tack: [0, 1.05, -1.55], clew: [0, 1.15, 1.9], peak: [0, 5.9, 1.55], throat: [0, 4.5, -1.15] };
  const sg = new THREE.PlaneGeometry(1, 1, 8, 8),
    sp = sg.attributes.position;
  const L3 = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));
  for (let i = 0; i < sp.count; i++) {
    const u = sp.getX(i) + 0.5,
      w = sp.getY(i) + 0.5;
    const q = L3(L3(corners.tack, corners.clew, u), L3(corners.throat, corners.peak, u), w);
    sp.setXYZ(i, q[0], q[1], q[2] + 1.1);
  }
  sg.computeVertexNormals();
  sail.add('Sail', sg, { uv: 'unit' });
  return mb;
}

function ropeUV(g, r) {
  const uv = g.attributes.uv,
    circ = Math.PI * 2 * r;
  for (let i = 0; i < uv.count; i++) {
    const along = uv.getX(i),
      around = uv.getY(i);
    uv.setXY(i, around / circ, along / (r * 12));
  }
}
