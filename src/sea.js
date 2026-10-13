import * as THREE from 'three';
import { WORLD, WAVES_GLSL } from './terrain.js';

export function createSea(heightTex) {
  const uniforms = {
    uTime: { value: 0 },
    uHeight: { value: heightTex },
    uWorld: { value: new THREE.Vector3(WORLD.min, WORLD.min, WORLD.size) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uDeep: { value: new THREE.Color(0x123c4c) },
    uMid: { value: new THREE.Color(0x1f6b78) },
    uShallow: { value: new THREE.Color(0x3fc0b4) },
    uFoam: { value: new THREE.Color(0xf4f1e6) },
    uSkyTop: { value: new THREE.Color(0x6f8fa3) },
    uSkyHorizon: { value: new THREE.Color(0xe9d7bf) },
    uFogColor: { value: new THREE.Color(0xb7c4c1) },
    uFogDensity: { value: 0.006 },
    uBeamDir: { value: new THREE.Vector2(1, 0) },
    uBeamPos: { value: new THREE.Vector3(5, 30, -79) },
    uBeamPower: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uTime; uniform sampler2D uHeight; uniform vec3 uWorld;
      varying vec3 vWorld; varying float vDepth; varying float vWave; varying vec2 vGrad;
      ${WAVES_GLSL}
      void main(){
        vec4 wp = modelMatrix*vec4(position,1.);
        vec2 uv = (wp.xz-uWorld.xy)/uWorld.z;
        float ground = texture2D(uHeight, uv).r*10.-7.;
        float depth = -ground;
        float damp = smoothstep(.2,3.5,depth);
        vec2 g; float w = waveSum(wp.xz,uTime,g)*damp;
        wp.y += w;
        vWorld = wp.xyz; vDepth = depth; vWave = w; vGrad = g*damp;
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform vec3 uFoam;
      uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uFogColor; uniform float uFogDensity;
      uniform vec2 uBeamDir; uniform vec3 uBeamPos; uniform float uBeamPower;
      varying vec3 vWorld; varying float vDepth; varying float vWave; varying vec2 vGrad;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 V = normalize(cameraPosition-vWorld);
        float dist = length(cameraPosition-vWorld);
        float detail = 1.-smoothstep(40.,160.,dist);
        vec2 rp = mat2(.8,-.6,.6,.8)*vWorld.xz*.55, rp2 = mat2(.6,.8,-.8,.6)*vWorld.xz*.93;
        vec2 ripple = vec2(vnoise(rp+vec2(uTime*.35,uTime*.2))+vnoise(rp2-uTime*.3)-1., vnoise(rp*1.3-vec2(uTime*.25,-uTime*.4))+vnoise(rp2*1.4+uTime*.2)-1.)*.6;
        vec3 N = normalize(vec3(-vGrad.x-ripple.x*.35*detail, 1., -vGrad.y-ripple.y*.35*detail));
        float depth = max(vDepth,0.);
        vec3 water = mix(uShallow, uMid, smoothstep(.2,2.8,depth));
        water = mix(water, uDeep, smoothstep(2.8,6.5,depth));
        water += uShallow*.22*smoothstep(.25,.6,vWave)*(1.-smoothstep(4.,7.,depth));
        vec3 R = reflect(-V,N);
        vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.,.5,R.y));
        float fres = .03+.97*pow(1.-max(dot(N,V),0.),5.);
        vec3 col = mix(water, sky, clamp(fres*.85,0.,1.));
        float ndl = max(dot(N,uSunDir),0.);
        col *= .72+.38*ndl;
        float spec = max(dot(R,uSunDir),0.);
        col += uSunColor*(pow(spec,420.)*5.5*detail + pow(spec,36.)*.22);
        vec2 q = mat2(.8,-.6,.6,.8)*vWorld.xz;
        float n1 = vnoise(q*.9+vec2(uTime*.3,0.))*.65+vnoise(vWorld.xz*2.1-uTime*.2)*.35;
        float n2 = vnoise(q*2.3-vec2(0.,uTime*.5))*.6+vnoise(mat2(.8,.6,-.6,.8)*vWorld.xz*4.7+uTime*.4)*.4;
        float shore = 1.-smoothstep(.05,.55+n1*.35,depth);
        float bands = smoothstep(.72,.95,sin(depth*3.4+uTime*1.7+n1*3.)) * (1.-smoothstep(.6,3.,depth)) * step(.02,depth);
        float caps = smoothstep(.66,.95,vWave+n2*.35)*smoothstep(4.,8.,depth)*.45*detail;
        float foam = clamp(max(shore, bands*.75)+caps, 0., 1.) * smoothstep(.25,.6,n2+.25);
        col = mix(col, uFoam*(.85+.25*ndl), foam);
        if(uBeamPower>0.){
          vec2 d = vWorld.xz-uBeamPos.xz; float l = length(d);
          float ang = abs(dot(normalize(d), vec2(-uBeamDir.y,uBeamDir.x)));
          float lit = (1.-smoothstep(.0,.12+12./max(l,1.),ang))*step(0.,dot(d,uBeamDir))*(1.-smoothstep(30.,140.,l));
          col += vec3(1.,.86,.55)*lit*uBeamPower*.35;
        }
        float fog = 1.-exp(-uFogDensity*uFogDensity*dist*dist);
        fog = max(fog, smoothstep(200.,300.,dist));
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  let cell = 1;
  function setResolution(size, segments) {
    mesh.geometry.dispose();
    const g = new THREE.PlaneGeometry(size, size, segments, segments);
    g.rotateX(-Math.PI / 2);
    mesh.geometry = g;
    cell = size / segments;
  }
  function follow(cam) {
    mesh.position.set(Math.round(cam.position.x / cell) * cell, 0, Math.round(cam.position.z / cell) * cell);
  }
  setResolution(620, 160);
  return { mesh, uniforms, setResolution, follow };
}
