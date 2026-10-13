import * as THREE from 'three';
import { Builder, PI2, clamp } from './util.js';
import { heightAt, waveHeight } from './terrain.js';
import { COL } from './world.js';
import { glowSprite, labelSprite } from './fx.js';

const SKIN = 0xd8ae8a;

function meigaModel(b) {
  b.cone(0.95, 2.1, 0x2a2733, 0, 1.05, 0, 9);
  b.cone(0.75, 1.1, 0x6b2f2b, 0, 2.15, 0, 8);
  b.ico(0.36, SKIN, 0, 2.95, 0, 1, 1.1, 1);
  b.cone(0.46, 0.55, 0x1c1c22, 0, 3.15, 0.04, 8);
  b.box(0.1, 2.6, 0.1, COL.woodDark, 0.75, 1.3, -0.2);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI2;
    b.dodeca(0.3, COL.graniteDark, Math.cos(a) * 0.7 - 1.6, 0.15, Math.sin(a) * 0.7 - 0.4);
  }
  b.cyl(0.55, 0.4, 0.6, 0x1d1f22, -1.6, 0.65, -0.4, 10);
}
function mouroModel(b) {
  b.cone(1.25, 3.6, 0x3d4a45, 0, 1.8, 0, 7);
  b.box(1.6, 0.9, 0.9, 0x4a5852, 0, 3.4, 0);
  b.ico(0.55, 0x8d958c, 0, 4.25, 0, 1, 1.15, 1);
  b.cone(0.7, 0.9, 0x2f3936, 0, 4.85, 0, 6);
  b.box(3.4, 0.2, 0.2, COL.gold, 0, 3.6, -0.4, 0, 0, 0);
  b.dodeca(0.45, 0xe8c25a, 1.6, 3.5, -0.4);
  b.dodeca(0.35, 0xe8c25a, -1.6, 3.5, -0.4);
}
function sereiaModel(b) {
  b.dodeca(1.9, COL.graniteDark, 0, -0.2, 0, 1.4, 0.9, 1.2);
  b.cone(0.42, 2.1, 0x2b8c86, 0.7, 1.4, 0.1, 7, 0);
  b.box(1.1, 0.1, 0.7, 0x3fb0a4, 1.75, 0.85, 0.1, 0.4);
  b.cyl(0.32, 0.4, 1.1, SKIN, -0.1, 2.1, 0, 7);
  b.ico(0.32, SKIN, -0.1, 2.95, 0);
  b.cone(0.42, 1.6, 0x8a3c22, -0.15, 2.45, 0.2, 7);
}
function herbModel(b) {
  b.cyl(0.7, 0.8, 0.25, COL.woodLight, 0, 0, 0, 8);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI2;
    b.cone(0.12, 1.2, i % 2 ? 0x5f9a45 : 0x4a7f38, Math.cos(a) * 0.2, 0.7, Math.sin(a) * 0.2, 5);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI2 + 0.3;
    b.ico(0.14, i % 2 ? 0xf3d23d : 0xfaf3e6, Math.cos(a) * 0.3, 1.25, Math.sin(a) * 0.3);
  }
  b.box(0.5, 0.12, 0.12, 0xb33b2b, 0, 0.55, 0);
}
function gateModel(b) {
  for (const s of [-1, 1]) {
    b.box(1.4, 9, 1.4, COL.granite, s * 3.8, 1.8, 0);
    b.box(1.7, 0.5, 1.7, COL.graniteLight, s * 3.8, 6.4, 0);
  }
  b.box(9.6, 1.1, 1.6, COL.graniteLight, 0, 7.1, 0);
  b.box(1.1, 0.5, 1.7, COL.lichen, -1.2, 7.7, 0);
  b.box(0.8, 0.4, 1.7, COL.moss, 2.2, 7.6, 0);
}
function shellModel(b) {
  b.dodeca(2.2, COL.graniteDark, 0, -0.6, 0, 1.3, 0.7, 1.1);
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    b.box(0.16, 0.08, 1.1, i % 2 ? 0xf6e6cf : 0xe9c9a4, Math.sin(a) * 0.5, 1.05, 0.1 - Math.cos(a) * 0.5 + 0.5, a);
  }
  b.box(0.5, 0.2, 0.3, 0xe9c9a4, 0, 1, -0.15);
}

export function createQuests(scene, materials, mods, hooks) {
  const group = new THREE.Group();
  scene.add(group);
  const makeMesh = (fn, seed) => {
    const b = new Builder(seed);
    fn(b);
    return b.mesh(materials.solid);
  };
  const colliders = [];

  const npcs = {
    meiga: {
      name: 'A Meiga do Burato',
      talk: 'Falar coa meiga',
      x: 47,
      z: -42,
      ry: Math.PI / 2,
      model: meigaModel,
      col: 0x7fd4ff,
    },
    mouro: {
      name: 'O Mouro do Castro',
      talk: 'Falar co mouro',
      x: -39,
      z: 8,
      ry: -Math.PI / 2,
      model: mouroModel,
      col: 0xffcf6a,
    },
    sereia: {
      name: 'A Sereia de Sálvora',
      talk: 'Falar coa sereia',
      x: 76,
      z: 1,
      ry: Math.PI / 2,
      model: sereiaModel,
      col: 0x8ff0dd,
    },
  };
  for (const id in npcs) {
    const n = npcs[id];
    n.y = heightAt(n.x, n.z);
    n.obj = makeMesh(n.model, id.length * 31);
    n.obj.position.set(n.x, n.y - 0.15, n.z);
    n.obj.rotation.y = n.ry;
    group.add(n.obj);
    n.marker = glowSprite(n.col, 5, 0.9);
    n.marker.position.set(n.x, n.y + (id === 'mouro' ? 7.5 : 5.2), n.z);
    group.add(n.marker);
    n.label = labelSprite(n.name, 'Encontro');
    n.label.position.set(n.x, n.y + (id === 'mouro' ? 9 : 6.8), n.z);
    group.add(n.label);
  }
  const flame = glowSprite(0x4f8dff, 2.2, 0.0);
  group.add(flame);
  {
    const m = npcs.meiga;
    flame.position
      .set(-1.6, 1.15, -0.4)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), m.ry)
      .add(m.obj.position);
  }
  if (npcs.sereia.y < 0.5) npcs.sereia.obj.position.y = 0.2;

  const herbs = [
    [30, -40],
    [92, -62],
    [66, -14],
  ].map(([x, z], i) => {
    const o = makeMesh(herbModel, 50 + i);
    o.position.set(x, 0, z);
    o.visible = false;
    group.add(o);
    const g = glowSprite(0x9cff7a, 4, 0.55);
    g.position.set(x, 1.4, z);
    g.visible = false;
    group.add(g);
    return { x, z, o, g, got: false };
  });
  const C = { x: -52, z: 8 },
    RAD = 28;
  const gates = [0, 1, 2, 3, 4].map((i) => {
    const a = (-i / 5) * PI2,
      x = C.x + Math.cos(a) * RAD,
      z = C.z + Math.sin(a) * RAD;
    const o = makeMesh(gateModel, 70 + i);
    o.position.set(x, -2.5, z);
    o.rotation.y = -a;
    group.add(o);
    for (const s of [-1, 1]) colliders.push({ x: x + Math.cos(a) * 3.8 * s, z: z + Math.sin(a) * 3.8 * s, r: 1.1 });
    const ring = glowSprite(0xffd27a, 7, 0);
    ring.position.set(x, 2.8, z);
    group.add(ring);
    return { x, z, o, ring, passed: false };
  });
  const shell = { x: -110, z: 50 };
  shell.o = makeMesh(shellModel, 91);
  shell.o.position.set(shell.x, 0, shell.z);
  group.add(shell.o);
  shell.g = glowSprite(0xffe9c9, 3.2, 0);
  shell.g.position.set(shell.x, 1.3, shell.z);
  group.add(shell.g);
  colliders.push({ x: shell.x, z: shell.z, r: 2.4 });

  const T = {
    meiga: {
      state: 'available',
      title: 'Herbas de San Xoán',
      offer: [
        'Ai, rapaza, ai, rapaz… a marea levoume as herbas de San Xoán: fiuncho, romeu e sabugueiro, atadas cunha fita vermella.',
        'Sen elas non hai queimada, e sen queimada a brétema non me deixa ver o mar.',
        'Tráemas, as tres. A cambio farei un conxuro que che amosará onde dormen as faíscas.',
      ],
      ready: [
        'Velaí están, aínda cheiran a orballo. Agora, a queimada…',
        'Lume azul, ollos claros: que a brétema se aparte do teu camiño. Na carta xa ves todas as faíscas.',
      ],
      done: ['Vai tranquila, vai tranquilo. Os mouchos e as curuxas xa saben o teu nome.'],
    },
    mouro: {
      state: 'available',
      title: 'A proba dos aros',
      offer: [
        'Hai mil invernos que gardo o ouro deste castro. Ningún mariñeiro mo pediu con educación.',
        'Cinco arcos de pedra rodean a miña illa. Crúzaos todos, na súa orde, antes de que se apague a miña candea.',
        'O tempo comeza cando pases o primeiro arco. Se o consegues, o ouro dos mouros darache folgos novos.',
      ],
      ready: ['Rápido coma o nordés! Leva este torque de ouro: o teu refacho durará máis e volverá antes.'],
      done: ['O ouro está ben contigo. Non llo contes aos veciños.'],
      fail: ['A candea apagouse. Volve falar comigo cando queiras tentalo outra vez.'],
    },
    sereia: {
      state: 'available',
      title: 'A cuncha da sereia',
      offer: [
        'Mariño, mariña… perdín a miña cuncha de vieira na brétema, alá polo poñente.',
        'Ela aínda canta. Se apagas o ruído do mar e escoitas, guiarate ata ela.',
        'Devólvema e pedireille ao vento que sopre sempre ás túas costas.',
      ],
      ready: ['A miña cuncha! Canta coma o primeiro día.', 'Desde hoxe o vento da sereia empuxa a túa vela.'],
      done: ['Cando oias cantar o mar, son eu dándoche as grazas.'],
    },
  };

  let trial = { running: false, time: 0, next: 0, limit: 45 };
  const LIMIT = 45;
  function talk(id) {
    const q = T[id],
      n = npcs[id];
    if (q.state === 'available') {
      hooks.dialogue(n.name, q.offer, () => {
        q.state = 'active';
        activate(id);
        hooks.questUpdate();
      });
    } else if (q.state === 'ready') {
      hooks.dialogue(n.name, q.ready, () => {
        q.state = 'done';
        reward(id);
        hooks.questUpdate();
      });
    } else if (q.state === 'done') hooks.dialogue(n.name, q.done);
    else if (id === 'mouro' && trial.failed) {
      trial.failed = false;
      hooks.dialogue(n.name, q.fail);
    } else hooks.dialogue(n.name, [hint(id)]);
  }
  function hint(id) {
    if (id === 'meiga')
      return `Aínda faltan ${herbs.filter((h) => !h.got).length} ramos. Búscaos onde brilla o verde sobre a auga.`;
    if (id === 'mouro') return 'Os arcos agardan. O primeiro está ao nacente da illa.';
    return 'Escoita… o canto vén do poñente, entre a brétema.';
  }
  function activate(id) {
    hooks.sound('quest');
    if (id === 'meiga') {
      herbs.forEach((h) => {
        h.o.visible = h.g.visible = true;
      });
      hooks.toast('Busca os tres ramos de herbas', '❦');
    }
    if (id === 'mouro') {
      trial = { running: false, time: 0, next: 0, limit: LIMIT };
      hooks.toast('Cruza o primeiro arco de pedra', '◠');
    }
    if (id === 'sereia') hooks.toast('Escoita o canto entre a brétema', '♪');
  }
  function reward(id) {
    hooks.sound('quest');
    if (id === 'meiga') {
      mods.revealSparks = true;
      mods.fogMult = 0.72;
      flamePulse = 4;
      hooks.sound('queimada');
      hooks.toast('Conxuro: as faíscas aparecen na carta', '✶');
    }
    if (id === 'mouro') {
      mods.boostCapacity = 1.7;
      mods.boostRegen = 1.6;
      hooks.toast('Ouro dos mouros: refacho mellorado', '◉');
    }
    if (id === 'sereia') {
      mods.speed = 1.12;
      mods.sirenWind = true;
      hooks.toast('Vento da sereia: navegas máis rápido', '≈');
    }
  }
  let flamePulse = 0;

  function update(dt, t, boat, playing) {
    const bx = boat.pos.x,
      bz = boat.pos.z;
    let prompt = null,
      song = 0;
    for (const id in npcs) {
      const n = npcs[id],
        q = T[id],
        d = Math.hypot(bx - n.x, bz - n.z);
      const show = q.state === 'available' || q.state === 'ready';
      n.marker.visible = show;
      n.marker.userData.u.uOpacity.value = 0.6 + Math.sin(t * 3) * 0.25;
      n.marker.position.y = n.y + (id === 'mouro' ? 7.5 : 5.2) + Math.sin(t * 2 + n.x) * 0.3;
      n.label.material.opacity =
        q.state === 'done' ? 0 : Math.min(1, Math.max(0, (d - 15) / 7)) * (1 - Math.min(1, Math.max(0, (d - 90) / 25)));
      n.label.visible = n.label.material.opacity > 0.01;
      if (d < 15) prompt = { id, label: n.talk };
    }
    flamePulse = Math.max(0, flamePulse - dt);
    flame.userData.u.uOpacity.value = T.meiga.state === 'done' ? 0.5 + Math.sin(t * 13) * 0.12 + flamePulse * 0.4 : 0.0;
    flame.userData.u.uSize.value = 2.2 + flamePulse * 1.5;
    if (T.meiga.state === 'done' || flamePulse > 0) hooks.emitFlame(flame.position, flamePulse);

    if (T.meiga.state === 'active') {
      for (const h of herbs) {
        if (h.got) continue;
        const y = waveHeight(h.x, h.z, t) + 0.25;
        h.o.position.y = y;
        h.o.rotation.y = t * 0.4;
        h.g.position.y = y + 1.3;
        if (Math.hypot(bx - h.x, bz - h.z) < 4.5) {
          h.got = true;
          h.o.visible = h.g.visible = false;
          hooks.burst(h.x, y + 1, h.z, 0x9cff7a);
          const left = herbs.filter((x) => !x.got).length;
          hooks.sound('collectSmall');
          hooks.toast(left ? `Ramo de herbas, faltan ${left}` : 'Volve onde a meiga de Ons', '❦');
          if (!left) T.meiga.state = 'ready';
          hooks.questUpdate();
        }
      }
    }
    if (T.mouro.state === 'active') {
      gates.forEach((g, i) => {
        const isNext = i === trial.next;
        g.ring.userData.u.uOpacity.value = isNext
          ? 0.75 + Math.sin(t * 5) * 0.2
          : g.passed
            ? 0.12
            : trial.running
              ? 0.05
              : 0;
        g.ring.userData.u.uSize.value = isNext ? 7.5 + Math.sin(t * 5) : 6;
      });
      const g = gates[trial.next];
      if (Math.hypot(bx - g.x, bz - g.z) < 5.2) {
        g.passed = true;
        hooks.sound('ring', trial.next);
        hooks.burst(g.x, 3, g.z, 0xffd27a);
        if (trial.next === 0) {
          trial.running = true;
          trial.time = 0;
        }
        trial.next++;
        if (trial.next >= gates.length) {
          trial.running = false;
          T.mouro.state = 'ready';
          gates.forEach((x) => (x.ring.userData.u.uOpacity.value = 0));
          hooks.toast('Volve onde o mouro do castro', '◉');
        } else hooks.toast(`Arco ${trial.next}/5`, '◠');
        hooks.questUpdate();
      }
      if (trial.running && playing) {
        trial.time += dt;
        if (trial.time > trial.limit) {
          trial = { running: false, time: 0, next: 0, limit: LIMIT, failed: true };
          gates.forEach((x) => (x.passed = false));
          hooks.sound('fail');
          hooks.toast('A candea do mouro apagouse', '◌');
          hooks.questUpdate();
        }
      }
    } else gates.forEach((g) => (g.ring.userData.u.uOpacity.value = 0));
    const ds = Math.hypot(bx - shell.x, bz - shell.z);
    if (T.sereia.state === 'active') {
      song = clamp(1 - ds / 120, 0, 1);
      shell.g.userData.u.uOpacity.value = clamp(1 - ds / 40, 0, 1) * (0.7 + Math.sin(t * 4) * 0.3);
      if (ds < 6.5) {
        T.sereia.state = 'ready';
        hooks.burst(shell.x, 1.5, shell.z, 0xffe9c9);
        hooks.sound('collectSmall');
        hooks.toast('Atopaches a cuncha! Volve a Sálvora', '♪');
        hooks.questUpdate();
      }
    } else shell.g.userData.u.uOpacity.value = 0;
    shell.o.visible = T.sereia.state === 'active' || ds < 60;
    return { prompt, song };
  }
  function log() {
    const out = [];
    for (const id of ['meiga', 'mouro', 'sereia']) {
      const q = T[id];
      if (q.state === 'available') continue;
      let detail = '';
      if (q.state === 'active') {
        if (id === 'meiga') detail = `${herbs.filter((h) => h.got).length}/3 ramos`;
        if (id === 'mouro')
          detail = trial.running
            ? `arco ${trial.next + 1}/5, ${Math.max(0, Math.ceil(trial.limit - trial.time))} s`
            : 'cruza o primeiro arco';
        if (id === 'sereia') detail = 'segue o canto';
      } else if (q.state === 'ready') detail = 'volve e fala';
      else detail = 'feito';
      out.push({ id, title: q.title, detail, done: q.state === 'done' });
    }
    return out;
  }
  function markers() {
    const out = [];
    for (const id in npcs) {
      const s = T[id].state;
      if (s === 'available' || s === 'ready')
        out.push({ x: npcs[id].x, z: npcs[id].z, kind: 'npc', ready: s === 'ready' });
    }
    if (T.meiga.state === 'active') herbs.forEach((h) => !h.got && out.push({ x: h.x, z: h.z, kind: 'herb' }));
    if (T.mouro.state === 'active' && trial.next < gates.length)
      out.push({ x: gates[trial.next].x, z: gates[trial.next].z, kind: 'gate' });
    return out;
  }
  function reset() {
    for (const id in T) T[id].state = 'available';
    herbs.forEach((h) => {
      h.got = false;
      h.o.visible = h.g.visible = false;
    });
    gates.forEach((g) => (g.passed = false));
    trial = { running: false, time: 0, next: 0, limit: LIMIT };
    flamePulse = 0;
  }
  const doneCount = () => Object.values(T).filter((q) => q.state === 'done').length;
  return { update, talk, log, markers, reset, colliders, doneCount, npcs };
}
