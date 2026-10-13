import { mkdir } from 'node:fs/promises';
import * as MAT from './lib/materials.js';
import { buildBoat } from './boat.js';
import { buildFaro } from './faro.js';

const OUT = new URL('../../assets/models/', import.meta.url);
await mkdir(OUT, { recursive: true });
const t0 = performance.now();
const sets = {
  paint: [MAT.paint(1024, 11), 5],
  paint_iron: [MAT.paint(512, 13, { rust: true }), 5],
  wood: [MAT.wood(1024), 6],
  rope: [MAT.rope(256), 6],
  net: [MAT.net(512), 4],
  bronze: [MAT.bronze(256), 3],
  canvas: [MAT.canvas(1024), 4],
  wicker: [MAT.wicker(512), 6],
  granite: [MAT.granite(1024), 7],
  tile: [MAT.tile(1024), 7],
  copper: [MAT.copper(512), 4],
};
const tex = {};
for (const [k, [set, strength]] of Object.entries(sets))
  tex[k] = await set.encode({ normalStrength: (strength * set.w) / 256 });
console.log(`textures ${((performance.now() - t0) / 1000).toFixed(1)} s`);
const targets = [];
if (process.argv.includes('--legacy-dorna')) targets.push(['dorna_legacy.glb', buildBoat]);
if (process.argv.includes('--legacy-faro')) targets.push(['faro_legacy.glb', buildFaro]);
if (!targets.length) {
  console.log('nothing to build (use --legacy-dorna / --legacy-faro)');
  process.exit(0);
}
for (const [file, build] of targets) {
  const mb = build(),
    bytes = await mb.write(new URL(file, OUT), tex);
  console.log(`${file}: ${mb.stats().tris.toFixed(0)} triangles before welding, ${(bytes / 1024).toFixed(0)} KB`);
}
