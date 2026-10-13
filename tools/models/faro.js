import * as THREE from 'three';
import { ModelBuilder, M, sweep, circleProfile, roundedBox } from './lib/model.js';
import { hex } from './lib/tex.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const OCT = Math.PI / 8;

const octLathe = (profile, seg = 8) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    OCT,
  );

export function buildFaro() {
  const mb = new ModelBuilder('faro_fisterra');
  faroInto(mb, 'Faro', 0);
  faroInto(mb, 'Faro_LOD1', 1);
  return mb;
}

function faroInto(mb, nodeName, lod) {
  const full = lod === 0;
  if (!mb.mats.has('Granite')) {
    mb.material('Granite', { set: 'granite', tile: 3, rough: 1, metal: 1 });
    mb.material('GraniteDressed', {
      set: 'granite',
      tile: 1.6,
      color: [1.08, 1.06, 1.02],
      rough: 1,
      metal: 1,
      normalScale: 0.5,
    });
    mb.material('Tile', { set: 'tile', tile: 2, rough: 1, metal: 1 });
    mb.material('IronPaint', { set: 'paint_iron', tile: 1, color: hex(0x31443f), rough: 1, metal: 1 });
    mb.material('FramePaint', { set: 'paint', tile: 1.5, color: hex(0xf2efe6), rough: 1, metal: 1 });
    mb.material('ShutterPaint', { set: 'paint', tile: 1.5, color: hex(0x2f6b55), rough: 1, metal: 1 });
    mb.material('DoorWood', { set: 'wood', tile: 1.2, color: [0.7, 0.6, 0.52], rough: 1, metal: 1 });
    mb.material('Copper', { set: 'copper', tile: 1.5, rough: 1, metal: 1 });
    mb.material('WindowGlass', {
      color: hex(0x23343b),
      rough: 0.08,
      metal: 0.1,
      emissive: hex(0xffc277),
      emissiveStrength: 1,
    });
    mb.material('LanternGlass', {
      color: hex(0xcfe3e6),
      rough: 0.04,
      metal: 0,
      blend: true,
      opacity: 0.22,
      double: true,
    });
    mb.material('LensGlow', {
      color: hex(0xfff0cf),
      rough: 0.1,
      metal: 0.2,
      emissive: hex(0xffd59a),
      emissiveStrength: 1,
    });
  }
  const rb = (w, h, d, r) => roundedBox(w, h, d, r, full ? 2 : 1);
  const n = mb.node(nodeName);
  const add = (mat, g, matrix, uv = 'wall') => n.add(mat, g, { matrix, uv });

  function windowUnit(m, w, h, { arch = false, shutters = false, bars = 2 } = {}) {
    const T = (g, mat, local, uv = 'wall') => add(mat, g, m.clone().multiply(local), uv);
    const o = 0.09,
      top = arch ? h / 2 - w / 2 : h / 2;
    const path = [V(-w / 2 - o, -h / 2 - 0.02, 0), V(-w / 2 - o, top, 0)];
    if (arch)
      for (let i = 1; i < 12; i++) {
        const a = Math.PI - (i / 12) * Math.PI;
        path.push(V(Math.cos(a) * (w / 2 + o), top + Math.sin(a) * (w / 2 + o), 0));
      }
    path.push(V(w / 2 + o, top, 0), V(w / 2 + o, -h / 2 - 0.02, 0));
    if (full)
      T(
        sweep(
          path,
          [
            [-0.11, 0],
            [0.11, 0],
            [0.11, 0.1],
            [0.06, 0.14],
            [-0.11, 0.14],
          ],
          { up: V(0, 0, 1) },
        ),
        'GraniteDressed',
        M(),
        'box',
      );
    T(rb(w + 0.5, 0.12, 0.26, 0.03), 'GraniteDressed', M(0, -h / 2 - 0.08, 0.1), 'box');
    const glass = arch
      ? (() => {
          const s = new THREE.Shape();
          s.moveTo(-w / 2, -h / 2);
          s.lineTo(w / 2, -h / 2);
          s.lineTo(w / 2, top);
          s.absarc(0, top, w / 2, 0, Math.PI, false);
          s.lineTo(-w / 2, -h / 2);
          return new THREE.ShapeGeometry(s, 12);
        })()
      : new THREE.PlaneGeometry(w, h);
    T(glass, 'WindowGlass', M(0, 0, 0.015), 'box');
    if (!full) return;
    const f = 0.055,
      fz = 0.04;
    T(new THREE.BoxGeometry(f, arch ? top + h / 2 : h, f), 'FramePaint', M(0, arch ? (top - h / 2) / 2 : 0, fz), 'box');
    for (let i = 1; i <= bars; i++)
      T(new THREE.BoxGeometry(w, f * 0.8, f), 'FramePaint', M(0, -h / 2 + (i * (top + h / 2)) / (bars + 1), fz), 'box');
    for (const sx of [-1, 1])
      T(new THREE.BoxGeometry(f, top + h / 2, f), 'FramePaint', M(sx * (w / 2 - f / 2), (top - h / 2) / 2, fz), 'box');
    T(new THREE.BoxGeometry(w, f, f), 'FramePaint', M(0, -h / 2 + f / 2, fz), 'box');
    if (shutters)
      for (const sx of [-1, 1]) {
        const sw = w / 2,
          sh = top + h / 2,
          cx = sx * (w / 2 + o + 0.14 + sw / 2),
          cy = (top - h / 2) / 2;
        T(rb(sw, sh, 0.04, 0.012), 'ShutterPaint', M(cx, cy, 0.16), 'box');
        for (let k = 0; k < 7; k++)
          T(
            new THREE.BoxGeometry(sw - 0.08, 0.035, 0.03),
            'ShutterPaint',
            M(cx, cy - sh / 2 + 0.15 + (k * (sh - 0.3)) / 6, 0.19, -0.5),
            'box',
          );
      }
  }
  function doorUnit(m, w, h) {
    const T = (g, mat, local, uv = 'wall') => add(mat, g, m.clone().multiply(local), uv);
    const top = h - w / 2,
      o = 0.12;
    const path = [V(-w / 2 - o, 0, 0), V(-w / 2 - o, top, 0)];
    for (let i = 1; i < 14; i++) {
      const a = Math.PI - (i / 14) * Math.PI;
      path.push(V(Math.cos(a) * (w / 2 + o), top + Math.sin(a) * (w / 2 + o), 0));
    }
    path.push(V(w / 2 + o, top, 0), V(w / 2 + o, 0, 0));
    if (full)
      T(
        sweep(
          path,
          [
            [-0.14, 0],
            [0.14, 0],
            [0.14, 0.14],
            [0.08, 0.18],
            [-0.14, 0.18],
          ],
          { up: V(0, 0, 1) },
        ),
        'GraniteDressed',
        M(),
        'box',
      );
    T(rb(0.34, 0.3, 0.24, 0.03), 'GraniteDressed', M(0, top + w / 2 + o + 0.05, 0.1), 'box');
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, top);
    s.absarc(0, top, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    T(new THREE.ShapeGeometry(s, 14), 'DoorWood', M(0, 0, 0.02), 'box');
    if (full)
      for (const sx of [-1, 1])
        for (const y of [0.35, 1.25])
          T(rb(w / 2 - 0.22, 0.7, 0.05, 0.02), 'DoorWood', M((sx * w) / 4, y + 0.2, 0.05), 'box');
    T(rb(0.06, top + w / 2, 0.05, 0.015), 'DoorWood', M(0, (top + w / 2) / 2, 0.05), 'box');
    T(new THREE.SphereGeometry(0.04, 8, 6), 'IronPaint', M(0.12, 1.1, 0.1), 'box');
    T(rb(w + 0.6, 0.18, 0.5, 0.04), 'GraniteDressed', M(0, -0.09, 0.25), 'box');
  }

  add('Granite', rb(14, 2.4, 11.5, 0.08, 2), M(0, -0.5, -2.25));
  add('GraniteDressed', rb(14.3, 0.18, 11.8, 0.05), M(0, 0.7, -2.25), 'box');
  for (let i = 0; i < 4; i++) add('GraniteDressed', rb(3, 0.2, 0.4, 0.04), M(1, 0.55 - i * 0.2, 3.7 + i * 0.4), 'box');
  const parapet = [
    [-7, 3.5, -1.4, 3.5],
    [3.5, 3.5, 7, 3.5],
    [7, 3.5, 7, -8],
    [-7, 3.5, -7, -8],
  ];
  for (const [x0, z0, x1, z1] of parapet) {
    const len = Math.hypot(x1 - x0, z1 - z0),
      ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    add('Granite', new THREE.BoxGeometry(len, 0.8, 0.4), M((x0 + x1) / 2, 1.1, (z0 + z1) / 2, 0, ry));
    add('GraniteDressed', rb(len + 0.1, 0.14, 0.55, 0.04), M((x0 + x1) / 2, 1.57, (z0 + z1) / 2, 0, ry), 'box');
  }

  const HX = 5,
    Z0 = -7.6,
    Z1 = -0.4,
    H0 = 0.7,
    H1 = 6.4;
  add('Granite', new THREE.BoxGeometry(HX * 2, H1 - H0, Z1 - Z0), M(0, (H0 + H1) / 2, (Z0 + Z1) / 2));
  const ring = (y, prof, mat = 'GraniteDressed', inset = 0) => {
    const e = 0.02 - inset,
      pts = [
        V(-HX - e, y, Z1 + e),
        V(HX + e, y, Z1 + e),
        V(HX + e, y, Z0 - e),
        V(-HX - e, y, Z0 - e),
        V(-HX - e, y, Z1 + e),
      ];
    const path = [];
    for (let i = 0; i < 4; i++) {
      path.push(pts[i]);
      path.push(pts[i].clone().lerp(pts[i + 1], 0.5));
    }
    path.push(pts[4]);
    add(mat, sweep(path, prof), M(), 'box');
  };
  ring(H0 + 0.35, [
    [0, -0.35],
    [0.12, -0.35],
    [0.12, 0.3],
    [0.04, 0.35],
    [0, 0.35],
  ]);
  ring(3.55, [
    [0, -0.08],
    [0.07, -0.08],
    [0.07, 0.08],
    [0, 0.08],
  ]);
  ring(H1 - 0.1, [
    [0, -0.25],
    [0.06, -0.2],
    [0.1, -0.06],
    [0.24, 0.04],
    [0.3, 0.16],
    [0.3, 0.26],
    [0, 0.26],
  ]);
  for (const [x0, z0, x1, z1] of [
    [-HX, Z1, HX, Z1],
    [HX, Z1, HX, Z0],
    [HX, Z0, -HX, Z0],
    [-HX, Z0, -HX, Z1],
  ]) {
    const len = Math.hypot(x1 - x0, z1 - z0),
      ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2,
      cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    add('Granite', new THREE.BoxGeometry(len, 0.75, 0.3), M(cx, H1 + 0.5, cz, 0, ry));
    add('GraniteDressed', rb(len + 0.3, 0.12, 0.46, 0.03), M(cx, H1 + 0.93, cz, 0, ry), 'box');
  }
  add('GraniteDressed', new THREE.BoxGeometry(HX * 2 - 0.4, 0.1, Z1 - Z0 - 0.4), M(0, H1 + 0.16, (Z0 + Z1) / 2), 'box');
  if (full)
    for (const sx of [-1, 1])
      for (const sz of [Z0, Z1])
        for (let k = 0; k < 9; k++) {
          const long = k % 2 === 0,
            y = H0 + 0.3 + k * 0.6;
          add(
            'GraniteDressed',
            rb(long ? 0.9 : 0.55, 0.56, 0.08, 0.02),
            M(sx * (HX - (long ? 0.45 : 0.275)), y, sz + Math.sign(sz - (Z0 + Z1) / 2) * 0.045),
            'box',
          );
          add(
            'GraniteDressed',
            rb(0.08, 0.56, long ? 0.55 : 0.9, 0.02),
            M(sx * (HX + 0.045), y, sz - Math.sign(sz - (Z0 + Z1) / 2) * (long ? 0.275 : 0.45)),
            'box',
          );
        }
  add('Granite', rb(0.9, 1.4, 0.7, 0.04), M(-3, H1 + 0.9, -5.6));
  add('GraniteDressed', rb(1.1, 0.14, 0.9, 0.03), M(-3, H1 + 1.65, -5.6), 'box');
  add('Tile', new THREE.CylinderGeometry(0.14, 0.16, 0.35, 10), M(-3, H1 + 1.88, -5.6), 'cyl');
  add('IronPaint', new THREE.CylinderGeometry(0.045, 0.045, H1 - H0, 8), M(HX + 0.12, (H0 + H1) / 2, Z0 + 0.6), 'cyl');
  for (const [y, opts] of [
    [2.2, { shutters: true }],
    [4.9, { shutters: true }],
  ]) {
    for (const x of [-3, 0, 3]) windowUnit(M(x, y, Z0, 0, Math.PI), 1, 1.5, opts);
    for (const z of [-5.6, -2.4]) {
      windowUnit(M(HX, y, z, 0, Math.PI / 2), 1, 1.5, opts);
      windowUnit(M(-HX, y, z, 0, -Math.PI / 2), 1, 1.5, opts);
    }
    for (const x of [-3.9, 3.9]) windowUnit(M(x, y, Z1, 0, 0), 0.9, 1.4, { bars: 2 });
  }
  doorUnit(M(-HX, H0, -4, 0, -Math.PI / 2), 1.3, 2.6);

  const R0 = 2.75,
    R1 = 2.3,
    TY0 = H0,
    TY1 = 13.7,
    rAt = (y) => R0 + ((R1 - R0) * (y - TY0)) / (TY1 - TY0);
  add(
    'Granite',
    octLathe([
      [0, TY0],
      [R0 + 0.35, TY0],
      [R0 + 0.35, TY0 + 1.1],
      [R0 + 0.12, TY0 + 1.3],
      [R0, TY0 + 1.3],
      [R1, TY1],
      [0, TY1],
    ]),
    M(),
  );
  for (const y of [H1 - 0.1, 10.2])
    add(
      'GraniteDressed',
      octLathe([
        [rAt(y) - 0.05, y - 0.14],
        [rAt(y) + 0.12, y - 0.14],
        [rAt(y) + 0.16, y],
        [rAt(y) + 0.12, y + 0.14],
        [rAt(y) - 0.05, y + 0.14],
      ]),
      M(),
    );
  add(
    'GraniteDressed',
    octLathe([
      [R1 - 0.05, TY1 - 0.1],
      [R1 + 0.15, TY1 - 0.1],
      [R1 + 0.25, TY1 + 0.15],
      [R1 + 0.45, TY1 + 0.45],
      [R1 + 0.9, TY1 + 0.7],
      [R1 + 0.9, TY1 + 0.95],
      [0, TY1 + 0.95],
    ]),
    M(),
  );
  for (let i = 0; i < (full ? 16 : 0); i++) {
    const a = (i / 16) * Math.PI * 2 + OCT / 2,
      r = R1 + 0.25;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.6, 0);
    s.quadraticCurveTo(0.6, -0.45, 0.1, -0.6);
    s.lineTo(0, -0.6);
    s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.02,
      bevelSegments: 1,
      curveSegments: 6,
    });
    g.translate(0, 0, -0.11);
    add(
      'GraniteDressed',
      g,
      M(Math.sin(a) * (r - 0.25), TY1 + 0.7, Math.cos(a) * (r - 0.25), 0, a - Math.PI / 2),
      'box',
    );
  }
  const face = (y) => rAt(y) * Math.cos(OCT),
    tilt = Math.atan(((R0 - R1) * Math.cos(OCT)) / (TY1 - TY0));
  for (const y of [4.8, 8.2, 11.6]) windowUnit(M(0, y, face(y), -tilt), 0.75, 1.25, { arch: true, bars: 2 });
  for (const s of [-1, 1])
    windowUnit(M(s * face(9.4) * Math.sin(Math.PI / 2), 9.4, 0, 0, (s * Math.PI) / 2), 0.6, 1, { arch: true, bars: 1 });

  const GY = TY1 + 0.95,
    GR = R1 + 0.9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2,
      r = GR - 0.12;
    add(
      'IronPaint',
      new THREE.CylinderGeometry(0.035, 0.04, 1.05, 8),
      M(Math.sin(a) * r, GY + 0.52, Math.cos(a) * r),
      'cyl',
    );
  }
  for (const [y, rr] of [
    [GY + 0.35, 0.016],
    [GY + 0.7, 0.016],
    [GY + 1.05, 0.03],
  ])
    add('IronPaint', new THREE.TorusGeometry(GR - 0.12, rr, 6, 48), M(0, y, 0, Math.PI / 2), 'box');
  if (full)
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2,
        r = GR - 0.12;
      add(
        'IronPaint',
        new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5),
        M(Math.sin(a) * r, GY + 0.35, Math.cos(a) * r),
        'cyl',
      );
    }

  const LR = 1.6,
    LY0 = GY + 0.05,
    LY1 = LY0 + 0.75,
    LY2 = 17.75;
  add(
    'IronPaint',
    octLathe(
      [
        [0, LY0],
        [LR + 0.1, LY0],
        [LR + 0.1, LY1],
        [LR + 0.18, LY1 + 0.06],
        [LR + 0.18, LY1 + 0.14],
        [0, LY1 + 0.14],
      ],
      16,
    ),
    M(),
    'cyl',
  );
  const LG0 = LY1 + 0.14;
  add(
    'LanternGlass',
    new THREE.CylinderGeometry(LR - 0.02, LR - 0.02, LY2 - LG0, 16, 1, true, OCT / 2),
    M(0, (LY2 + LG0) / 2, 0),
    'cyl',
  );
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    add(
      'IronPaint',
      rb(0.06, LY2 - LG0, 0.06, 0.01),
      M(Math.sin(a) * LR, (LY2 + LG0) / 2, Math.cos(a) * LR, 0, a),
      'box',
    );
  }
  if (full)
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2,
        a1 = a0 + Math.PI / 8;
      const path = [];
      for (let k = 0; k <= 6; k++) {
        const a = a0 + ((a1 - a0) * k) / 6,
          y = LG0 + ((LY2 - LG0) * k) / 6;
        path.push(V(Math.sin(a) * LR, y, Math.cos(a) * LR));
      }
      add('IronPaint', sweep(path, circleProfile(0.018, 5)), M(), 'box');
    }
  add('IronPaint', new THREE.TorusGeometry(LR, 0.035, 6, 48), M(0, (LY2 + LG0) / 2, 0, Math.PI / 2), 'box');
  const lens = [];
  for (let k = 0; k <= 14; k++) {
    const y = 16.6 - 0.7 + k * 0.1,
      d = Math.abs(y - 16.6);
    lens.push(new THREE.Vector2(0.55 - d * 0.25 + (k % 2 ? 0.06 : 0), y));
  }
  add(
    'LensGlow',
    new THREE.LatheGeometry([new THREE.Vector2(0, 15.9), ...lens, new THREE.Vector2(0, 17.3)], 24),
    M(),
    'cyl',
  );
  add('IronPaint', new THREE.CylinderGeometry(0.35, 0.5, 0.5, 12), M(0, 15.75, 0), 'cyl');
  add(
    'Copper',
    new THREE.LatheGeometry(
      [
        [0, LY2],
        [LR + 0.22, LY2],
        [LR + 0.22, LY2 + 0.14],
        [LR + 0.05, LY2 + 0.2],
        [1.5, LY2 + 0.45],
        [1.2, LY2 + 0.8],
        [0.75, LY2 + 1.05],
        [0.3, LY2 + 1.2],
        [0.18, LY2 + 1.24],
        [0, LY2 + 1.25],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      32,
    ),
    M(),
    'cyl',
  );
  add('Copper', new THREE.SphereGeometry(0.26, 16, 10), M(0, LY2 + 1.45, 0), 'box');
  add('IronPaint', new THREE.CylinderGeometry(0.025, 0.035, 1.6, 6), M(0, LY2 + 2.3, 0), 'cyl');
  add(
    'IronPaint',
    sweep(
      [V(-0.45, 0, 0), V(0.45, 0, 0)],
      [
        [-0.05, -0.012],
        [0.05, -0.012],
        [0.05, 0.012],
        [-0.05, 0.012],
      ],
      { up: V(0, 0, 1) },
    ),
    M(0, LY2 + 2.75, 0, 0, 0.6),
    'box',
  );
  add('IronPaint', new THREE.ConeGeometry(0.08, 0.2, 4), M(0.5, LY2 + 2.75, 0, 0, 0.6, -Math.PI / 2), 'box');

  const A = { x0: -6.6, x1: -2.6, z0: -7.4, z1: -12.2 };
  const ax = (A.x0 + A.x1) / 2,
    az = (A.z0 + A.z1) / 2,
    aw = A.x1 - A.x0,
    ad = A.z0 - A.z1,
    AH = 3.3;
  add('Granite', new THREE.BoxGeometry(aw, AH + 1.8, ad), M(ax, H0 + AH / 2 - 1.5, az));
  for (const sx of [-1, 1])
    windowUnit(M(ax + (sx * aw) / 2, H0 + 1.3, az, 0, (sx * Math.PI) / 2), 0.8, 1.1, { shutters: true });
  doorUnit(M(ax, H0 - 0.6, A.z1, 0, Math.PI), 1.1, 2.3);
  const eave = 0.35,
    rh = 1.3,
    ry0 = H0 + AH - 0.6;
  const hw = aw / 2 + eave,
    hd = ad / 2 + eave,
    ridge = hd - hw;
  const P = (x, y, z) => [ax + x, y, az + z];
  const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
  const roofPos = [
    ...quad(P(-hw, ry0, hd), P(0, ry0 + rh, Math.max(ridge, 0)), P(0, ry0 + rh, -Math.max(ridge, 0)), P(-hw, ry0, -hd)),
    ...quad(P(hw, ry0, -hd), P(0, ry0 + rh, -Math.max(ridge, 0)), P(0, ry0 + rh, Math.max(ridge, 0)), P(hw, ry0, hd)),
    ...P(hw, ry0, hd),
    ...P(0, ry0 + rh, Math.max(ridge, 0)),
    ...P(-hw, ry0, hd),
    ...P(-hw, ry0, -hd),
    ...P(0, ry0 + rh, -Math.max(ridge, 0)),
    ...P(hw, ry0, -hd),
  ];
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  roof.computeVertexNormals();
  add('Tile', roof, M(), 'roof');
  const capProf = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 6) * Math.PI;
    return [Math.cos(a) * 0.12, Math.sin(a) * 0.1];
  });
  const r0 = V(...P(0, ry0 + rh + 0.02, -ridge)),
    r1 = V(...P(0, ry0 + rh + 0.02, ridge));
  add('Tile', sweep([r0, r1], capProf), M(), 'box');
  for (const c of [P(hw, ry0, hd), P(-hw, ry0, hd), P(hw, ry0, -hd), P(-hw, ry0, -hd)])
    add('Tile', sweep([V(...c), Math.sign(c[2] - az) > 0 ? r1 : r0], capProf), M(), 'box');
  if (full)
    for (const side of [-1, 1])
      for (let i = 0; i < 18; i++) {
        const z = az - hd + ((i + 0.5) / 18) * hd * 2;
        add(
          'Tile',
          new THREE.CylinderGeometry(0.11, 0.11, 0.3, 8, 1, true, 0, Math.PI),
          M(ax + side * (hw - 0.1), ry0 - 0.02, z, 0, 0, (Math.PI / 2) * side),
          'cyl',
        );
      }
  add('GraniteDressed', rb(aw + 0.25, 0.18, ad + 0.25, 0.04), M(ax, ry0 - 0.05, az), 'box');
}
