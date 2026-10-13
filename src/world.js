import * as THREE from 'three';
import { Builder, rng, makeNoise, smoothstep, clamp, PI2 } from './util.js';
import { ISLANDS, islandHeight, islandJitter, heightAt, waveHeight, waveDamp } from './terrain.js';

export const COL = {
  granite: 0x8f938a,
  graniteLight: 0xb2b0a3,
  graniteDark: 0x5d625e,
  lichen: 0xa39466,
  moss: 0x6e7d4f,
  plaster: 0xf1e8d6,
  plasterWarm: 0xead9bb,
  tile: 0xb4553a,
  tileDark: 0x8e4231,
  slate: 0x4e5558,
  wood: 0x7a5236,
  woodLight: 0xa97c52,
  woodDark: 0x4b3424,
  frameGreen: 0x2f6b55,
  frameBlue: 0x2f5f86,
  glass: 0x24343c,
  sand: 0xe9dfbd,
  gold: 0xe7c27a,
};
const WINDOW_GLOW = 0xffc277;

const noise = makeNoise(99);
const _c = new THREE.Color();
const TERRAIN_COLS = {
  sandWet: new THREE.Color(0xb8ab83),
  sand: new THREE.Color(0xeee3c1),
  seabed: new THREE.Color(0x8a8a6e),
  seabedRock: new THREE.Color(0x4f5b57),
  grass: new THREE.Color(0x5f8a48),
  grass2: new THREE.Color(0x7aa055),
  dry: new THREE.Color(0x9a9a5c),
  heather: new THREE.Color(0x8a5b7e),
  gorse: new THREE.Color(0xd6b736),
  bracken: new THREE.Color(0x92693d),
  rock: new THREE.Color(0x868b84),
  rockDark: new THREE.Color(0x5e6460),
  lichen: new THREE.Color(0xa4956b),
};

function islandMesh(isl, material) {
  const R = [
    0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.58, 0.66, 0.73, 0.79, 0.84, 0.875, 0.905, 0.93, 0.955, 0.975, 0.99, 1.005, 1.03, 1.07,
    1.13, 1.22, 1.36, 1.55,
  ];
  const N = Math.round(clamp(Math.max(isl.rx, isl.rz) * 2.6, 22, 72));
  const verts = [];
  for (let ring = 0; ring < R.length; ring++) {
    const row = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * PI2 + (ring % 2) * (0.5 / N) * PI2;
      const j = islandJitter(isl, a),
        rr = R[ring] * j;
      const lx = Math.cos(a) * isl.rx * rr,
        lz = Math.sin(a) * isl.rz * rr;
      row.push([lx, islandHeight(isl, lx, lz), lz]);
    }
    verts.push(row);
  }
  const pos = [],
    col = [];
  const n = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    A = new THREE.Vector3(),
    B = new THREE.Vector3(),
    Cv = new THREE.Vector3();
  const tri = (a, b, c) => {
    A.fromArray(a);
    B.fromArray(b);
    Cv.fromArray(c);
    n.crossVectors(ab.subVectors(B, A), ac.subVectors(Cv, A)).normalize();
    if (n.y < 0) {
      [b, c] = [c, b];
      n.negate();
    }
    pos.push(...a, ...b, ...c);
    const cy = (a[1] + b[1] + c[1]) / 3,
      cx = (a[0] + b[0] + c[0]) / 3 + isl.x,
      cz = (a[2] + b[2] + c[2]) / 3 + isl.z;
    terrainColor(cy, n.y, cx, cz, isl, _c);
    col.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
  };
  for (let ring = 0; ring < R.length - 1; ring++)
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N,
        a = verts[ring][i],
        b = verts[ring][i2],
        c = verts[ring + 1][i],
        d = verts[ring + 1][i2];
      if (ring === 0) {
        tri(a, c, d);
        continue;
      }
      if (ring % 2 === 0) {
        tri(a, c, b);
        tri(b, c, d);
      } else {
        tri(a, c, d);
        tri(a, d, b);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.position.set(isl.x, 0, isl.z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function terrainColor(h, ny, x, z, isl, out) {
  const T = TERRAIN_COLS,
    n1 = noise.fbm(x * 0.07, z * 0.07, 3),
    n2 = noise.fbm(x * 0.19 + 40, z * 0.19, 2);
  if (h < -0.25)
    out
      .copy(isl.allCliff || ny < 0.75 ? T.seabedRock : T.seabed)
      .lerp(T.sandWet, smoothstep(-2.5, -0.3, h) * (ny > 0.75 ? 1 : 0.3));
  else if (ny < 0.64) {
    out
      .copy(T.rock)
      .lerp(T.rockDark, 0.5 + 0.5 * Math.sin(h * 2.3 + n1 * 3))
      .lerp(T.lichen, smoothstep(0.25, 0.6, n2) * 0.55);
  } else if (h < 0.9 + n1 * 0.5) out.copy(T.sand).lerp(T.sandWet, smoothstep(0.4, -0.2, h));
  else {
    out.copy(T.grass).lerp(T.grass2, 0.5 + n1 * 0.8);
    if (h < 2.2) out.lerp(T.dry, 0.35);
    if (n2 > 0.22) out.lerp(T.heather, smoothstep(0.22, 0.45, n2) * 0.85);
    else if (n2 < -0.28) out.lerp(T.gorse, smoothstep(-0.28, -0.5, n2) * 0.8);
    if (ny < 0.8) out.lerp(T.bracken, 0.45);
    if (isl.allCliff) out.lerp(T.rock, 0.55);
  }
  out.multiplyScalar(0.9 + Math.random() * 0.16);
  return out;
}

function vegGeometry(kind, lod) {
  const b = new Builder(kind.length * 13 + lod);
  if (kind === 'pine') {
    if (lod === 0) {
      b.cyl(0.13, 0.22, 3, COL.woodDark, 0, 1.5, 0, 5);
      b.cone(1.5, 2.6, 0x2f5644, 0, 3.4, 0, 7);
      b.cone(1.2, 2.3, 0x386651, 0, 4.4, 0, 7, 0.4);
      b.cone(0.8, 1.9, 0x47785a, 0, 5.4, 0, 7, 0.9);
    } else {
      b.cyl(0.13, 0.22, 3, COL.woodDark, 0, 1.5, 0, 4);
      b.cone(1.4, 4.4, 0x356049, 0, 4.2, 0, 5);
    }
  } else if (kind === 'oak') {
    if (lod === 0) {
      b.cyl(0.18, 0.3, 2.4, COL.wood, 0, 1.2, 0, 5);
      b.ico(1.6, 0x4f7a3f, 0, 3.4, 0, 1.1, 0.85, 1);
      b.ico(1.1, 0x5f8b48, 0.9, 3.9, 0.3, 1, 0.9, 1);
      b.ico(1.0, 0x456f39, -0.8, 3.7, -0.4, 1, 0.9, 1);
    } else {
      b.cyl(0.18, 0.3, 2.4, COL.wood, 0, 1.2, 0, 4);
      b.ico(1.8, 0x507b40, 0, 3.6, 0, 1.1, 0.85, 1);
    }
  } else if (kind === 'bush') {
    b.ico(0.9, 0xffffff, 0, 0.45, 0, 1.2, 0.7, 1, 0, 0);
    if (lod === 0) b.ico(0.6, 0xf0f0f0, 0.6, 0.35, 0.3, 1, 0.8, 1);
  } else if (kind === 'rock') {
    b.dodeca(1, 0xffffff, 0, 0, 0, 1.3, 0.75, 1.05);
  }
  return b.geometry();
}
const windUniform = { value: 0 };
function swayMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uWind = windUniform;
    s.vertexShader =
      'uniform float uWind;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x*.21+instanceMatrix[3].z*.17;
        float sw = max(position.y-1.2,0.)*.045;
        transformed.x += sin(uWind*1.3+ph)*sw; transformed.z += cos(uWind*1.05+ph*1.3)*sw*.6;
      #endif`,
      );
  };
  m.customProgramCacheKey = () => 'sway';
  return m;
}

function scatterVegetation(isl, exclusions, r) {
  const items = { pine: [], oak: [], bush: [], rock: [] };
  if (isl.type === 'stack') return items;
  const area = isl.rx * isl.rz;
  const dens = {
    faro: [0.05, 0.02, 0.22, 0.06],
    chapel: [0.03, 0.04, 0.22, 0.06],
    forest: [0.2, 0.08, 0.18, 0.05],
    castro: [0.04, 0.06, 0.2, 0.07],
    beach: [0.1, 0.02, 0.18, 0.05],
    village: [0.04, 0.07, 0.18, 0.05],
    rock: [0, 0, 0.08, 0.25],
    sereia: [0.03, 0.01, 0.18, 0.1],
  }[isl.type];
  const kinds = ['pine', 'oak', 'bush', 'rock'];
  kinds.forEach((kind, ki) => {
    const count = Math.round(area * dens[ki]);
    let tries = 0;
    while (items[kind].length < count && tries++ < count * 12) {
      const a = r() * PI2,
        rad = Math.sqrt(r()) * (kind === 'rock' ? 1.02 : 0.9);
      const lx = Math.cos(a) * isl.rx * rad,
        lz = Math.sin(a) * isl.rz * rad;
      const h = islandHeight(isl, lx, lz);
      const wx = isl.x + lx,
        wz = isl.z + lz;
      if (kind !== 'rock' && h < 1.2) continue;
      if (kind === 'rock' && h < -0.6) continue;
      const slope =
        Math.abs(islandHeight(isl, lx + 0.6, lz) - islandHeight(isl, lx - 0.6, lz)) +
        Math.abs(islandHeight(isl, lx, lz + 0.6) - islandHeight(isl, lx, lz - 0.6));
      if (kind !== 'rock' && slope > 1.5) continue;
      if (exclusions.some((e) => Math.hypot(wx - e.x, wz - e.z) < e.r)) continue;
      const grove = noise.fbm(wx * 0.05, wz * 0.05, 2);
      if (kind === 'pine' && grove < -0.05 && isl.type !== 'forest') continue;
      if (kind === 'bush' && grove > 0.3) continue;
      items[kind].push({
        x: lx,
        y: h - (kind === 'rock' ? 0.2 : 0.1),
        z: lz,
        s: kind === 'rock' ? 0.5 + r() * 1.6 : 0.75 + r() * 0.55,
        ry: r() * PI2,
        tilt: (r() - 0.5) * 0.12,
        t: r(),
      });
    }
  });
  return items;
}

function buildVegetation(scene, materials) {
  const geos = {};
  for (const k of ['pine', 'oak', 'bush', 'rock']) geos[k] = [vegGeometry(k, 0), vegGeometry(k, 1)];
  const lodDist = { pine: [0, 95, 230], oak: [0, 85, 210], bush: [0, 70, 130], rock: [0, 90, 200] };
  const meshes = [];
  const m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    s = new THREE.Vector3(),
    color = new THREE.Color();
  const bushCols = [0xc9ad34, 0x8a5a7f, 0x5f7f3e, 0xb69a3a, 0x7b5677],
    rockCols = [0x8b8f88, 0x9c9a8e, 0x707670, 0xa9a596];
  return function addIsland(isl, items) {
    for (const kind in items) {
      const list = items[kind];
      if (!list.length) continue;
      const lod = new THREE.LOD();
      lod.position.set(isl.x, 0, isl.z);
      const hi = new THREE.InstancedMesh(geos[kind][0], materials.veg, list.length);
      const lo = new THREE.InstancedMesh(geos[kind][1], materials.veg, list.length);
      list.forEach((it, i) => {
        p.set(it.x, it.y, it.z);
        q.setFromEuler(e.set(it.tilt, it.ry, it.tilt * 0.7));
        s.setScalar(it.s);
        if (kind === 'rock') s.set(it.s * (1 + it.t * 0.5), it.s * (0.6 + it.t * 0.5), it.s);
        hi.setMatrixAt(i, m4.compose(p, q, s));
        if (kind === 'bush') color.set(bushCols[Math.floor(it.t * bushCols.length)]);
        else if (kind === 'rock') color.set(rockCols[Math.floor(it.t * rockCols.length)]);
        else color.setRGB(0.85 + it.t * 0.3, 0.85 + it.t * 0.3, 0.85 + it.t * 0.2);
        hi.setColorAt(i, color);
      });
      lo.instanceMatrix = hi.instanceMatrix;
      lo.instanceColor = hi.instanceColor;
      hi.computeBoundingSphere();
      lo.boundingSphere = hi.boundingSphere.clone();
      hi.castShadow = kind !== 'bush';
      hi.receiveShadow = true;
      lo.receiveShadow = true;
      const [d0, d1, d2] = lodDist[kind];
      lod.addLevel(hi, d0);
      lod.addLevel(lo, d1);
      lod.addLevel(new THREE.Object3D(), d2);
      scene.add(lod);
      meshes.push({ hi, lo, total: list.length });
    }
    return meshes;
  };
}

function windowAt(b, glow, x, y, z, ry, w = 0.8, h = 1.1, frame = COL.frameGreen) {
  b.push(x, y, z, ry);
  b.box(w + 0.22, h + 0.22, 0.12, frame, 0, 0, 0);
  b.pop();
  glow.push(x, y, z, ry);
  glow.box(w, h, 0.16, WINDOW_GLOW, 0, 0, -0.01);
  glow.pop();
}
export function house(b, glow, x, y, z, ry, s = 1, opts = {}) {
  const r = b.r,
    stone = opts.stone ?? r() < 0.45,
    wall = stone ? COL.granite : r() < 0.5 ? COL.plaster : COL.plasterWarm;
  const frame = r() < 0.5 ? COL.frameGreen : COL.frameBlue,
    w = opts.w ?? 6,
    d = opts.d ?? 4.6,
    h = opts.h ?? 3.6;
  b.push(x, y, z, ry, s);
  glow.push(x, y, z, ry, s);
  b.box(w + 0.3, 0.7, d + 0.3, COL.graniteDark, 0, 0.1, 0);
  b.box(w, h, d, wall, 0, h / 2 + 0.3, 0);
  if (!stone) {
    for (const sx of [-1, 1]) b.box(0.36, h, 0.36, COL.graniteLight, sx * (w / 2 - 0.1), h / 2 + 0.3, -d / 2 + 0.1);
  }
  b.roof(w + 0.7, 1.9, d + 0.8, opts.slate ? COL.slate : COL.tile, 0, h + 0.3, 0, Math.PI / 2);
  b.box(0.8, 1.4, 0.8, COL.graniteLight, w * 0.28, h + 1.3, d * 0.1);
  b.box(1.1, 2.1, 0.14, COL.woodDark, 0, 1.35, -d / 2 - 0.02);
  windowAt(b, glow, -w * 0.3, 2.2, -d / 2 - 0.03, 0, 0.8, 1, frame);
  windowAt(b, glow, w * 0.3, 2.2, -d / 2 - 0.03, 0, 0.8, 1, frame);
  windowAt(b, glow, 0, 2.3, d / 2 + 0.03, Math.PI, 0.8, 1, frame);
  if (opts.solaina) {
    b.box(w * 0.8, 0.14, 1.1, COL.wood, 0, 2.9, -d / 2 - 0.55);
    for (let i = -3; i <= 3; i++) b.box(0.08, 0.8, 0.08, COL.woodLight, i * w * 0.12, 3.3, -d / 2 - 1.05);
    b.box(w * 0.8, 0.1, 0.1, COL.woodLight, 0, 3.7, -d / 2 - 1.05);
  }
  b.pop();
  glow.pop();
}
export function horreo(b, x, y, z, ry, s = 1) {
  b.push(x, y, z, ry, s);
  for (const xx of [-2.1, 0, 2.1])
    for (const zz of [-0.7, 0.7]) {
      b.box(0.45, 1.5, 0.45, COL.granite, xx, 0.75, zz);
      b.cyl(0.55, 0.55, 0.14, COL.graniteLight, xx, 1.57, zz, 10);
    }
  b.box(5.6, 0.25, 1.9, COL.graniteLight, 0, 1.75, 0);
  b.box(5.4, 1.9, 1.6, COL.granite, 0, 2.85, 0);
  for (let i = -4; i <= 4; i++)
    for (const zs of [-1, 1]) b.box(0.14, 1.4, 0.06, COL.graniteDark, i * 0.55, 2.85, zs * 0.82);
  b.roof(2.5, 1.2, 6.1, COL.tile, 0, 3.8, 0);
  b.box(0.14, 0.9, 0.14, COL.graniteLight, 2.9, 5.2, 0);
  b.box(0.14, 0.14, 0.6, COL.graniteLight, 2.9, 5.35, 0);
  b.cone(0.18, 0.9, COL.graniteLight, -2.9, 5.2, 0, 6);
  b.pop();
}
export function cruceiro(b, x, y, z, ry = 0) {
  b.push(x, y, z, ry);
  b.box(1.8, 0.3, 1.8, COL.graniteDark, 0, 0.15, 0);
  b.box(1.3, 0.3, 1.3, COL.granite, 0, 0.45, 0);
  b.box(0.8, 0.3, 0.8, COL.graniteLight, 0, 0.75, 0);
  b.cyl(0.14, 0.18, 3.2, COL.granite, 0, 2.5, 0, 8);
  b.box(0.24, 0.9, 0.24, COL.graniteLight, 0, 4.4, 0);
  b.box(0.9, 0.2, 0.2, COL.graniteLight, 0, 4.5, 0);
  b.pop();
}
function wall(b, x1, z1, x2, z2, yAt) {
  const len = Math.hypot(x2 - x1, z2 - z1),
    steps = Math.ceil(len / 1.6);
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps,
      x = x1 + (x2 - x1) * t,
      z = z1 + (z2 - z1) * t;
    b.box(
      len / steps + 0.1,
      0.75 + b.r() * 0.2,
      0.55,
      b.r() < 0.5 ? COL.granite : COL.graniteDark,
      x,
      yAt(x, z) + 0.3,
      z,
      Math.atan2(-(z2 - z1), x2 - x1),
    );
  }
}
function chapel(b, glow, x, y, z, ry) {
  b.push(x, y, z, ry);
  glow.push(x, y, z, ry);
  b.box(9, 0.8, 14, COL.graniteDark, 0, 0.1, 0);
  b.box(7, 5.5, 12, COL.granite, 0, 3, 0);
  b.roof(7.6, 2.4, 12.4, COL.tileDark, 0, 5.7, 0);
  b.box(9.4, 6.6, 1.4, COL.graniteLight, 0, 3.5, -6.3);
  for (const sx of [-1, 1]) {
    b.box(2.4, 9.5, 2.4, COL.graniteLight, sx * 3.6, 4.8, -6.3);
    b.box(2.7, 0.3, 2.7, COL.granite, sx * 3.6, 9.7, -6.3);
    b.box(1.9, 2.2, 1.9, COL.graniteLight, sx * 3.6, 10.9, -6.3);
    b.cone(1.35, 2.2, COL.graniteDark, sx * 3.6, 13.1, -6.3, 4, Math.PI / 4);
    b.box(0.12, 0.9, 0.12, COL.graniteLight, sx * 3.6, 14.6, -6.3);
    glow.box(0.9, 1.2, 0.1, WINDOW_GLOW, sx * 3.6, 10.9, -7.3);
  }
  b.roof(5.4, 1.8, 1.5, COL.graniteLight, 0, 6.8, -6.3, Math.PI / 2);
  b.box(1.8, 3, 0.2, COL.woodDark, 0, 1.9, -7.05);
  glow.box(1.1, 1.1, 0.1, WINDOW_GLOW, 0, 5, -7.05);
  for (const sz of [-2, 2]) for (const sx of [-1, 1]) glow.box(0.12, 1.4, 0.9, WINDOW_GLOW, sx * 3.55, 3.2, sz);
  b.pop();
  glow.pop();
}
function castro(b, at) {
  const r = b.r;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI2 + r() * 0.4,
      d = 3.2 + r() * 3.2,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    const y = at(x, z);
    b.cyl(1.7, 1.8, 1.7, r() < 0.5 ? COL.granite : COL.graniteDark, x, y + 0.7, z, 9);
    b.cone(2.15, 1.9, 0xa8935b, x, y + 2.5, z, 9);
    b.box(0.7, 1.1, 0.2, COL.woodDark, x + Math.cos(a) * 1.75, y + 0.6, z + Math.sin(a) * 1.75, -a + Math.PI / 2);
  }
  for (const R of [8.5, 11.5]) {
    const n = Math.round(R * 2.2);
    for (let i = 0; i < n; i++) {
      if (i === 0) continue;
      const a = (i / n) * PI2,
        x = Math.cos(a) * R,
        z = Math.sin(a) * R;
      b.box(
        (PI2 * R) / n + 0.15,
        1 + r() * 0.3,
        0.9,
        r() < 0.5 ? COL.granite : COL.graniteDark,
        x,
        at(x, z) + 0.35,
        z,
        -a + Math.PI / 2,
      );
    }
  }
}
function dock(b, x, z, ry, len = 14) {
  b.push(x, 0, z, ry);
  b.box(2.6, 0.25, len, COL.woodLight, 0, 0.55, len / 2);
  for (let i = 0; i <= len; i += 3.5)
    for (const sx of [-1, 1]) b.cyl(0.15, 0.17, 3.2, COL.woodDark, sx * 1.2, -0.9, i, 6);
  b.pop();
}
export function dorna(b, x, y, z, ry, color = 0x2f6b8a) {
  b.push(x, y, z, ry);
  b.box(1.5, 0.5, 4.2, color, 0, 0.1, 0);
  b.box(1.15, 0.4, 1.2, color, 0, 0.2, -2.4, 0, -0.35);
  b.box(1.1, 0.4, 1, color, 0, 0.2, 2.3, 0, 0.25);
  b.box(1.6, 0.12, 4.4, 0xe9e2cf, 0, 0.4, 0);
  b.box(1.2, 0.08, 3.6, COL.woodLight, 0, 0.2, 0);
  b.cyl(0.05, 0.07, 3.4, COL.woodDark, 0, 1.9, -0.8, 5);
  b.pop();
}
function batea(b, x, z) {
  b.push(x, 0, z, 0.3);
  b.box(9, 0.35, 9, COL.woodDark, 0, 0.35, 0);
  for (let i = -4; i <= 4; i += 2) {
    b.box(9.4, 0.3, 0.35, COL.wood, 0, 0.6, i);
    b.box(0.35, 0.3, 9.4, COL.wood, i, 0.7, 0);
  }
  b.box(2, 1.6, 1.6, 0xd8d2c0, 3, 1.4, 3);
  b.roof(2.2, 0.6, 1.8, COL.tile, 3, 2.2, 3, Math.PI / 2);
  b.pop();
}
function lighthouse(b, glow, x, y, z) {
  b.push(x, y, z, 0);
  glow.push(x, y, z, 0);
  b.box(13, 1, 10, COL.graniteDark, 0, 0.2, -2);
  b.box(10, 4.4, 7, COL.graniteLight, 0, 2.6, -3.5);
  b.roof(10.6, 1.7, 7.6, COL.tile, 0, 4.8, -3.5, Math.PI / 2);
  for (const sx of [-3.4, -1.1, 1.1, 3.4]) windowAt(b, glow, sx, 2.6, -7.05, 0, 0.8, 1.3, COL.frameGreen);
  b.box(1.4, 2.4, 0.2, COL.woodDark, 0, 1.4, 3.1);
  b.cyl(3.2, 3.4, 1.5, COL.granite, 0, 1, 0, 8, Math.PI / 8);
  b.cyl(2.6, 3.1, 13, COL.graniteLight, 0, 8, 0, 8, Math.PI / 8);
  b.cyl(3.3, 3.3, 0.5, COL.granite, 0, 14.6, 0, 8, Math.PI / 8);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI2;
    b.box(0.08, 0.9, 0.08, 0x2c3236, Math.cos(a) * 3.15, 15.3, Math.sin(a) * 3.15);
  }
  b.cyl(3.2, 3.2, 0.08, 0x2c3236, 0, 15.75, 0, 16);
  b.cyl(1.75, 1.75, 0.5, COL.granite, 0, 15.1, 0, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI2 + Math.PI / 8;
    b.box(0.12, 2.6, 0.12, 0x2c3236, Math.cos(a) * 1.7, 16.6, Math.sin(a) * 1.7);
  }
  b.cyl(1.9, 1.9, 0.3, 0x2c3236, 0, 18, 0, 8);
  b.cone(1.95, 1.7, 0x3b4a4e, 0, 19, 0, 8);
  b.cyl(0.08, 0.08, 1.4, 0x2c3236, 0, 20.4, 0, 5);
  for (let j = 0; j < 3; j++) windowAt(b, glow, 0, 5 + j * 3.2, 3.05 - j * 0.17, 0, 0.55, 1.1, COL.frameGreen);
  b.pop();
  glow.pop();
  return new THREE.Vector3(x, y + 16.6, z);
}

const BATEAS = [
  [18, 62],
  [30, 70],
  [14, 76],
];
const MOORED = [
  [-11, 96, -0.6, 0x2f6b8a],
  [-22.5, 96.8, -0.7, 0xa5432f],
  [-15, 102, -0.5, 0x3d7a4a],
];

export function createWorld(scene, quality) {
  const materials = {
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    veg: swayMaterial(),
  };
  const r = rng(20261013);
  const addVeg = buildVegetation(scene, materials);
  let vegMeshes = [];
  const lamp = new THREE.Vector3();
  const props = { colliders: [], landmarks: {} };
  const solid = new Builder(5),
    glow = new Builder(6);
  const faroSolid = new Builder(15),
    faroGlow = new Builder(16),
    faroAnchor = new THREE.Vector3();
  const mooredSolid = new Builder(17);
  const horreoSolid = new Builder(18),
    horreos = [];
  const horreoAt = (isl, lx, y, lz, ry, s) => {
    horreoSolid.push(isl.x, 0, isl.z, 0);
    horreo(horreoSolid, lx, y, lz, ry, s);
    horreoSolid.pop();
    horreos.push([isl.x + lx, y, isl.z + lz, ry, s]);
  };
  const yAtIsl = (isl) => (lx, lz) => islandHeight(isl, lx, lz);

  for (const isl of ISLANDS) {
    scene.add(islandMesh(isl, materials.terrain));
    const at = yAtIsl(isl),
      ex = [];
    const W = (lx, lz) => ({ x: isl.x + lx, y: at(lx, lz), z: isl.z + lz });
    solid.push(isl.x, 0, isl.z, 0);
    glow.push(isl.x, 0, isl.z, 0);
    const place = (lx, lz, rad) => {
      ex.push({ x: isl.x + lx, z: isl.z + lz, r: rad });
      return at(lx, lz);
    };
    switch (isl.type) {
      case 'faro': {
        const y = place(-4, 10, 11) - 0.3;
        faroSolid.push(isl.x, 0, isl.z, 0);
        faroGlow.push(isl.x, 0, isl.z, 0);
        lighthouse(faroSolid, faroGlow, -4, y, 10);
        faroSolid.pop();
        faroGlow.pop();
        lamp.set(isl.x - 4, y + 16.6, isl.z + 10);
        faroAnchor.set(isl.x - 4, y, isl.z + 10);
        cruceiro(solid, 8, place(8, 4, 2.5) - 0.2, 4, 0.4);
        house(solid, glow, 12, place(12, -4, 5) - 0.3, -4, 0.5, 0.8, { stone: true });
        wall(solid, -16, 2, -6, -6, at);
        wall(solid, 4, -8, 18, -2, at);
        props.landmarks.faro = W(-4, 10);
        break;
      }
      case 'chapel': {
        chapel(solid, glow, 0, place(0, 0, 10) - 0.3, 0, -1.9);
        cruceiro(solid, 7, place(7, 7, 2.5) - 0.2, 7);
        const y = place(-10, 6, 3);
        solid.dodeca(2.2, COL.granite, -10, y + 1.4, 6, 1.6, 0.8, 1.2, 0.4);
        props.landmarks.abalar = W(-10, 6);
        break;
      }
      case 'forest':
        house(solid, glow, 4, place(4, 4, 5) - 0.3, 4, -0.6, 0.8, { stone: true, solaina: true });
        horreoAt(isl, 9, place(9, -1, 4) - 0.3, -1, 0.3, 0.7);
        break;
      case 'castro':
        castro(solid, at);
        place(0, 0, 13);
        break;
      case 'beach': {
        house(solid, glow, 8, place(8, -4, 5) - 0.3, -4, 1.2, 0.75);
        horreoAt(isl, 13, place(13, 2, 4) - 0.3, 2, 0.2, 0.6);
        break;
      }
      case 'village': {
        const spots = [
          [-4, -2, 0.3],
          [3, -4, -0.3],
          [8, 1, 0.8],
          [-9, 3, 1.4],
          [1, 4, 2.6],
        ];
        spots.forEach(([lx, lz, ry], i) =>
          house(solid, glow, lx, place(lx, lz, 5) - 0.3, lz, ry + Math.PI, 0.72, { solaina: i === 0 }),
        );
        horreoAt(isl, -2, place(-2, 8, 4) - 0.3, 8, 0.3, 0.7);
        horreoAt(isl, 5, place(5, 8, 4) - 0.3, 8, 0.2, 0.6);
        cruceiro(solid, -7, place(-7, -6, 2) - 0.2, -6);
        break;
      }
      case 'sereia':
        cruceiro(solid, 2, place(2, 2, 2) - 0.2, 2);
        break;
    }
    solid.pop();
    glow.pop();
    vegMeshes = addVeg(isl, scatterVegetation(isl, ex, r));
  }
  dock(solid, -14, 91, -0.7, 14);
  for (const [x, z, ry, c] of MOORED) {
    dorna(mooredSolid, x, 0.1, z, ry, c);
    for (const f of [-1.6, 1.4]) props.colliders.push({ x: x - Math.sin(ry) * f, z: z - Math.cos(ry) * f, r: 1.5 });
  }
  const bateaSolid = new Builder(19);
  for (const [x, z] of BATEAS) {
    batea(bateaSolid, x, z);
    props.colliders.push({ x, z, r: 6.2 });
  }

  const solidMesh = solid.mesh(materials.solid);
  scene.add(solidMesh);
  const glowMesh = glow.mesh(materials.glow, { cast: false, receive: false });
  scene.add(glowMesh);
  const mooredFallback = mooredSolid.mesh(materials.solid);
  scene.add(mooredFallback);
  const horreoFallback = horreoSolid.mesh(materials.solid);
  scene.add(horreoFallback);
  const bateaFallback = bateaSolid.mesh(materials.solid);
  scene.add(bateaFallback);
  function attachBateas(root) {
    const model = root.getObjectByName('Batea');
    if (!model) return false;
    for (const [x, z] of BATEAS) {
      const holder = new THREE.Group();
      holder.rotation.order = 'YXZ';
      holder.add(model.clone());
      holder.position.set(x, 0, z);
      holder.rotation.y = 0.3;
      scene.add(holder);
      floating.push({ holder, x, z, ry: 0.3, damp: waveDamp(-heightAt(x, z)), half: 4, base: 0, k: 0.5 });
    }
    scene.remove(bateaFallback);
    bateaFallback.geometry.dispose();
    return true;
  }
  function attachHorreos(root) {
    const model = root.getObjectByName('Horreo');
    if (!model) return false;
    for (const [x, y, z, ry, s] of horreos) {
      const h = model.clone();
      h.position.set(x, y, z);
      h.rotation.set(0, ry, 0);
      h.scale.setScalar(s);
      scene.add(h);
    }
    scene.remove(horreoFallback);
    horreoFallback.geometry.dispose();
    return true;
  }
  const floating = [];
  function attachMoored(root) {
    const nodes = MOORED.map((_, i) => root.getObjectByName(`Dorna_${'ABC'[i]}`));
    if (nodes.some((n) => !n)) return false;
    MOORED.forEach(([x, z, ry], i) => {
      const holder = new THREE.Group();
      holder.name = `Moored_${'ABC'[i]}`;
      holder.rotation.order = 'YXZ';
      nodes[i].position.set(0, 0, 0);
      holder.add(nodes[i]);
      holder.position.set(x, 0.2, z);
      holder.rotation.y = ry;
      scene.add(holder);
      floating.push({ holder, x, z, ry, damp: waveDamp(-heightAt(x, z)), half: 2.2, base: 0.2, k: 1 });
    });
    scene.remove(mooredFallback);
    mooredFallback.geometry.dispose();
    return true;
  }
  const faroFallback = [
    faroSolid.mesh(materials.solid),
    faroGlow.mesh(materials.glow, { cast: false, receive: false }),
  ];
  faroFallback.forEach((m) => scene.add(m));
  const faroMats = {};
  function attachFaro(root) {
    const faro = root.getObjectByName('Faro'),
      far = root.getObjectByName('Faro_LOD1');
    if (!faro) return false;
    const holder = new THREE.LOD();
    holder.name = 'FaroModel';
    holder.position.copy(faroAnchor);
    holder.addLevel(faro, 0);
    if (far) holder.addLevel(far, 110);
    scene.add(holder);
    for (const m of faroFallback) {
      scene.remove(m);
      m.geometry.dispose();
    }
    faro.traverse((o) => {
      if (o.isMesh) faroMats[o.material.name] = o.material;
    });
    return true;
  }
  function setLamp(power) {
    if (faroMats.LensGlow) faroMats.LensGlow.emissiveIntensity = power;
  }

  function setQuality(q) {
    for (const m of vegMeshes) {
      const n = Math.max(1, Math.round(m.total * q.veg));
      m.hi.count = n;
      m.lo.count = n;
    }
  }
  setQuality(quality);
  function update(t, night) {
    windUniform.value = t;
    for (const b of floating) {
      const fx = -Math.sin(b.ry),
        fz = -Math.cos(b.ry),
        rx = Math.cos(b.ry),
        rz = -Math.sin(b.ry);
      const w = (d, s) => waveHeight(b.x + fx * d + rx * s, b.z + fz * d + rz * s, t, b.damp);
      const hb = w(b.half, 0),
        hs = w(-b.half, 0),
        hp = w(0, -b.half / 2),
        hst = w(0, b.half / 2);
      b.holder.position.y = ((hb + hs + hp + hst) / 4) * b.k + b.base;
      b.holder.rotation.x = Math.atan2(hb - hs, 2 * b.half) * b.k;
      b.holder.rotation.z = Math.atan2(hst - hp, b.half) * b.k;
    }
    const k = 0.09 + night * 0.95;
    materials.glow.color.setRGB(k, k * 0.92, k * 0.8);
    if (faroMats.WindowGlass) faroMats.WindowGlass.emissiveIntensity = night * 1.8;
  }
  return {
    lamp,
    props,
    update,
    setQuality,
    materials,
    heightAt,
    attachFaro,
    attachMoored,
    attachHorreos,
    attachBateas,
    setLamp,
  };
}
