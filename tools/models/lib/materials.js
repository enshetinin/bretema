import { TexSet, makeNoise, makeCells, clamp, lerp, smooth, mix3, hex } from './tex.js';

const fract = (x) => x - Math.floor(x);

export function paint(size = 1024, seed = 11, { rust = false } = {}) {
  const N = makeNoise(seed),
    chips = makeCells(seed + 1, 18),
    grain = makeNoise(seed + 2);
  const wood = hex(0x6b4a30),
    rustC = hex(0x8a4a24);
  return new TexSet(rust ? 'paint_iron' : 'paint', size)
    .paint((u, v, p) => {
      const mott = N.fbm(u, v, 6, 6, 5) * 0.05,
        streak = N.fbm(u, v, 3, 40, 3) * 0.035;
      const wear = N.fbm(u, v, 5, 5, 5) + 0.25 * N.fbm(u, v, 24, 24, 3);
      const c = chips(u, v),
        edge = c.f2 - c.f1;
      const chip = smooth(0.3, 0.38, wear) * smooth(0.04, 0.12, edge) * (c.id > 0.45 ? 1 : 0);
      const g = grain.fbm(u, v, 2, 30, 4);
      let base = [0.93 + mott + streak, 0.93 + mott + streak, 0.92 + mott + streak];
      if (rust) {
        const r = smooth(0.15, 0.4, wear + N.fbm(u, v, 2, 14, 3) * 0.3);
        base = mix3(base, rustC, r * 0.55);
      }
      const under = rust ? mix3(rustC, hex(0x3a2a20), 0.3 + g * 0.3) : mix3(wood, hex(0x8a6844), 0.5 + g * 0.5);
      p.c = mix3(base, under, chip);
      p.h = (1 - chip) * 0.6 + g * 0.08 + mott;
      p.r = lerp(rust ? 0.55 : 0.42, 0.82, chip) + streak * 2 + mott;
      p.ao = 1 - chip * 0.25;
    })
    .bakeCavity(2, 0.5);
}

export function wood(size = 1024, seed = 21) {
  const N = makeNoise(seed),
    K = makeNoise(seed + 1);
  const light = hex(0xa88a66),
    dark = hex(0x7a5d42);
  return new TexSet('wood', size)
    .paint((u, v, p) => {
      const warp = N.fbm(u, v, 2, 3, 3) * 0.6;
      const rings = fract((v + warp) * 9 + N.fbm(u, v, 1, 8, 4) * 0.8);
      const ring = smooth(0.0, 0.15, rings) * (1 - smooth(0.55, 1, rings));
      const fibre = K.fbm(u, v, 3, 90, 3) * 0.5 + 0.5;
      const knot =
        clamp(1 - Math.hypot((fract(u * 2) - 0.5) * 4, (fract(v * 3 + 0.3) - 0.5) * 9)) *
        (K.noise(Math.floor(u * 2) * 7.3, Math.floor(v * 3) * 3.1) > 0.3 ? 1 : 0);
      const t = clamp(ring * 0.3 + fibre * 0.4 + knot * 0.5);
      p.c = mix3(light, dark, t);
      p.h = fibre * 0.25 - ring * 0.2 - knot * 0.3;
      p.r = 0.58 + fibre * 0.12 + ring * 0.08;
    })
    .bakeCavity(2, 0.35);
}

export function rope(size = 256, seed = 31) {
  const N = makeNoise(seed);
  const c0 = hex(0xb79a6a),
    c1 = hex(0x7a6440);
  return new TexSet('rope', size).paint((u, v, p) => {
    const s = fract(u * 3 + v * 6),
      prof = Math.sin(s * Math.PI);
    const fib = N.fbm(u, v, 12, 24, 3) * 0.5 + 0.5;
    p.c = mix3(c1, c0, prof * 0.8 + fib * 0.2);
    p.h = prof * 0.8 + fib * 0.15;
    p.r = 0.9;
    p.ao = 0.55 + prof * 0.45;
  });
}

export function net(size = 512, seed = 41) {
  const N = makeNoise(seed);
  const c = hex(0x2f5a4a),
    knotC = hex(0x284a3e);
  return new TexSet('net', size).paint((u, v, p) => {
    const a = fract((u + v) * 8),
      b = fract((u - v) * 8 + 4);
    const da = Math.min(a, 1 - a),
      db = Math.min(b, 1 - b),
      d = Math.min(da, db);
    const line = 1 - smooth(0.03, 0.06, d),
      knot = 1 - smooth(0.04, 0.09, Math.hypot(da, db));
    const m = Math.max(line, knot),
      f = N.fbm(u, v, 8, 8, 3) * 0.1;
    p.c = mix3(mix3(c, knotC, knot), [0.4, 0.5, 0.42], f + 0.05);
    p.h = m * 0.7 + knot * 0.3;
    p.r = 0.85;
    p.a = m > 0.35 ? 1 : 0;
  });
}

export function bronze(size = 256, seed = 51) {
  const N = makeNoise(seed);
  const metal = hex(0xb8875a),
    tarnish = hex(0x4a3b2a),
    verd = hex(0x5f8f7a);
  return new TexSet('bronze', size).paint((u, v, p) => {
    const f = N.fbm(u, v, 4, 4, 5),
      g = N.fbm(u, v, 16, 16, 3);
    const t = smooth(-0.1, 0.35, f);
    p.c = mix3(mix3(metal, tarnish, t * 0.7), verd, smooth(0.35, 0.55, f) * 0.5);
    p.h = g * 0.2;
    p.r = 0.3 + t * 0.35 + g * 0.05;
    p.m = 1 - smooth(0.35, 0.55, f) * 0.6;
  });
}

export function canvas(size = 1024, seed = 61) {
  const N = makeNoise(seed);
  const cloth = hex(0xc99a5c),
    stain = hex(0x7d5a36);
  return new TexSet('canvas', size).paint((u, v, p) => {
    const wx = Math.sin((u * size * Math.PI) / 4),
      wy = Math.sin((v * size * Math.PI) / 4);
    const weave = wx * wy * 0.5 + 0.5;
    const sp = fract(u * 6),
      seam = 1 - smooth(0.0, 0.012, Math.min(sp, 1 - sp));
    const st =
      (1 - smooth(0.0, 0.004, Math.abs(sp - 0.022))) * (fract(v * 90) < 0.55 ? 1 : 0) +
      (1 - smooth(0.0, 0.004, Math.abs(sp - 0.978))) * (fract(v * 90 + 0.5) < 0.55 ? 1 : 0);
    const edge = 1 - smooth(0.0, 0.03, Math.min(u, 1 - u, v, 1 - v));
    const st2 = N.fbm(u, v, 3, 3, 5),
      drip = N.fbm(u, v, 6, 1.5, 3);
    const dirt = smooth(0.05, 0.45, st2 + drip * 0.4) * 0.45;
    p.c = mix3(mix3(cloth, stain, dirt), hex(0x9b7444), seam * 0.35 + edge * 0.3 + st * 0.4);
    p.h = weave * 0.15 + seam * 0.5 + edge * 0.45 + st * 0.25;
    p.r = 0.92;
  });
}

export function wicker(size = 512, seed = 71) {
  const N = makeNoise(seed);
  const c0 = hex(0xb08a55),
    c1 = hex(0x6b5233);
  return new TexSet('wicker', size).paint((u, v, p) => {
    const row = Math.floor(v * 16),
      col = Math.floor(u * 12),
      over = (row + col) % 2;
    const fv = fract(v * 16),
      fu = fract(u * 12);
    const strand = Math.sin(fv * Math.PI),
      bulge = over ? Math.sin(fu * Math.PI) : 1 - Math.sin(fu * Math.PI) * 0.6;
    const n = N.fbm(u, v, 8, 24, 3) * 0.5 + 0.5;
    p.c = mix3(c1, c0, strand * 0.6 + n * 0.4);
    p.h = strand * bulge;
    p.r = 0.8;
    p.ao = 0.5 + strand * bulge * 0.5;
  });
}

export function granite(size = 1024, seed = 81) {
  const N = makeNoise(seed),
    speck = makeNoise(seed + 1),
    L = makeNoise(seed + 2),
    R = makeNoise(seed + 3);
  const base = hex(0x9c9a90),
    warm = hex(0xa8957d),
    cool = hex(0x7e8682),
    lichenY = hex(0xb9a25a),
    lichenG = hex(0x8f9a7f);
  const COURSES = 6,
    mortar = 0.012;
  return new TexSet('granite', size)
    .paint((u, v, p) => {
      const row = Math.floor(v * COURSES),
        fv = fract(v * COURSES);
      const off = fract(Math.sin(row * 12.9898) * 43758.5),
        cols = 3 + (row % 3);
      const x = fract(u + off * 0.5),
        col = Math.floor(x * cols),
        fu = fract(x * cols);
      const id = fract(Math.sin((row * 7 + col) * 78.233) * 43758.5);
      const du = Math.min(fu, 1 - fu) / cols,
        dv = Math.min(fv, 1 - fv) / COURSES;
      const joint = 1 - smooth(mortar * 0.5, mortar, Math.min(du, dv));
      const pillow = smooth(0, 0.06, Math.min(du, dv));
      const grain = speck.noise(u * 900, v * 900, 900, 900),
        sp = smooth(0.45, 0.75, grain) - smooth(0.55, 0.85, -grain);
      let c = id < 0.33 ? mix3(base, warm, 0.6) : id < 0.66 ? base : mix3(base, cool, 0.7);
      c = mix3(c, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], N.fbm(u, v, 6, 6, 4) * 0.5 + 0.5);
      c = mix3(c, sp > 0 ? [0.92, 0.9, 0.86] : [0.18, 0.18, 0.19], Math.abs(sp) * 0.45);
      const streak = R.fbm(u, v, 12, 1, 4) * 0.5 + 0.5;
      c = mix3(c, hex(0x5a5a52), smooth(0.55, 0.9, streak) * 0.35 * (1 - fv * 0.5));
      const lich = L.fbm(u, v, 5, 5, 5);
      c = mix3(c, lich > 0 ? lichenY : lichenG, smooth(0.25, 0.45, Math.abs(lich)) * 0.55 * (1 - joint));
      c = mix3(c, hex(0x6b675d), joint * 0.85);
      p.c = c;
      p.h = pillow * 0.7 + N.fbm(u, v, 24, 24, 4) * 0.12 - joint * 0.4 + Math.abs(sp) * 0.03;
      p.r = 0.86 + joint * 0.08 - smooth(0.25, 0.45, Math.abs(lich)) * 0.0;
    })
    .bakeCavity(3, 0.7);
}

export function tile(size = 1024, seed = 91) {
  const N = makeNoise(seed),
    M = makeNoise(seed + 1);
  const clay = hex(0xb4583a),
    dark = hex(0x7e3a26),
    pale = hex(0xc98762),
    moss = hex(0x6a7442);
  const COLS = 8,
    ROWS = 5;
  return new TexSet('tile', size)
    .paint((u, v, p) => {
      const cu = u * COLS,
        col = Math.floor(cu),
        fu = fract(cu);
      const rv = v * ROWS + (col % 2) * 0.5,
        row = Math.floor(rv),
        fv = fract(rv);
      const prof = col % 2 ? Math.sin(fu * Math.PI) : 1 - Math.sin(fu * Math.PI) * 0.9;
      const lap = smooth(0.0, 0.12, fv) * 0.25 + (1 - smooth(0.88, 1, fv)) * 0.0;
      const id = fract(Math.sin((row * 31 + col * 7) * 12.9898) * 43758.5);
      let c = id < 0.3 ? mix3(clay, dark, 0.45) : id < 0.7 ? clay : mix3(clay, pale, 0.5);
      c = mix3(c, dark, (1 - prof) * 0.35 + N.fbm(u, v, 8, 8, 4) * 0.2 + 0.05);
      const mo = M.fbm(u, v, 4, 4, 5);
      c = mix3(c, moss, smooth(0.25, 0.5, mo) * (1 - prof) * 0.8);
      c = mix3(c, [0.85, 0.82, 0.72], smooth(0.3, 0.55, M.fbm(u, v, 9, 9, 3)) * prof * 0.25);
      p.c = c;
      p.h = prof * 0.9 + lap - (1 - smooth(0.0, 0.05, fv)) * 0.5 + N.fbm(u, v, 30, 30, 3) * 0.05;
      p.r = 0.78 + (1 - prof) * 0.1;
      p.ao = 0.55 + prof * 0.45;
    })
    .bakeCavity(3, 0.5);
}

export function copper(size = 512, seed = 101) {
  const N = makeNoise(seed),
    D = makeNoise(seed + 1);
  const cu = hex(0xa0603a),
    verd = hex(0x5fa392),
    dark = hex(0x2f3a34);
  return new TexSet('copper', size).paint((u, v, p) => {
    const f = N.fbm(u, v, 4, 4, 5),
      drip = D.fbm(u, v, 14, 2, 4);
    const pat = smooth(-0.5, 0.05, f + drip * 0.3) * 0.85 + 0.1;
    p.c = mix3(mix3(cu, dark, 0.3), verd, pat);
    p.h = pat * 0.3 + D.fbm(u, v, 30, 30, 3) * 0.1;
    p.r = lerp(0.35, 0.7, pat);
    p.m = lerp(0.95, 0.15, pat);
  });
}
