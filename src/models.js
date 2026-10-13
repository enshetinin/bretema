import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export async function loadModel(url, renderer) {
  try {
    const gltf = await loader.loadAsync(url);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material,
        glassy = m.transparent || m.emissive?.getHex() > 0;
      o.castShadow = !m.transparent;
      o.receiveShadow = !glassy;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (m[k]) m[k].anisotropy = aniso;
      if (m.transparent) m.depthWrite = false;
    });
    return gltf.scene;
  } catch (err) {
    console.warn(`BRÉTEMA: non se puido cargar ${url}; mantense a xeometría procedural.`, err);
    return null;
  }
}

export function materialsByName(root) {
  const out = {};
  root.traverse((o) => {
    if (o.isMesh) out[o.material.name] = o.material;
  });
  return out;
}

export function warmUp(renderer, scene, camera, root) {
  root.traverse((o) => {
    if (o.isMesh)
      for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap'])
        if (o.material[k]) renderer.initTexture(o.material[k]);
  });
  return renderer.compileAsync ? renderer.compileAsync(root, camera, scene).catch(() => {}) : Promise.resolve();
}
