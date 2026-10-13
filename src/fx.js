import * as THREE from 'three';
import { clamp } from './util.js';
import { waveHeight, waveDamp, heightAt } from './terrain.js';

const NOISE_GLSL = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}`;
const OUT_GLSL = `#include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export class Wake {
  constructor(scene, max = 70) {
    this.max = max;
    this.points = [];
    this.lastX = 1e9;
    this.lastZ = 1e9;
    const V = max * 6;
    this.position = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.data = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const idx = [];
    for (let i = 0; i < max - 1; i++)
      for (let s = 0; s < 3; s++) {
        const a = i * 6 + s * 2,
          b = a + 1,
          c = a + 6,
          d = a + 7;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', this.position);
    g.setAttribute('aData', this.data);
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xf4fbf6) } };
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: `attribute vec3 aData; varying vec3 vData; varying vec2 vXZ;
        void main(){vData=aData; vXZ=position.xz; gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}`,
        fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vData; varying vec2 vXZ; ${NOISE_GLSL}
        void main(){
          float edge = 1.-abs(vData.x);
          float n = vnoise(vXZ*1.7+vec2(uTime*.4,-uTime*.3))*.6+vnoise(vXZ*4.1-uTime*.6)*.4;
          float foam = smoothstep(.15,.75,edge*(.45+n)) * vData.z;
          if(foam<.01) discard;
          gl_FragColor = vec4(uColor, foam*.85);
          ${OUT_GLSL}
        }`,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  reset() {
    this.points.length = 0;
    this.geometry.setDrawRange(0, 0);
    this.lastX = 1e9;
  }
  update(dt, t, boat) {
    this.uniforms.uTime.value = t;
    const sp = Math.abs(boat.forwardSpeed);
    for (const p of this.points) p.age += dt;
    while (this.points.length && this.points[this.points.length - 1].age > this.points[this.points.length - 1].life)
      this.points.pop();
    if (sp > 1 && Math.hypot(boat.stern.x - this.lastX, boat.stern.z - this.lastZ) > 0.75) {
      this.lastX = boat.stern.x;
      this.lastZ = boat.stern.z;
      this.points.unshift({
        x: boat.stern.x,
        z: boat.stern.z,
        rx: Math.cos(boat.heading),
        rz: Math.sin(boat.heading),
        age: 0,
        life: 2.2 + sp * 0.09,
        s: clamp(sp / 16, 0.25, 1) * (boat.boosting ? 1.2 : 1),
      });
      if (this.points.length > this.max) this.points.pop();
    }
    const P = this.position.array,
      D = this.data.array;
    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const p = this.points[i],
        a = p.age,
        k = a / p.life;
      const fade = Math.pow(1 - k, 1.4) * p.s * clamp(a * 6, 0, 1);
      const y = waveHeight(p.x, p.z, t, waveDamp(-heightAt(p.x, p.z))) + 0.14;
      const off = 0.6 + a * (1 + p.s * 1.7),
        armW = 0.45 + a * 0.4,
        cw = 1 + a * 0.7;
      const strips = [
        [-off, armW, fade * 0.9],
        [off, armW, fade * 0.9],
        [0, cw, fade * (1 - k) * 0.75],
      ];
      for (let s = 0; s < 3; s++) {
        const [o, w, al] = strips[s];
        for (let e = 0; e < 2; e++) {
          const side = e ? 1 : -1,
            v = (i * 6 + s * 2 + e) * 3,
            lat = o + (side * w) / 2;
          P[v] = p.x + p.rx * lat;
          P[v + 1] = y;
          P[v + 2] = p.z + p.rz * lat;
          D[v] = side;
          D[v + 1] = k;
          D[v + 2] = al;
        }
      }
    }
    this.position.needsUpdate = true;
    this.data.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, n - 1) * 18);
  }
}

export class Particles {
  constructor(scene, max, { additive = false } = {}) {
    this.max = max;
    this.alive = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aAlpha', this.aAlpha);
    g.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 400 } };
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: `uniform float uScale; attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=min(aSize*uScale/max(-mv.z,.1),96.); vC=aColor; vA=aAlpha; gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `varying vec3 vC; varying float vA;
        void main(){float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.1,d)*vA; if(a<.01) discard; gl_FragColor=vec4(vC,a);
        ${OUT_GLSL}}`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.limit = max;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, color, grav = -9, drag = 0.6) {
    if (this.alive >= this.limit) return;
    const i = this.alive++,
      j = i * 3;
    this.pos[j] = x;
    this.pos[j + 1] = y;
    this.pos[j + 2] = z;
    this.vel[j] = vx;
    this.vel[j + 1] = vy;
    this.vel[j + 2] = vz;
    this.col[j] = color.r;
    this.col[j + 1] = color.g;
    this.col[j + 2] = color.b;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.size[i] = s0;
    this.alpha[i] = 1;
  }
  update(dt) {
    let i = 0;
    while (i < this.alive) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.kill(i);
        continue;
      }
      const j = i * 3,
        k = this.life[i] / this.maxLife[i],
        dr = Math.exp(-this.drag[i] * dt);
      this.vel[j] *= dr;
      this.vel[j + 2] *= dr;
      this.vel[j + 1] = this.vel[j + 1] * dr + this.grav[i] * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = Math.min(1, (1 - k) * 2) * Math.min(1, this.life[i] * 10);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.alive);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
  kill(i) {
    const l = --this.alive;
    if (i !== l) {
      const a = i * 3,
        b = l * 3;
      for (let c = 0; c < 3; c++) {
        this.pos[a + c] = this.pos[b + c];
        this.vel[a + c] = this.vel[b + c];
        this.col[a + c] = this.col[b + c];
      }
      this.life[i] = this.life[l];
      this.maxLife[i] = this.maxLife[l];
      this.grav[i] = this.grav[l];
      this.drag[i] = this.drag[l];
      this.s0[i] = this.s0[l];
      this.s1[i] = this.s1[l];
      this.size[i] = this.size[l];
      this.alpha[i] = this.alpha[l];
    }
  }
  clear() {
    this.alive = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

export function glowSprite(color, size, opacity = 1) {
  const u = { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uSize: { value: size } };
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uSize; varying vec2 vUv;
      void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.); mv.xy+=position.xy*uSize; gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main(){float d=length(vUv-.5)*2.; float a=pow(max(1.-d,0.),2.2)*uOpacity + smoothstep(.22,0.,d)*uOpacity*.6; gl_FragColor=vec4(uColor*a,a);
      ${OUT_GLSL}}`,
    }),
  );
  m.frustumCulled = false;
  m.renderOrder = 7;
  m.userData.u = u;
  return m;
}

export function lightPillar(color, height = 40, radius = 1.4) {
  const g = new THREE.CylinderGeometry(radius * 0.5, radius, height, 16, 1, true);
  g.translate(0, height / 2, 0);
  const u = {
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: 0.5 },
    uTime: { value: 0 },
    uH: { value: height },
  };
  const m = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){vY=position.y; vec4 wp=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uH; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){float h=vY/uH; float rim=pow(abs(dot(normalize(vN),vV)),1.6);
        float a=rim*(1.-h)*(1.-h)*uOpacity*(.8+.2*sin(vY*.6-uTime*3.));
        gl_FragColor=vec4(uColor*a,a);
        ${OUT_GLSL}}`,
    }),
  );
  m.frustumCulled = false;
  m.renderOrder = 4;
  m.userData.u = u;
  return m;
}

export function beamCone(length = 110, radius = 9) {
  const g = new THREE.ConeGeometry(radius, length, 28, 6, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(Math.PI / 2);
  const u = {
    uPower: { value: 0 },
    uTime: { value: 0 },
    uLen: { value: length },
    uColor: { value: new THREE.Color(0xffe2a6) },
  };
  const m = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vW;
      void main(){vD=-position.z; vec4 wp=modelMatrix*vec4(position,1.); vW=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp;}`,
      fragmentShader: `uniform float uPower; uniform float uTime; uniform float uLen; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vW; ${NOISE_GLSL}
      void main(){float d=clamp(vD/uLen,0.,1.);
        float rim=pow(abs(dot(normalize(vN),vV)),1.3);
        float dust=.75+.5*vnoise(vW.xz*.12+vec2(uTime*.25,uTime*.1))*vnoise(vW.xy*.2-uTime*.2);
        float a=rim*pow(1.-d,1.6)*smoothstep(0.,.03,d)*uPower*dust;
        gl_FragColor=vec4(uColor*a,a);
        ${OUT_GLSL}}`,
    }),
  );
  m.frustumCulled = false;
  m.renderOrder = 8;
  m.userData.u = u;
  return m;
}

export function labelSprite(title, kicker, accent = '#f2b84b') {
  const css = getComputedStyle(document.documentElement);
  const font = css.getPropertyValue('--font').trim() || 'sans-serif';
  const c = document.createElement('canvas'),
    g = c.getContext('2d');
  const S = 2;
  g.font = `700 ${30 * S}px ${font}`;
  const w = Math.ceil(Math.max(g.measureText(title).width, 160 * S) + 56 * S),
    h = 88 * S;
  c.width = w;
  c.height = h;
  const plate = (x, y, pw, ph, r) => {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, pw, ph, r);
    else g.rect(x, y, pw, ph);
  };
  g.fillStyle = 'rgba(16,47,66,.88)';
  plate(0, 0, w, h, 14 * S);
  g.fill();
  g.strokeStyle = 'rgba(234,243,242,.24)';
  g.lineWidth = S;
  plate(S / 2, S / 2, w - S, h - S, 14 * S);
  g.stroke();
  g.fillStyle = accent;
  g.beginPath();
  g.arc(30 * S, 26 * S, 4 * S, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = css.getPropertyValue('--ocean-200').trim() || '#a9cfdf';
  g.font = `500 ${16 * S}px ${font}`;
  g.textBaseline = 'alphabetic';
  g.fillText(kicker, 42 * S, 32 * S);
  g.fillStyle = '#eaf3f2';
  g.font = `650 ${30 * S}px ${font}`;
  g.fillText(title, 24 * S, 68 * S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
      sizeAttenuation: false,
    }),
  );
  sp.scale.set((0.05 * w) / h, 0.05, 1);
  sp.center.set(0.5, 0);
  sp.renderOrder = 9;
  return sp;
}
