import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  EXTTextureWebP,
  EXTMeshoptCompression,
  KHRMeshQuantization,
  KHRMaterialsEmissiveStrength,
} from '@gltf-transform/extensions';
import { weld, dedup, prune, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { writeFile } from 'node:fs/promises';

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _n = new THREE.Vector3(),
  _t = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function projectUV(g, mode) {
  const p = g.attributes.position,
    n = p.count,
    uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 3) {
    _a.fromBufferAttribute(p, i);
    _b.fromBufferAttribute(p, i + 1);
    _c.fromBufferAttribute(p, i + 2);
    _n.subVectors(_c, _b).cross(_t.subVectors(_a, _b)).normalize();
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? _a : k === 1 ? _b : _c;
      let u0, v0;
      if (mode === 'cyl') {
        const ang = Math.atan2(v.z, v.x),
          r = Math.hypot(v.x, v.z);
        u0 = ang * Math.max(r, 0.05);
        v0 = -v.y;
      } else if (mode === 'roof') {
        _t.crossVectors(UP, _n);
        if (_t.lengthSq() < 1e-6) _t.set(1, 0, 0);
        _t.normalize();
        const b = new THREE.Vector3().crossVectors(_n, _t);
        u0 = v.dot(_t);
        v0 = -v.dot(b);
      } else if (mode === 'box') {
        const ax = Math.abs(_n.x),
          ay = Math.abs(_n.y),
          az = Math.abs(_n.z);
        if (ay >= ax && ay >= az) {
          u0 = v.x;
          v0 = v.z;
        } else if (ax >= az) {
          u0 = v.z;
          v0 = -v.y;
        } else {
          u0 = v.x;
          v0 = -v.y;
        }
      } else {
        if (Math.abs(_n.y) > 0.7) {
          u0 = v.x;
          v0 = v.z;
        } else {
          _t.crossVectors(UP, _n).normalize();
          u0 = v.dot(_t);
          v0 = -v.y;
        }
      }
      uv[(i + k) * 2] = u0;
      uv[(i + k) * 2 + 1] = v0;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class ModelBuilder {
  constructor(name) {
    this.name = name;
    this.nodes = new Map();
    this.mats = new Map();
  }
  material(name, opts) {
    this.mats.set(name, { name, tile: 1, color: [1, 1, 1], ...opts });
    return name;
  }
  node(name, translation = [0, 0, 0]) {
    if (!this.nodes.has(name)) this.nodes.set(name, { name, translation, parts: new Map() });
    const node = this.nodes.get(name);
    return { add: (mat, geo, opts) => this._add(node, mat, geo, opts) };
  }
  _add(node, matName, geo, { matrix, uv = 'box', color } = {}) {
    const mat = this.mats.get(matName);
    if (!mat) throw new Error('unknown material ' + matName);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (uv === 'wall' || uv === 'box' || uv === 'cyl' || uv === 'roof') projectUV(g, uv);
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (uv !== 'unit') {
      const a = g.attributes.uv;
      for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) / mat.tile, a.getY(i) / mat.tile);
    }
    if (!g.attributes.color) {
      const c = color || [1, 1, 1],
        arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = c[0];
        arr[i + 1] = c[1];
        arr[i + 2] = c[2];
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    if (!node.parts.has(matName)) node.parts.set(matName, []);
    node.parts.get(matName).push(g);
    return g;
  }
  stats() {
    let tris = 0;
    for (const n of this.nodes.values())
      for (const gs of n.parts.values()) for (const g of gs) tris += g.attributes.position.count / 3;
    return { tris };
  }
  async write(path, textures) {
    const doc = new Document();
    doc.createBuffer();
    doc.createExtension(EXTTextureWebP).setRequired(true);
    doc.createExtension(KHRMeshQuantization).setRequired(true);
    const emissiveExt = doc.createExtension(KHRMaterialsEmissiveStrength);
    const scene = doc.createScene(this.name);
    const texCache = new Map();
    const tex = (set, kind) => {
      const key = set + ':' + kind;
      if (!texCache.has(key))
        texCache.set(
          key,
          doc
            .createTexture(`${set}_${kind}`)
            .setImage(textures[set][kind])
            .setMimeType('image/webp')
            .setURI(`${set}_${kind}.webp`),
        );
      return texCache.get(key);
    };
    const matCache = new Map();
    const material = (name) => {
      if (matCache.has(name)) return matCache.get(name);
      const o = this.mats.get(name),
        m = doc.createMaterial(name);
      m.setBaseColorFactor([...o.color.map(lin), 1])
        .setRoughnessFactor(o.rough ?? 1)
        .setMetallicFactor(o.metal ?? 1)
        .setDoubleSided(!!o.double);
      if (o.set) {
        m.setBaseColorTexture(tex(o.set, 'baseColor'))
          .setNormalTexture(tex(o.set, 'normal'))
          .setNormalScale(o.normalScale ?? 1)
          .setMetallicRoughnessTexture(tex(o.set, 'orm'))
          .setOcclusionTexture(tex(o.set, 'orm'))
          .setOcclusionStrength(o.aoStrength ?? 1);
      } else {
        m.setMetallicFactor(o.metal ?? 0);
        m.setRoughnessFactor(o.rough ?? 0.5);
      }
      if (o.mask) m.setAlphaMode('MASK').setAlphaCutoff(0.5);
      if (o.blend) m.setAlphaMode('BLEND').setBaseColorFactor([...o.color.map(lin), o.opacity ?? 0.5]);
      if (o.emissive) {
        m.setEmissiveFactor(o.emissive.map(lin));
        if (o.emissiveStrength)
          m.setExtension(
            'KHR_materials_emissive_strength',
            emissiveExt.createEmissiveStrength().setEmissiveStrength(o.emissiveStrength),
          );
      }
      matCache.set(name, m);
      return m;
    };
    for (const n of this.nodes.values()) {
      const node = doc.createNode(n.name).setTranslation(n.translation);
      const mesh = doc.createMesh(n.name);
      for (const [matName, geos] of n.parts) {
        const g = mergeGeometries(geos, false);
        const prim = doc.createPrimitive().setMaterial(material(matName));
        prim.setAttribute(
          'POSITION',
          doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.position.array)),
        );
        prim.setAttribute(
          'NORMAL',
          doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes.normal.array)),
        );
        prim.setAttribute(
          'TEXCOORD_0',
          doc.createAccessor().setType('VEC2').setArray(new Float32Array(g.attributes.uv.array)),
        );
        const col = g.attributes.color.array;
        if (col.some((v) => v !== 1))
          prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(col, lin)));
        mesh.addPrimitive(prim);
      }
      node.setMesh(mesh);
      scene.addChild(node);
    }
    await MeshoptEncoder.ready;
    await doc.transform(
      weld(),
      dedup(),
      prune(),
      reorder({ encoder: MeshoptEncoder }),
      quantize({ quantizeNormal: 10, quantizeTexcoord: 14 }),
    );
    doc
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const io = new NodeIO()
      .registerExtensions([EXTTextureWebP, EXTMeshoptCompression, KHRMeshQuantization, KHRMaterialsEmissiveStrength])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
    const glb = await io.writeBinary(doc);
    await writeFile(path, glb);
    return glb.byteLength;
  }
}

export const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );

export function sweep(path, profile, { closed = false, up = new THREE.Vector3(0, 1, 0), scale } = {}) {
  const pos = [],
    uvs = [],
    idx = [];
  const P = path.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p)));
  let len = 0;
  const L = [0];
  for (let i = 1; i < P.length; i++) {
    len += P[i].distanceTo(P[i - 1]);
    L.push(len);
  }
  const T = new THREE.Vector3(),
    N = new THREE.Vector3(),
    B = new THREE.Vector3();
  const prof = profile.map(([x, y]) => [x, y]);
  let plen = 0;
  const PL = [0];
  for (let i = 1; i < prof.length; i++) {
    plen += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
    PL.push(plen);
  }
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)],
      b = P[Math.min(P.length - 1, i + 1)];
    T.subVectors(b, a).normalize();
    B.crossVectors(T, up);
    if (B.lengthSq() < 1e-6) B.set(1, 0, 0);
    B.normalize();
    N.crossVectors(B, T).normalize();
    const s = scale ? scale(L[i] / len) : 1;
    for (let k = 0; k < prof.length; k++) {
      const [x, y] = prof[k];
      pos.push(P[i].x + (B.x * x + N.x * y) * s, P[i].y + (B.y * x + N.y * y) * s, P[i].z + (B.z * x + N.z * y) * s);
      uvs.push(L[i], PL[k]);
    }
  }
  const n = prof.length;
  for (let i = 0; i < P.length - 1; i++)
    for (let k = 0; k < n - (closed ? 0 : 1); k++) {
      const k2 = (k + 1) % n,
        a = i * n + k,
        b = i * n + k2,
        c = (i + 1) * n + k,
        d = (i + 1) * n + k2;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export const rectProfile = (w, h) => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];
export const circleProfile = (r, n = 8) =>
  Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);
export function roundedBox(w, h, d, r = 0.04, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg),
    p = g.attributes.position,
    v = new THREE.Vector3();
  const hx = w / 2 - r,
    hy = h / 2 - r,
    hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(
      THREE.MathUtils.clamp(v.x, -hx, hx),
      THREE.MathUtils.clamp(v.y, -hy, hy),
      THREE.MathUtils.clamp(v.z, -hz, hz),
    );
    const dir = v.clone().sub(c);
    if (dir.lengthSq() > 1e-9) dir.setLength(r);
    v.copy(c).add(dir);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
