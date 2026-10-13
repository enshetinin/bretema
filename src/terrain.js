import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeNoise } from './util.js';

export const ISLANDS = [
  {
    id: 'fisterra',
    name: 'Cabo Fisterra',
    x: 9,
    z: -91,
    rx: 28,
    rz: 20,
    h: 12,
    seed: 111,
    type: 'faro',
    cliffDir: 2.0,
    cliffAmt: 1,
  },
  {
    id: 'muxia',
    name: 'Muxía',
    x: -61,
    z: -48,
    rx: 18,
    rz: 18,
    h: 8,
    seed: 222,
    type: 'chapel',
    cliffDir: Math.PI,
    cliffAmt: 0.85,
  },
  {
    id: 'ons',
    name: 'Illa de Ons',
    x: 64,
    z: -45,
    rx: 21,
    rz: 17,
    h: 9,
    seed: 333,
    type: 'forest',
    cliffDir: -2.3,
    cliffAmt: 0.9,
  },
  {
    id: 'barona',
    name: 'Castro de Baroña',
    x: -52,
    z: 8,
    rx: 17,
    rz: 15,
    h: 7,
    seed: 444,
    type: 'castro',
    cliffDir: Math.PI,
    cliffAmt: 0.75,
  },
  {
    id: 'cies',
    name: 'Illas Cíes',
    x: 52,
    z: 29,
    rx: 25,
    rz: 18,
    h: 10,
    seed: 555,
    type: 'beach',
    cliffDir: 0,
    cliffAmt: 1,
  },
  {
    id: 'porto',
    name: 'Porto do Son',
    x: -24,
    z: 79,
    rx: 19,
    rz: 15,
    h: 6,
    seed: 666,
    type: 'village',
    cliffDir: 2.6,
    cliffAmt: 0.55,
  },
  {
    id: 'bois',
    name: 'Os Bois',
    x: -4,
    z: -13,
    rx: 11,
    rz: 9,
    h: 5,
    seed: 777,
    type: 'rock',
    cliffDir: 0,
    cliffAmt: 1,
    allCliff: true,
  },
  {
    id: 'salvora',
    name: 'Sálvora',
    x: 88,
    z: -1,
    rx: 13,
    rz: 12,
    h: 6,
    seed: 888,
    type: 'sereia',
    cliffDir: 0.3,
    cliffAmt: 0.8,
  },
  {
    id: 'centolo',
    name: 'O Centolo',
    x: -26,
    z: -98,
    rx: 5,
    rz: 4.2,
    h: 7,
    seed: 901,
    type: 'stack',
    cliffDir: 0,
    cliffAmt: 1,
    allCliff: true,
  },
  {
    id: 'lobeiras',
    name: 'As Lobeiras',
    x: -88,
    z: -24,
    rx: 4,
    rz: 3.6,
    h: 5,
    seed: 902,
    type: 'stack',
    cliffDir: 0,
    cliffAmt: 1,
    allCliff: true,
  },
  {
    id: 'meixidos',
    name: 'Meixidos',
    x: 104,
    z: 32,
    rx: 3.6,
    rz: 3.2,
    h: 4.5,
    seed: 903,
    type: 'stack',
    cliffDir: 0,
    cliffAmt: 1,
    allCliff: true,
  },
  {
    id: 'carreiro',
    name: 'O Carreiro',
    x: 30,
    z: -112,
    rx: 4.4,
    rz: 3.8,
    h: 6,
    seed: 904,
    type: 'stack',
    cliffDir: 0,
    cliffAmt: 1,
    allCliff: true,
  },
];
export const WORLD = { min: -230, size: 460, bound: 196 };
export const SEA_FLOOR = -7;
const noise = makeNoise(4242);

function cliffness(isl, a) {
  if (isl.allCliff) return 1;
  return smoothstep(-0.2, 0.6, Math.cos(a - isl.cliffDir)) * isl.cliffAmt;
}
export function islandJitter(isl, a) {
  return (
    1 +
    Math.sin(a * 4 + isl.seed) * 0.07 +
    Math.sin(a * 7 + isl.seed * 0.37) * 0.045 +
    Math.sin(a * 13 + isl.seed * 1.3) * 0.02
  );
}
export function islandHeight(isl, lx, lz) {
  const nx = lx / isl.rx,
    nz = lz / isl.rz;
  const a = Math.atan2(nz, nx);
  const r = Math.hypot(nx, nz) / islandJitter(isl, a);
  if (r > 1.6) return SEA_FLOOR;
  const c = cliffness(isl, a);
  if (r > 1) return Math.max(SEA_FLOOR, -(r - 1) * lerp(7, 26, c) - (r - 1) * (r - 1) * 10);
  const n = noise.fbm(lx * 0.085 + isl.seed, lz * 0.085 - isl.seed, 3) * smoothstep(1, 0.55, r);
  const top = isl.h * (1 - 0.32 * r * r) + n * isl.h * 0.22;
  const beach = top * smoothstep(1, 0.5, r) * (1 - 0.25 * smoothstep(0.8, 1, r));
  const cliff =
    top * (1 - smoothstep(0.84, 1, r)) +
    Math.sin(a * 23 + isl.seed) * 0.35 * smoothstep(0.8, 0.95, r) * (1 - smoothstep(0.95, 1, r));
  return lerp(beach, cliff, c);
}
export function heightAt(x, z) {
  let h = SEA_FLOOR;
  for (const isl of ISLANDS) {
    const dx = x - isl.x,
      dz = z - isl.z;
    if (Math.abs(dx) > isl.rx * 1.7 || Math.abs(dz) > isl.rz * 1.7) continue;
    const v = islandHeight(isl, dx, dz);
    if (v > h) h = v;
  }
  return h;
}
export function nearestIsland(x, z) {
  let best = null,
    bd = Infinity;
  for (const isl of ISLANDS) {
    const d = Math.hypot((x - isl.x) / isl.rx, (z - isl.z) / isl.rz);
    if (d < bd) {
      bd = d;
      best = isl;
    }
  }
  return best;
}
export function seaward(x, z, out) {
  const e = 0.35,
    hx = heightAt(x + e, z) - heightAt(x - e, z),
    hz = heightAt(x, z + e) - heightAt(x, z - e);
  const l = Math.hypot(hx, hz) || 1;
  out.x = -hx / l;
  out.z = -hz / l;
  return out;
}

export function bakeHeightTexture(res = 512) {
  const data = new Uint8Array(res * res * 4),
    heights = new Float32Array(res * res);
  const step = WORLD.size / res;
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      const x = WORLD.min + (i + 0.5) * step,
        z = WORLD.min + (j + 0.5) * step;
      const h = heightAt(x, z),
        k = j * res + i;
      heights[k] = h;
      data[k * 4] = Math.round(clamp((h - SEA_FLOOR) / 10, 0, 1) * 255);
      data[k * 4 + 1] = data[k * 4 + 2] = 0;
      data[k * 4 + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, heights, res, step };
}

export const WAVES = [
  [0.8, 0.6, 0.1, 1.1, 0.3],
  [-0.42, 0.9, 0.16, 1.55, 0.17],
  [0.95, -0.3, 0.23, 1.95, 0.09],
  [0.2, 0.98, 0.05, 0.7, 0.36],
];
export const waveDamp = (depth) => smoothstep(0.2, 3.5, depth);
export function waveHeight(x, z, t, damp = 1) {
  let y = 0;
  for (const w of WAVES) y += Math.sin((w[0] * x + w[1] * z) * w[2] + t * w[3]) * w[4];
  return y * damp;
}
export const WAVES_GLSL = `
  const vec4 W0=vec4(.8,.6,.10,1.10);const vec4 W1=vec4(-.42,.9,.16,1.55);const vec4 W2=vec4(.95,-.3,.23,1.95);const vec4 W3=vec4(.2,.98,.05,.70);
  const vec4 WA=vec4(.30,.17,.09,.36);
  float waveSum(vec2 p,float t,out vec2 grad){
    float y=0.;grad=vec2(0.);
    float a;
    a=dot(W0.xy,p)*W0.z+t*W0.w;y+=sin(a)*WA.x;grad+=cos(a)*WA.x*W0.z*W0.xy;
    a=dot(W1.xy,p)*W1.z+t*W1.w;y+=sin(a)*WA.y;grad+=cos(a)*WA.y*W1.z*W1.xy;
    a=dot(W2.xy,p)*W2.z+t*W2.w;y+=sin(a)*WA.z;grad+=cos(a)*WA.z*W2.z*W2.xy;
    a=dot(W3.xy,p)*W3.z+t*W3.w;y+=sin(a)*WA.w;grad+=cos(a)*WA.w*W3.z*W3.xy;
    return y;
  }`;
