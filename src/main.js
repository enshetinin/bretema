import * as THREE from 'three';
import { clamp, damp, smoothstep, fmtTime, PI2 } from './util.js';
import { bakeHeightTexture, heightAt, waveHeight, ISLANDS } from './terrain.js';
import { createSea } from './sea.js';
import { createAtmosphere } from './atmosphere.js';
import { createWorld } from './world.js';
import { Boat } from './boat.js';
import { loadModel } from './models.js';
import { Wake, Particles, glowSprite, lightPillar, beamCone, labelSprite } from './fx.js';
import { createQuests } from './quests.js';
import { createFauna } from './fauna.js';
import { AudioEngine } from './audio.js';
import { createInput } from './input.js';
import { createUI } from './ui.js';
import { QualityManager } from './quality.js';

const $ = (id) => document.getElementById(id);
const START = { x: 0, z: 111, h: 0 };
const FINALE = { x: 9, z: -60 };
const SPARKS = [
  { x: 7, z: 39, name: 'Ría de Corcubión' },
  { x: -38, z: 45, name: 'Porto das Laxes' },
  { x: -80, z: -14, name: 'Pedras de Muxía' },
  { x: -30, z: -37, name: 'Mar da Brétema' },
  { x: 39, z: -68, name: 'Canle de Ons' },
  { x: 88, z: 44, name: 'Illas Cíes' },
  { x: 20, z: -18, name: 'Ronsel da Lúa' },
];

await Promise.race([
  Promise.all([
    document.fonts.load('700 24px "Inter"'),
    document.fonts.load('400 24px "Inter"'),
    document.fonts.load('italic 400 24px "Inter"'),
  ]),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {});

const quality = new QualityManager(applyQuality);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: quality.level !== 'low', powerPreference: 'high-performance' });
} catch (err) {
  $('errorBanner').textContent =
    'Este navegador non pode iniciar WebGL. Activa a aceleración por hardware ou proba con outro navegador.';
  $('errorBanner').classList.remove('hidden');
  throw err;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('viewport').appendChild(renderer.domElement);
window.__bretemaReady = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 900);
camera.position.set(0, 14, 140);

const heightMap = bakeHeightTexture(512);
const atmo = createAtmosphere(scene, renderer, quality.current);
const sea = createSea(heightMap.tex);
scene.add(sea.mesh);
const world = createWorld(scene, quality.current);
const boat = new Boat(scene);
const wake = new Wake(scene);
const spray = new Particles(scene, 900);
const glow = new Particles(scene, 700, { additive: true });
const fauna = createFauna(scene, world.materials);
const lantern = glowSprite(0xffc56e, 1.8, 0.5);
lantern.position.copy(boat.lanternPos);
boat.body.add(lantern);
const modelsReady = new URLSearchParams(location.search).has('procedural')
  ? Promise.resolve()
  : Promise.all([
      loadModel('assets/models/dorna.glb', renderer).then((m) => m && boat.attachModel(m)),
      loadModel('assets/models/faro.glb', renderer).then((m) => m && world.attachFaro(m)),
      loadModel('assets/models/dornas_fondeadas.glb', renderer).then((m) => m && world.attachMoored(m)),
      loadModel('assets/models/horreo.glb', renderer).then((m) => m && world.attachHorreos(m)),
      loadModel('assets/models/batea.glb', renderer).then((m) => m && world.attachBateas(m)),
    ]);

const lamp = world.lamp;
const lampGlow = glowSprite(0xffd796, 10, 0.2);
lampGlow.position.copy(lamp);
scene.add(lampGlow);
const beamGroup = new THREE.Group();
beamGroup.position.copy(lamp);
scene.add(beamGroup);
const beams = [beamCone(120, 10), beamCone(120, 10)];
beams[1].rotation.y = Math.PI;
beams.forEach((b) => {
  b.rotation.x = -0.05;
  beamGroup.add(b);
});
const lampLight = new THREE.PointLight(0xffd59a, 0, 150, 1.2);
lampLight.position.copy(lamp);
scene.add(lampLight);
const finaleRing = new THREE.Mesh(
  new THREE.TorusGeometry(6, 0.22, 8, 64),
  new THREE.MeshBasicMaterial({ color: 0xffd795, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
);
finaleRing.rotation.x = Math.PI / 2;
finaleRing.position.set(FINALE.x, 0.6, FINALE.z);
scene.add(finaleRing);
const finalePillar = lightPillar(0xffd795, 60, 3);
finalePillar.position.set(FINALE.x, 0, FINALE.z);
finalePillar.visible = false;
scene.add(finalePillar);
const finaleLabel = labelSprite('Faro de Fisterra', 'Acende a luz');
finaleLabel.position.set(FINALE.x, 7, FINALE.z);
finaleLabel.visible = false;
scene.add(finaleLabel);

const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
const sparkRingMat = new THREE.MeshBasicMaterial({
  color: 0xffd98f,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  toneMapped: false,
  blending: THREE.AdditiveBlending,
});
const sparks = SPARKS.map((d, i) => {
  const g = new THREE.Group();
  g.position.set(d.x, 2.8, d.z);
  scene.add(g);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), sparkMat);
  g.add(core);
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 48), sparkRingMat);
  r1.rotation.x = 0.72;
  g.add(r1);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.035, 5, 40), sparkRingMat);
  r2.rotation.y = 0.96;
  g.add(r2);
  const halo = glowSprite(0xffcf7a, 7, 0.8);
  g.add(halo);
  const pillar = lightPillar(0xffd38a, 46, 1.6);
  pillar.position.set(d.x, 0, d.z);
  scene.add(pillar);
  const under = new THREE.Mesh(new THREE.TorusGeometry(2, 0.06, 6, 48), sparkRingMat);
  under.rotation.x = Math.PI / 2;
  under.position.set(d.x, 0.3, d.z);
  scene.add(under);
  return { ...d, i, g, core, r1, r2, halo, pillar, under, collected: false, pull: 0 };
});
const fliers = [];

const mods = {
  boostCapacity: 1,
  boostRegen: 1,
  speed: 1,
  revealSparks: false,
  fogMult: 1,
  sirenWind: false,
  windHeading: 2.36,
};
const ui = createUI();
ui.bakeMap(heightMap.heights, heightMap.res);
const audio = new AudioEngine();
try {
  audio.muted = localStorage.getItem('bretema.muted') === '1';
} catch {}
const quests = createQuests(scene, world.materials, mods, {
  dialogue: (name, pages, cb) => {
    audio.talk();
    ui.dialogue(name, pages, cb);
  },
  toast: (t, i) => ui.toast(t, i),
  questUpdate: () => {
    hudDirty = true;
  },
  sound: (k, a) => {
    if (k === 'collectSmall') audio.collect(2);
    else audio[k]?.(a);
  },
  burst: (x, y, z, c) => burst(x, y, z, c, 40),
  emitFlame: (p, pulse) => {
    if (Math.random() < 0.5 + pulse)
      glow.emit(
        p.x + (Math.random() - 0.5) * 0.6,
        p.y,
        p.z + (Math.random() - 0.5) * 0.6,
        0,
        1.5 + pulse,
        0,
        0.8,
        0.9,
        0.2,
        FLAME,
        1,
        1,
      );
  },
});
const colliders = [...world.props.colliders, ...quests.colliders];
const FLAME = new THREE.Color(0x5b8cff),
  GOLD = new THREE.Color(0xffd27a),
  WHITE = new THREE.Color(0xf2f8f6),
  TEAL = new THREE.Color(0x8ff0dd);

const state = {
  mode: 'intro',
  elapsed: 0,
  found: 0,
  impactCooldown: 0,
  finaleT: 0,
  perf: false,
  prompt: null,
  song: 0,
  hitCount: 0,
};
const discovered = new Set();
function updatePlace() {
  let best = null,
    bd = Infinity;
  for (const isl of ISLANDS) {
    const d =
      Math.hypot((boat.pos.x - isl.x) / isl.rx, (boat.pos.z - isl.z) / isl.rz) / (isl.type === 'stack' ? 3.2 : 1.85);
    if (d < bd) {
      bd = d;
      best = isl;
    }
  }
  if (bd < 1) {
    if (!discovered.has(best.id)) {
      discovered.add(best.id);
      ui.discover(best.name, discovered.size, ISLANDS.length);
      audio.discover();
    }
    ui.place(best.name, `${discovered.size} de ${ISLANDS.length} lugares`);
  } else ui.place('Mar aberto', `${discovered.size} de ${ISLANDS.length} lugares`);
}
let hudDirty = true;

const input = createInput(renderer.domElement, {
  key(code) {
    if (code === 'KeyF') {
      state.perf = !state.perf;
      $('perf').classList.toggle('hidden', !state.perf);
    }
    if (code === 'KeyM') toggleSound();
    if (code === 'KeyP' || code === 'Escape') {
      if (ui.inDialogue && code === 'Escape') {
        while (ui.inDialogue) ui.advance();
        return;
      }
      if (state.mode === 'playing') pause();
      else if (state.mode === 'paused') resume();
    }
    if (code === 'KeyR' && ['playing', 'paused', 'won'].includes(state.mode)) restart();
    if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      if (state.mode === 'intro' && code !== 'Space' && !$('startBtn').disabled) start();
      else if (state.mode === 'playing' && ui.inDialogue) {
        ui.advance();
        audio.ui();
      } else if (state.mode === 'playing' && state.prompt && code !== 'Space') quests.talk(state.prompt.id);
      else if (state.mode === 'won' && code === 'Enter') restart();
    }
  },
  touchStart() {
    audio.init();
  },
});

function applyQuality(q) {
  if (!renderer) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr * (innerWidth < 720 ? 0.85 : 1)));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = q.shadow > 0;
  atmo.setQuality(q);
  world.setQuality(q);
  sea.setResolution(q.seaSize, q.seaSeg);
  spray.limit = Math.min(spray.max, q.particles);
  glow.limit = Math.min(glow.max, Math.round(q.particles * 0.8));
  scene.traverse((o) => {
    if (o.material && o.material.isMeshStandardMaterial) o.material.needsUpdate = true;
  });
  updatePointScale();
  $('qualityNow').textContent = q.label;
}
function updatePointScale() {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  spray.uniforms.uScale.value = s;
  glow.uniforms.uScale.value = s;
}
function onResize() {
  const w = innerWidth,
    h = innerHeight;
  camera.aspect = w / h;
  camera.fov = h > w ? 72 : w < 720 ? 66 : 58;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.current.pr * (w < 720 ? 0.85 : 1)));
  renderer.setSize(w, h);
  updatePointScale();
}
addEventListener('resize', onResize);
onResize();
applyQuality(quality.current);
const qualityButtons = [...document.querySelectorAll('#qualitySeg [data-quality]')];
function syncQualityButtons() {
  for (const b of qualityButtons) b.setAttribute('aria-checked', String(b.dataset.quality === quality.mode));
}
for (const b of qualityButtons)
  b.addEventListener('click', () => {
    quality.setMode(b.dataset.quality);
    applyQuality(quality.current);
    syncQualityButtons();
    audio.ui();
  });
syncQualityButtons();

function resetGame() {
  boat.reset(START.x, START.z, START.h);
  state.elapsed = 0;
  state.found = 0;
  state.impactCooldown = 0;
  state.finaleT = 0;
  state.hitCount = 0;
  Object.assign(mods, { boostCapacity: 1, boostRegen: 1, speed: 1, revealSparks: false, fogMult: 1, sirenWind: false });
  for (const s of sparks) {
    s.collected = false;
    s.pull = 0;
    s.g.visible = s.pillar.visible = s.under.visible = true;
    s.g.position.set(s.x, 2.8, s.z);
  }
  fliers.length = 0;
  wake.reset();
  spray.clear();
  glow.clear();
  quests.reset();
  fauna.reset();
  input.release();
  input.state.look = 0;
  input.state.lookPitch = 0;
  discovered.clear();
  ui.reset();
  cameraRig.snap = true;
  hudDirty = true;
}
function hideOverlays() {
  for (const id of ['introOverlay', 'pauseOverlay', 'winOverlay']) $(id).classList.add('hidden');
}
function start() {
  audio.init();
  audio.setMuted(audio.muted);
  resetGame();
  hideOverlays();
  state.mode = 'playing';
  document.body.classList.add('playing');
  document.body.classList.remove('cinematic');
  audio.start();
  ui.toast('Segue as columnas de luz sobre o mar', '✳');
  setTimeout(() => {
    if (state.mode === 'playing' && state.found === 0)
      ui.toast('Fala coas xentes das illas: teñen encargos', '◇', 3600);
  }, 9000);
}
const restart = start;
function pause() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  input.release();
  $('pauseOverlay').classList.remove('hidden');
}
function resume() {
  if (state.mode !== 'paused') return;
  state.mode = 'playing';
  $('pauseOverlay').classList.add('hidden');
}
function toggleSound() {
  audio.muted = !audio.muted;
  audio.setMuted(audio.muted);
  try {
    localStorage.setItem('bretema.muted', audio.muted ? '1' : '0');
  } catch {}
  $('soundBtn').classList.toggle('muted', audio.muted);
  $('soundBtn').setAttribute('aria-label', audio.muted ? 'Activar son' : 'Silenciar son');
  if (!audio.muted) {
    audio.init();
    audio.ui();
  }
}
$('soundBtn').classList.toggle('muted', audio.muted);
$('startBtn').addEventListener('click', start);
$('pauseBtn').addEventListener('click', () => {
  if (state.mode === 'playing') pause();
  else if (state.mode === 'paused') resume();
});
$('soundBtn').addEventListener('click', toggleSound);
$('resumeBtn').addEventListener('click', resume);
$('restartPauseBtn').addEventListener('click', restart);
$('restartWinBtn').addEventListener('click', restart);
$('prompt').addEventListener('click', () => {
  if (state.mode === 'playing' && state.prompt && !ui.inDialogue) quests.talk(state.prompt.id);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing' && !ui.inDialogue) pause();
});

function startFinale() {
  state.mode = 'finale';
  state.finaleT = 0;
  input.release();
  ui.prompt(null);
  document.body.classList.add('cinematic');
  audio.ignite();
  ui.toast('O faro de Fisterra acéndese', '✹', 4200);
}
function win() {
  state.mode = 'won';
  const t = state.elapsed;
  let best = null;
  try {
    best = parseFloat(localStorage.getItem('bretema.best'));
  } catch {}
  if (!best || t < best) {
    best = t;
    try {
      localStorage.setItem('bretema.best', String(t));
    } catch {}
  }
  $('finalTime').textContent = fmtTime(t);
  $('bestTime').textContent = fmtTime(best);
  $('finalQuests').textContent = `${quests.doneCount()} / 3`;
  $('finalPlaces').textContent = `${discovered.size} / ${ISLANDS.length}`;
  $('rankTitle').textContent =
    t < 240 ? 'Lenda da Costa da Morte' : t < 420 ? 'Man firme no temón' : 'Corazón atlántico';
  $('winOverlay').classList.remove('hidden');
}

function burst(x, y, z, color, n = 50) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * PI2,
      u = Math.random() * 2 - 1,
      sp = 3 + Math.random() * 7,
      r = Math.sqrt(1 - u * u);
    glow.emit(
      x,
      y,
      z,
      Math.cos(a) * r * sp,
      u * sp + 3,
      Math.sin(a) * r * sp,
      0.8 + Math.random() * 0.9,
      0.7,
      0.1,
      c,
      -3,
      1.4,
    );
  }
}
function splash(x, z, k = 1) {
  const y = waveHeight(x, z, clock.t);
  for (let i = 0; i < 18 * k; i++) {
    const a = Math.random() * PI2,
      sp = 1.5 + Math.random() * 3;
    spray.emit(
      x,
      y + 0.2,
      z,
      Math.cos(a) * sp,
      3 + Math.random() * 4 * k,
      Math.sin(a) * sp,
      0.7 + Math.random() * 0.5,
      0.35,
      0.8,
      WHITE,
      -11,
      0.8,
    );
  }
}

function gameStep(dt, t) {
  state.elapsed += dt;
  state.impactCooldown = Math.max(0, state.impactCooldown - dt);
  const raw = input.poll();
  const frozen = ui.inDialogue;
  const ctrl = frozen ? { throttle: 0, steer: 0, boost: false } : raw;
  const wasBoosting = boat.boosting;
  mods.windHeading = 2.36 + Math.sin(t * 0.021) * 0.45;
  const impact = boat.step(dt, ctrl, mods, colliders);
  if (boat.boosting && !wasBoosting) {
    audio.boost();
    cameraRig.fovKick += 3;
  }
  if (impact > 1.5) {
    cameraRig.trauma = Math.min(1, cameraRig.trauma + impact * 0.06);
    audio.impact(impact);
    splash(boat.bow.x, boat.bow.z, Math.min(1.6, impact * 0.15));
    if (state.impactCooldown === 0 && impact > 3) {
      ui.toast('Coidado coas rochas!', '⚓');
      state.impactCooldown = 2.2;
      state.hitCount++;
    }
  }
  for (const s of sparks) {
    if (s.collected) continue;
    const d = Math.hypot(boat.pos.x - s.g.position.x, boat.pos.z - s.g.position.z);
    if (d < 11) {
      s.pull = Math.min(1, s.pull + dt * 1.5);
      s.g.position.x = damp(s.g.position.x, boat.pos.x, s.pull * 2.6, dt);
      s.g.position.z = damp(s.g.position.z, boat.pos.z, s.pull * 2.6, dt);
    }
    if (d < 4.7) collectSpark(s);
  }
  if (state.found === 7 && Math.hypot(boat.pos.x - FINALE.x, boat.pos.z - FINALE.z) < 8) startFinale();
  const q = quests.update(dt, t, boat, state.mode === 'playing' && !frozen);
  state.prompt = frozen ? null : q.prompt;
  state.song = q.song;
  updatePlace();
  ui.prompt(state.prompt);
}
function collectSpark(s) {
  s.collected = true;
  s.g.visible = s.pillar.visible = s.under.visible = false;
  state.found++;
  hudDirty = true;
  audio.collect(state.found);
  cameraRig.fovKick += 5;
  burst(s.g.position.x, s.g.position.y, s.g.position.z, 0xffd27a, 70);
  ui.sparkCard(state.found, s.name);
  $('hud').classList.remove('pulse');
  void $('hud').offsetWidth;
  $('hud').classList.add('pulse');
  fliers.push({
    p0: s.g.position.clone(),
    t: 0,
    dur: 2.4 + Math.random() * 0.4,
    sprite: (() => {
      const g = glowSprite(0xffe2a0, 4, 1);
      scene.add(g);
      return g;
    })(),
  });
  if (state.found === 7)
    setTimeout(() => {
      if (state.mode === 'playing') ui.toast('O faro de Fisterra chama por ti', '✹', 4000);
    }, 2600);
}
const _bez = new THREE.Vector3(),
  _mid = new THREE.Vector3();
function updateFliers(dt) {
  for (let i = fliers.length - 1; i >= 0; i--) {
    const f = fliers[i];
    f.t += dt;
    const u = Math.min(1, f.t / f.dur),
      e = u * u * (3 - 2 * u);
    _mid.copy(f.p0).lerp(lamp, 0.5);
    _mid.y += 34;
    _bez
      .copy(f.p0)
      .multiplyScalar((1 - e) * (1 - e))
      .addScaledVector(_mid, 2 * e * (1 - e))
      .addScaledVector(lamp, e * e);
    f.sprite.position.copy(_bez);
    if (Math.random() < 0.9)
      glow.emit(
        _bez.x,
        _bez.y,
        _bez.z,
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
        0.9,
        0.9,
        0.1,
        GOLD,
        0,
        0.5,
      );
    if (u >= 1) {
      scene.remove(f.sprite);
      f.sprite.geometry.dispose();
      f.sprite.material.dispose();
      fliers.splice(i, 1);
      lampFlash = 1;
      audio.arrive();
      burst(lamp.x, lamp.y, lamp.z, 0xffe2a0, 30);
    }
  }
}
let lampFlash = 0;

const cameraRig = {
  look: new THREE.Vector3(0, 2, 90),
  pos: new THREE.Vector3(),
  snap: true,
  fovKick: 0,
  trauma: 0,
  orbit: 0,
};
const _desired = new THREE.Vector3(),
  _target = new THREE.Vector3();
function updateCamera(dt, t) {
  const fovBase = camera.aspect < 1 ? 72 : innerWidth < 720 ? 66 : 58;
  const lookIn = input.state;
  if (state.mode === 'intro') {
    cameraRig.orbit += dt * 0.06;
    const a = cameraRig.orbit + 2.6;
    _desired.set(boat.pos.x + Math.sin(a) * 26, 8.5, boat.pos.z + Math.cos(a) * 26);
    _target.set(boat.pos.x, 2.4, boat.pos.z - 4);
  } else if (state.mode === 'finale' || state.mode === 'won') {
    cameraRig.orbit += dt * (state.mode === 'won' ? 0.035 : 0.07);
    const a = cameraRig.orbit;
    _desired.set(lamp.x + Math.sin(a) * 62, lamp.y + 4, lamp.z + 40 + Math.cos(a) * 30);
    _target.set(lamp.x, lamp.y - 2, lamp.z);
  } else {
    if (!lookIn.dragging && performance.now() / 1000 - lookIn.lastLookInput > 1.3) {
      lookIn.look = damp(lookIn.look, 0, 2.2, dt);
      lookIn.lookPitch = damp(lookIn.lookPitch, 0, 2.2, dt);
    }
    const yaw = boat.heading + lookIn.look,
      sp = clamp(boat.speed, 0, 26);
    const dist = 15.5 + sp * 0.22,
      height = 6.4 + sp * 0.08 + lookIn.lookPitch * 12;
    _desired.set(boat.pos.x - Math.sin(yaw) * dist, height, boat.pos.z + Math.cos(yaw) * dist);
    const lead = 5 + sp * 0.3;
    _target.set(boat.pos.x + boat.fwdX * lead, 2.3, boat.pos.z + boat.fwdZ * lead);
  }
  const ground = heightAt(_desired.x, _desired.z);
  _desired.y = Math.max(_desired.y, ground + 3.5, waveHeight(_desired.x, _desired.z, t) + 2);
  if (cameraRig.snap) {
    camera.position.copy(_desired);
    cameraRig.look.copy(_target);
    cameraRig.snap = false;
  }
  const k = state.mode === 'playing' || state.mode === 'paused' ? 3.4 : 1.4;
  camera.position.x = damp(camera.position.x, _desired.x, k, dt);
  camera.position.z = damp(camera.position.z, _desired.z, k, dt);
  camera.position.y = damp(camera.position.y, _desired.y, k * 1.2, dt);
  cameraRig.look.lerp(_target, 1 - Math.exp(-dt * (k + 1.6)));
  camera.lookAt(cameraRig.look);
  cameraRig.trauma = Math.max(0, cameraRig.trauma - dt * 1.6);
  const sh = cameraRig.trauma * cameraRig.trauma;
  if (sh > 0) {
    camera.rotation.z += Math.sin(t * 47) * 0.03 * sh;
    camera.position.y += Math.sin(t * 61) * 0.4 * sh;
  }
  const wantShift = state.mode === 'intro' && camera.aspect > 1.15 ? 0.2 : 0;
  cameraRig.shift = damp(cameraRig.shift || 0, wantShift, 2.5, dt);
  if (cameraRig.shift > 0.002)
    camera.setViewOffset(innerWidth, innerHeight, -cameraRig.shift * innerWidth, 0, innerWidth, innerHeight);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  cameraRig.fovKick = damp(cameraRig.fovKick, 0, 3, dt);
  const fov = fovBase + (boat.boosting ? 6 : 0) * (state.mode === 'playing' ? 1 : 0) + cameraRig.fovKick;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = damp(camera.fov, fov, 5, dt);
    camera.updateProjectionMatrix();
  }
}

function updateVisuals(dt, t) {
  boat.updateVisual(dt, t, mods.windHeading);
  wake.update(dt, t, boat);
  const sp = Math.abs(boat.forwardSpeed);
  if (sp > 7.5 && state.mode === 'playing') {
    const n = (boat.boosting ? 4 : 1.5) * (sp / 20),
      rx = Math.cos(boat.heading),
      rz = Math.sin(boat.heading);
    for (let i = 0; i < n + Math.random(); i++) {
      const side = Math.random() < 0.5 ? -1 : 1,
        out = 2 + Math.random() * 2.5;
      spray.emit(
        boat.bow.x + rx * side * 0.5,
        boat.bow.y + 0.2,
        boat.bow.z + rz * side * 0.5,
        rx * side * out + boat.vel.x * 0.5,
        2.5 + Math.random() * 2.5,
        rz * side * out + boat.vel.y * 0.5,
        0.6 + Math.random() * 0.4,
        0.25,
        0.7,
        WHITE,
        -12,
        0.9,
      );
    }
  }
  if (mods.sirenWind && sp > 4 && Math.random() < 0.6)
    glow.emit(
      boat.stern.x + (Math.random() - 0.5) * 2,
      boat.stern.y + 1 + Math.random() * 3,
      boat.stern.z + (Math.random() - 0.5) * 2,
      0,
      0.6,
      0,
      1.4,
      0.5,
      0.1,
      TEAL,
      0,
      0.6,
    );
  if (mods.boostCapacity > 1 && boat.boosting)
    glow.emit(
      boat.stern.x,
      boat.stern.y + 1.2,
      boat.stern.z,
      (Math.random() - 0.5) * 2,
      1,
      (Math.random() - 0.5) * 2,
      0.7,
      0.5,
      0.1,
      GOLD,
      0,
      1,
    );
  fauna.update(dt, t, boat, splash);
  spray.update(dt);
  glow.update(dt);
  updateFliers(dt);
  for (const s of sparks) {
    if (s.collected) continue;
    s.g.position.y = 2.9 + Math.sin(t * 2.15 + s.i) * 0.43;
    s.core.rotation.y = t * 0.9 + s.i;
    s.r1.rotation.z = t * 0.74;
    s.r2.rotation.x = t * 0.6;
    s.halo.userData.u.uOpacity.value = 0.65 + Math.sin(t * 3 + s.i) * 0.15;
    s.pillar.userData.u.uTime.value = t;
    s.pillar.userData.u.uOpacity.value = 0.45 + atmo.env.fogDensity * 20;
    s.under.position.y = 0.25 + waveHeight(s.x, s.z, t) * 0.8;
    s.under.scale.setScalar(1 + ((t * 0.6 + s.i * 0.3) % 1) * 0.4);
  }
  lampFlash = Math.max(0, lampFlash - dt * 1.5);
  const lit = state.mode === 'finale' ? smoothstep(1.2, 3.5, state.finaleT) : state.mode === 'won' ? 1 : 0;
  const ember = 0.12 + (state.found / 7) * 0.45 + Math.sin(t * 7) * 0.03 + lampFlash * 0.8;
  lampGlow.userData.u.uOpacity.value = Math.max(ember, lit * 1.1);
  lampGlow.userData.u.uSize.value = 9 + state.found * 1.2 + lampFlash * 10 + lit * 16;
  beamGroup.rotation.y = t * 0.45;
  beams.forEach((b) => {
    b.userData.u.uPower.value = lit * 1.1;
    b.userData.u.uTime.value = t;
  });
  lampLight.intensity = lit * 160 + lampFlash * 40 + state.found * 3;
  world.setLamp(ember * 0.8 + lit * 4);
  sea.uniforms.uBeamPower.value = lit;
  sea.uniforms.uBeamPos.value.copy(lamp);
  sea.uniforms.uBeamDir.value.set(-Math.sin(beamGroup.rotation.y), -Math.cos(beamGroup.rotation.y));
  const ready = state.found === 7 && state.mode === 'playing';
  finaleRing.material.opacity = damp(finaleRing.material.opacity, ready ? 0.85 : 0, 3, dt);
  finaleRing.scale.setScalar(1 + Math.sin(t * 3.6) * 0.08);
  finaleRing.position.y = 0.4 + waveHeight(FINALE.x, FINALE.z, t);
  finalePillar.visible = ready;
  finalePillar.userData.u.uTime.value = t;
  finaleLabel.visible = ready;
  finaleLabel.position.y = 7 + Math.sin(t * 1.6) * 0.3;
  lantern.userData.u.uOpacity.value = 0.25 + atmo.env.night * 0.9 + atmo.env.progress * 0.2;
  if (state.mode === 'finale' || state.mode === 'won') {
    if (Math.random() < (state.mode === 'finale' ? 0.5 : 0.08)) {
      const a = Math.random() * PI2,
        r = 20 + Math.random() * 70;
      burst(
        lamp.x + Math.cos(a) * r,
        18 + Math.random() * 25,
        lamp.z + 30 + Math.sin(a) * r * 0.6,
        Math.random() < 0.5 ? 0xffd27a : 0xfff1d0,
        26,
      );
    }
  }
}

const clock = { t: 0, last: performance.now(), hudT: 0, mapT: 0, perfT: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = now - clock.last;
  clock.last = now;
  const dt = Math.min(0.05, Math.max(0, realDt / 1000));
  clock.t += dt;
  const t = clock.t;

  if (state.mode === 'playing') gameStep(dt, t);
  else input.poll();
  if (state.mode === 'finale') {
    state.finaleT += dt;
    boat.step(dt, { throttle: 0, steer: 0, boost: false }, mods, colliders);
    if (state.finaleT > 6.5) win();
  }
  ui.tickDialogue(dt);

  const progress = state.found / 7;
  const night = state.mode === 'finale' ? smoothstep(0.5, 4, state.finaleT) : state.mode === 'won' ? 1 : 0;
  atmo.update(dt, t, progress, night, boat.pos);
  scene.fog.density *= mods.fogMult * (1 + smoothstep(0, 14, boat.fogPush) * 2.5);
  for (const k of ['deep', 'mid', 'shallow'])
    sea.uniforms['u' + k[0].toUpperCase() + k.slice(1)].value.copy(atmo.env[k]);
  sea.uniforms.uTime.value = t;
  sea.uniforms.uSunDir.value.copy(atmo.env.sunDir);
  sea.uniforms.uSunColor.value.copy(atmo.env.sunColor).multiplyScalar(Math.max(0.15, atmo.sun.intensity / 2));
  sea.uniforms.uSkyTop.value.copy(atmo.env.top);
  sea.uniforms.uSkyHorizon.value.copy(atmo.env.horizon);
  sea.uniforms.uFogColor.value.copy(scene.fog.color);
  sea.uniforms.uFogDensity.value = scene.fog.density;
  world.update(t, atmo.env.night + atmo.env.progress * 0.25);

  updateVisuals(dt, t);
  updateCamera(dt, t);
  sea.follow(camera);
  atmo.follow(camera);
  audio.update(dt, {
    speed: boat.speed,
    boosting: boat.boosting,
    progress,
    playing: state.mode === 'playing' || state.mode === 'won',
    song: state.song,
  });

  clock.hudT += dt;
  clock.mapT += dt;
  ui.boost(boat.stamina, boat.boosting, mods.boostCapacity > 1);
  if (clock.hudT > 0.08 || hudDirty) {
    clock.hudT = 0;
    hudDirty = false;
    ui.hud({
      found: state.found,
      elapsed: state.elapsed,
      speed: boat.speed,
      heading: boat.heading,
      quests: quests.log(),
      song: state.song,
      fogPush: boat.fogPush,
    });
    ui.drawCompass(boat.heading, compassTargets());
  }
  if (clock.mapT > 0.07) {
    clock.mapT = 0;
    ui.drawMap(t, mapData());
  }

  renderer.render(scene, camera);
  quality.sample(realDt, state.mode === 'playing');
  if (state.perf && (clock.perfT += dt) > 0.5) {
    clock.perfT = 0;
    const i = renderer.info;
    $('perf').textContent =
      `${quality.fps.toFixed(0)} fps · ${i.render.calls} draw calls · ${(i.render.triangles / 1000).toFixed(0)}k tris · ${quality.current.label}${quality.mode === 'auto' ? ' (auto)' : ''}`;
  }
}
function knownSparks() {
  return sparks.filter(
    (s) => !s.collected && (mods.revealSparks || Math.hypot(s.x - boat.pos.x, s.z - boat.pos.z) < 95),
  );
}
function compassTargets() {
  const out = [];
  if (state.found === 7) out.push({ x: FINALE.x - boat.pos.x, z: FINALE.z - boat.pos.z, color: '#ff9a7a' });
  const list = knownSparks()
    .sort((a, b) => Math.hypot(a.x - boat.pos.x, a.z - boat.pos.z) - Math.hypot(b.x - boat.pos.x, b.z - boat.pos.z))
    .slice(0, 3);
  for (const s of list) out.push({ x: s.x - boat.pos.x, z: s.z - boat.pos.z, color: '#ffd98f' });
  for (const m of quests.markers())
    if (m.kind !== 'npc')
      out.push({ x: m.x - boat.pos.x, z: m.z - boat.pos.z, color: m.kind === 'herb' ? '#9cff7a' : '#ffd27a' });
  return out;
}
function mapData() {
  return {
    x: boat.pos.x,
    z: boat.pos.z,
    heading: boat.heading,
    found: state.found,
    faro: { x: lamp.x, z: lamp.z },
    finale: FINALE,
    windHeading: mods.windHeading,
    sparks: knownSparks(),
    markers: quests.markers(),
  };
}

resetGame();
state.mode = 'intro';
requestAnimationFrame((n) => {
  clock.last = n;
  frame(n);
});
await Promise.race([modelsReady, new Promise((r) => setTimeout(r, 6000))]);
renderer.compile(scene, camera);
$('startBtn').disabled = false;
$('startBtn').querySelector('.btn-label').textContent = 'Zarpar';
document.body.classList.add('ready');
console.info(
  `BRÉTEMA listo en ${performance.now().toFixed(0)} ms · calidade ${quality.current.label} · ${ISLANDS.length} illas`,
);
window.__bretema = { boat, state, quests, mods, renderer, scene, camera, quality };
