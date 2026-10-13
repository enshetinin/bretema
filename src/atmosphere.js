import * as THREE from 'three';
import { rng, lerp, damp, softTexture, PI2 } from './util.js';
import { WORLD } from './terrain.js';

const C = (h) => new THREE.Color(h);
const KEYS = [
  {
    top: C(0x8ea3ab),
    horizon: C(0xdcd5c6),
    fog: C(0xbcc7c3),
    fogDensity: 0.0088,
    sunElev: 0.36,
    sunColor: C(0xffe3c2),
    sunInt: 1.55,
    hemiSky: C(0xd6e4e4),
    hemiGround: C(0x52625a),
    hemiInt: 1.35,
    exposure: 1.05,
    deep: C(0x234c58),
    mid: C(0x2f7277),
    shallow: C(0x5cbfae),
    puff: 0.72,
    window: 0.1,
  },
  {
    top: C(0x5d7aa6),
    horizon: C(0xffb581),
    fog: C(0xe8b897),
    fogDensity: 0.0034,
    sunElev: 0.1,
    sunColor: C(0xffa560),
    sunInt: 2.7,
    hemiSky: C(0xffd6b8),
    hemiGround: C(0x4c4a52),
    hemiInt: 1.15,
    exposure: 1.08,
    deep: C(0x173e5a),
    mid: C(0x24647a),
    shallow: C(0x47b6b0),
    puff: 0.32,
    window: 0.35,
  },
  {
    top: C(0x0f1d3d),
    horizon: C(0x9c6f86),
    fog: C(0x3b4664),
    fogDensity: 0.0032,
    sunElev: -0.04,
    sunColor: C(0xff8a5c),
    sunInt: 0.35,
    hemiSky: C(0x6f80b8),
    hemiGround: C(0x1d2230),
    hemiInt: 0.95,
    exposure: 1.25,
    deep: C(0x0b2036),
    mid: C(0x15405a),
    shallow: C(0x2a7f8a),
    puff: 0.18,
    window: 1,
  },
];
const SUN_AZ = new THREE.Vector2(-0.78, -0.62).normalize();

export function createAtmosphere(scene, renderer, quality) {
  const env = {};
  for (const k in KEYS[0]) env[k] = KEYS[0][k] instanceof THREE.Color ? KEYS[0][k].clone() : KEYS[0][k];
  env.sunDir = new THREE.Vector3();
  env.progress = 0;
  env.night = 0;

  const skyU = {
    uTop: { value: env.top },
    uHorizon: { value: env.horizon },
    uFog: { value: env.fog },
    uSunDir: { value: env.sunDir },
    uSunColor: { value: env.sunColor },
    uHaze: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyU,
      vertexShader:
        'varying vec3 vDir; void main(){vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform vec3 uTop,uHorizon,uFog,uSunDir,uSunColor; uniform float uHaze; varying vec3 vDir;
      void main(){vec3 d=normalize(vDir); float y=d.y;
        vec3 col=mix(uHorizon,uTop,smoothstep(.0,.55,y));
        float s=max(dot(d,uSunDir),0.);
        col+=uSunColor*(pow(s,6.)*.32+pow(s,48.)*.45);
        col+=uSunColor*smoothstep(.9991,.9996,s)*2.2*step(-.02,y);
        col=mix(col,uFog,(1.-smoothstep(-.03,.16,y))*uHaze);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry(),
    sp = [],
    sr = rng(31);
  for (let i = 0; i < 420; i++) {
    const a = sr() * PI2,
      y = 0.12 + sr() * 0.88,
      r = Math.sqrt(1 - y * y);
    sp.push(Math.cos(a) * r * 560, y * 560, Math.sin(a) * r * 560);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xfff4dd,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    }),
  );
  stars.frustumCulled = false;
  sky.add(stars);

  const hemi = new THREE.HemisphereLight(env.hemiSky, env.hemiGround, env.hemiInt);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(env.sunColor, env.sunInt);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  const S = 75;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 420 });
  scene.add(sun, sun.target);
  scene.fog = new THREE.FogExp2(env.fog, env.fogDensity);

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x000000 });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 26 * 6);
  {
    const r = rng(77),
      m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * PI2 + r() * 0.2,
        d = 300 + r() * 170,
        cx = Math.cos(a) * d,
        cz = Math.sin(a) * d,
        cy = 55 + r() * 70,
        sc = 7 + r() * 9;
      const puffs = 4 + Math.floor(r() * 3);
      for (let j = 0; j < puffs; j++) {
        p.set(cx + (j - puffs / 2) * sc * 1.25 + r() * 4, cy + r() * sc * 0.4, cz + (r() - 0.5) * sc);
        const k = sc * (0.7 + r() * 0.6);
        s.set(k * 1.7, k * 0.62, k);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
        clouds.setMatrixAt(n++, m.compose(p, q, s));
      }
    }
    clouds.count = n;
  }
  clouds.frustumCulled = false;
  scene.add(clouds);

  const puffTex = softTexture(128, { noise: 0.9, seed: 5 });
  const puffU = {
    uTime: { value: 0 },
    uMap: { value: puffTex },
    uColor: { value: new THREE.Color() },
    uOpacity: { value: 0.7 },
  };
  const puffMat = new THREE.ShaderMaterial({
    uniforms: puffU,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: `uniform float uTime; varying vec2 vUv; varying float vA;
      void main(){
        vec3 c = instanceMatrix[3].xyz; float s = length(instanceMatrix[0].xyz);
        float ph = c.x*.13+c.z*.07;
        c.x += sin(uTime*.03+ph)*16.; c.z += cos(uTime*.022+ph)*10.;
        vec4 mv = viewMatrix*vec4(c,1.);
        mv.xy += position.xy*s*vec2(1.,.42);
        float dz = -mv.z;
        vA = smoothstep(6.,38.,dz)*(1.-smoothstep(170.,280.,dz));
        vUv = uv; gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying float vA;
      void main(){ float a = texture2D(uMap,vUv).a*vA*uOpacity; if(a<.004) discard; gl_FragColor=vec4(uColor,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const PUFF_MAX = 80;
  const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), puffMat, PUFF_MAX);
  {
    const r = rng(91),
      m = new THREE.Matrix4();
    for (let i = 0; i < PUFF_MAX; i++) {
      const s = 34 + r() * 40;
      m.makeScale(s, s, s);
      m.setPosition(
        WORLD.min * 0.82 + r() * WORLD.size * 0.82,
        2 + r() * 5,
        WORLD.min * 0.82 + r() * WORLD.size * 0.82,
      );
      puffs.setMatrixAt(i, m);
    }
  }
  puffs.frustumCulled = false;
  puffs.renderOrder = 5;
  scene.add(puffs);

  const KEYNAMES = Object.keys(KEYS[0]);
  function update(dt, time, progress, night, focus) {
    env.progress = damp(env.progress, progress, 1.1, dt);
    env.night = damp(env.night, night, 0.7, dt);
    const p = env.progress,
      n = env.night;
    for (const key of KEYNAMES) {
      const a = KEYS[0][key],
        b = KEYS[1][key],
        c = KEYS[2][key];
      if (a instanceof THREE.Color) env[key].copy(a).lerp(b, p).lerp(c, n);
      else env[key] = lerp(lerp(a, b, p), c, n);
    }
    const e = env.sunElev;
    env.sunDir.set(SUN_AZ.x * Math.cos(e), Math.sin(e), SUN_AZ.y * Math.cos(e)).normalize();

    scene.fog.color.copy(env.fog);
    scene.fog.density = env.fogDensity;
    hemi.color.copy(env.hemiSky);
    hemi.groundColor.copy(env.hemiGround);
    hemi.intensity = env.hemiInt;
    sun.color.copy(env.sunColor);
    sun.intensity = env.sunInt * Math.max(0, Math.min(1, e * 6 + 0.6));
    renderer.toneMappingExposure = env.exposure;
    cloudMat.emissive.copy(env.horizon).multiplyScalar(0.28 + env.night * 0.25);
    cloudMat.color.copy(env.hemiSky).lerp(env.sunColor, 0.25);
    puffU.uColor.value.copy(env.fog).lerp(env.horizon, 0.25).multiplyScalar(1.03);
    puffU.uOpacity.value = env.puff;
    puffU.uTime.value = time;
    stars.material.opacity = Math.max(0, env.night - 0.35) * 1.4;

    const texel = (S * 2) / sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel,
      fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + env.sunDir.x * 200, Math.max(30, env.sunDir.y * 200 + 40), fz + env.sunDir.z * 200);
  }
  function follow(cam) {
    sky.position.copy(cam.position);
  }
  function setQuality(q) {
    puffs.count = q.fogPuffs;
    sun.castShadow = q.shadow > 0;
    if (q.shadow > 0 && sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
  }
  setQuality(quality);
  update(1, 0, 0, 0, new THREE.Vector3());
  return { env, sun, hemi, sky, update, follow, setQuality };
}
