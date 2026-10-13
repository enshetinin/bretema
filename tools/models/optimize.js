import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, reorder, quantize, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const [, , src, dst] = process.argv;
if (!src || !dst) {
  console.error('usage: node optimize.js <in.glb> <out.glb>');
  process.exit(1);
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);

await doc.transform(
  dedup(),
  prune(),
  weld(),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ quantizeNormal: 10, quantizeTexcoord: 14 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normalTexture$/, quality: 92 }),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    slots: /^(baseColorTexture|metallicRoughnessTexture|occlusionTexture|emissiveTexture)$/,
    quality: 82,
  }),
);
doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

const glb = await io.writeBinary(doc);
await writeFile(dst, glb);

const root = doc.getRoot();
let tris = 0;
for (const mesh of root.listMeshes())
  for (const p of mesh.listPrimitives())
    tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
const b = getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
console.log(
  `${dst}: ${(glb.byteLength / 1024).toFixed(0)} KB, ${tris.toFixed(0)} triangles, ${root.listMaterials().length} materials`,
);
console.log(
  'nodes:',
  root
    .listNodes()
    .map((n) => n.getName())
    .join(', '),
);
console.log(
  'textures:',
  root
    .listTextures()
    .map(
      (t) => `${t.getName() || t.getURI()} ${t.getSize()?.join('×')} ${(t.getImage().byteLength / 1024).toFixed(0)}KB`,
    )
    .join('; '),
);
console.log('bounds min', b.min.map((v) => v.toFixed(2)).join(' '), 'max', b.max.map((v) => v.toFixed(2)).join(' '));
