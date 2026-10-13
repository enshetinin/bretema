import * as THREE from 'three';
import { Builder, rng, PI2 } from './util.js';
import { waveHeight } from './terrain.js';

export function createFauna(scene, materials) {
  const gb = new Builder(12);
  gb.ico(0.28, 0xf4f1ea, 0, 0, 0, 0.8, 0.7, 1.6);
  gb.cone(0.08, 0.25, 0xe6a23c, 0, 0, -0.5, 4);
  gb.box(1.5, 0.05, 0.42, 0xf0eee8, -0.85, 0, 0.05);
  gb.box(1.5, 0.05, 0.42, 0xf0eee8, 0.85, 0, 0.05);
  gb.box(0.5, 0.055, 0.3, 0x3b3f44, -1.55, 0, 0.1);
  gb.box(0.5, 0.055, 0.3, 0x3b3f44, 1.55, 0, 0.1);
  const gullMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const flap = { value: 0 };
  gullMat.onBeforeCompile = (s) => {
    s.uniforms.uFlap = flap;
    s.vertexShader =
      'uniform float uFlap;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x*1.7+instanceMatrix[3].z*.9;
        float w = abs(position.x); transformed.y += sin(uFlap*6.+ph)*w*w*.35;
      #endif`,
      );
  };
  gullMat.customProgramCacheKey = () => 'gull';
  const N = 16,
    gulls = new THREE.InstancedMesh(gb.geometry(), gullMat, N);
  gulls.frustumCulled = false;
  gulls.castShadow = true;
  scene.add(gulls);
  const r = rng(404),
    birds = [];
  for (let i = 0; i < N; i++)
    birds.push({
      cx: -90 + r() * 180,
      cz: -110 + r() * 200,
      y: 9 + r() * 14,
      rad: 8 + r() * 14,
      sp: (0.18 + r() * 0.22) * (r() < 0.5 ? -1 : 1),
      ph: r() * PI2,
      s: 0.7 + r() * 0.5,
    });

  const db = new Builder(13);
  db.ico(0.55, 0x5f6f7c, 0, 0, 0, 0.9, 0.8, 3);
  db.ico(0.45, 0xc9cfd2, 0, -0.18, -0.3, 0.75, 0.5, 2.2);
  db.cone(0.22, 0.7, 0x56636f, 0, 0.55, 0.2, 4);
  db.box(1.2, 0.06, 0.35, 0x56636f, 0, 0, 1.7);
  db.cone(0.12, 0.45, 0x5f6f7c, 0, -0.05, -1.85, 5);
  const dGeo = db.geometry();
  const dolphins = new THREE.InstancedMesh(dGeo, materials.solid, 3);
  dolphins.frustumCulled = false;
  dolphins.count = 0;
  scene.add(dolphins);
  const pod = [];
  let nextPod = 12;
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(0, 0, 0, 'YXZ'),
    p = new THREE.Vector3(),
    s = new THREE.Vector3();

  function update(dt, t, boat, splash) {
    flap.value = t;
    for (let i = 0; i < N; i++) {
      const b = birds[i],
        a = t * b.sp + b.ph;
      const x = b.cx + Math.cos(a) * b.rad,
        z = b.cz + Math.sin(a) * b.rad,
        y = b.y + Math.sin(t * 0.7 + b.ph) * 1.5;
      const dx = -Math.sin(a) * b.sp,
        dz = Math.cos(a) * b.sp;
      e.set(0, Math.atan2(-dx, -dz), -Math.sign(b.sp) * 0.25);
      q.setFromEuler(e);
      gulls.setMatrixAt(i, m.compose(p.set(x, y, z), q, s.setScalar(b.s)));
    }
    gulls.instanceMatrix.needsUpdate = true;

    nextPod -= dt;
    if (nextPod <= 0 && boat.speed > 6 && !pod.length) {
      const side = Math.random() < 0.5 ? -1 : 1,
        fx = boat.fwdX,
        fz = boat.fwdZ,
        rx = Math.cos(boat.heading),
        rz = Math.sin(boat.heading);
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const ahead = 10 + i * 3 + Math.random() * 4,
          lat = side * (7 + Math.random() * 4 + i * 1.5);
        pod.push({
          x: boat.pos.x + fx * ahead + rx * lat,
          z: boat.pos.z + fz * ahead + rz * lat,
          h: boat.heading + (Math.random() - 0.5) * 0.3,
          t: -i * 0.35,
          dur: 1.15,
          jumps: 2 + Math.floor(Math.random() * 2),
          sp: Math.max(9, boat.speed * 1.05),
          splashed: false,
        });
      }
      nextPod = 14 + Math.random() * 14;
    }
    let k = 0;
    for (let i = pod.length - 1; i >= 0; i--) {
      const d = pod[i];
      d.t += dt;
      d.x += Math.sin(d.h) * d.sp * dt;
      d.z -= Math.cos(d.h) * d.sp * dt;
      if (d.t < 0) continue;
      const u = d.t / d.dur;
      if (u >= 1) {
        splash(d.x, d.z, 1);
        d.jumps--;
        d.t = -0.5 - Math.random() * 0.4;
        d.splashed = false;
        if (d.jumps <= 0) pod.splice(i, 1);
        continue;
      }
      if (!d.splashed) {
        splash(d.x, d.z, 0.7);
        d.splashed = true;
      }
      const y = waveHeight(d.x, d.z, t) - 0.4 + Math.sin(u * Math.PI) * 2.6;
      e.set(Math.cos(u * Math.PI) * 0.9, -d.h, 0);
      q.setFromEuler(e);
      dolphins.setMatrixAt(k++, m.compose(p.set(d.x, y, d.z), q, s.setScalar(1)));
      if (k >= 3) break;
    }
    dolphins.count = k;
    dolphins.instanceMatrix.needsUpdate = true;
  }
  return {
    update,
    reset() {
      pod.length = 0;
      nextPod = 12;
    },
  };
}
