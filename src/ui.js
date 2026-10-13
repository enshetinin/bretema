import { PI2, fmtTime, clamp } from './util.js';
import { WORLD } from './terrain.js';

const $ = (id) => document.getElementById(id);
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const css = getComputedStyle(document.documentElement);
const T = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
const C = {
  blue: T('--ocean', '#166b91'),
  navy: T('--abyss', '#102f42'),
  b50: T('--ocean-300', '#5fa3c2'),
  b25: T('--ocean-200', '#a9cfdf'),
  b10: T('--ocean-100', '#d6e9f0'),
  mist: T('--mist', '#eaf3f2'),
  moss: T('--moss', '#458d80'),
  beacon: T('--beacon', '#f2b84b'),
  light: T('--beacon', '#f2b84b'),
  magic: T('--moss-300', '#93d1c3'),
  warn: T('--warn', '#f0896b'),
  font: T('--font', 'sans-serif'),
};
const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const TOAST_KIND = {
  '⚓': 'warn',
  '✦': 'light',
  '✹': 'light',
  '❦': 'magic',
  '◉': 'magic',
  '≈': 'magic',
  '♪': 'magic',
  '◠': 'magic',
  '◌': 'warn',
  '✶': 'magic',
  '◇': 'magic',
};
const WATER = /^(Mar|Ría|Canle|Ronsel|Porto das)\b/;
const PORTRAIT = [
  ['Meiga', 'i-meiga'],
  ['Mouro', 'i-mouro'],
  ['Sereia', 'i-sereia'],
];

export function createUI() {
  const el = {};
  for (const id of [
    'missionTitle',
    'missionDesc',
    'missionState',
    'pips',
    'collected',
    'timer',
    'speed',
    'headingText',
    'compassStrip',
    'toast',
    'toastIcon',
    'toastText',
    'boostFill',
    'boostWrap',
    'questLog',
    'questPanel',
    'prompt',
    'promptText',
    'dialogue',
    'dlgName',
    'dlgText',
    'dlgNext',
    'dlgDots',
    'dlgPortrait',
    'minimap',
    'perf',
    'hud',
    'songHint',
    'fogHint',
    'discovery',
    'discName',
    'discIdx',
    'sparkCard',
    'sparkNum',
    'sparkName',
    'placeChip',
    'placeName',
    'placeMeta',
  ])
    el[id] = $(id);
  const pips = [...el.pips.children];

  let toastTimer = 0;
  function toast(text, icon = '✦', ms = 2900) {
    el.toastIcon.textContent = icon;
    el.toastText.textContent = text;
    el.toast.className = 'toast ' + (TOAST_KIND[icon] || '');
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }
  const replay = (node) => {
    node.classList.remove('show');
    void node.offsetWidth;
    node.classList.add('show');
  };
  function discover(name, idx, total) {
    el.discName.textContent = name;
    el.discName.classList.toggle('agua', WATER.test(name));
    el.discIdx.textContent = `${idx} de ${total}`;
    replay(el.discovery);
  }
  function sparkCard(n, name) {
    el.sparkNum.textContent = n;
    el.sparkName.textContent = name;
    el.sparkName.classList.toggle('agua', WATER.test(name));
    replay(el.sparkCard);
  }
  let lastPlace = '';
  function place(name, meta) {
    if (name === lastPlace) return;
    lastPlace = name;
    el.placeName.textContent = name;
    el.placeName.classList.toggle('agua', WATER.test(name));
    el.placeMeta.textContent = meta;
    el.placeChip.classList.remove('swap');
    void el.placeChip.offsetWidth;
    el.placeChip.classList.add('swap');
  }

  let dlg = null;
  function dialogue(name, pages, onClose) {
    dlg = { pages, i: 0, onClose, typed: 0, full: false };
    el.dlgName.textContent = name;
    const p = PORTRAIT.find(([k]) => name.includes(k));
    el.dlgPortrait.firstElementChild.setAttribute('href', '#' + (p ? p[1] : 'i-mark'));
    el.dlgDots.innerHTML = pages.length > 1 ? pages.map(() => '<i></i>').join('') : '';
    el.dialogue.classList.remove('hidden');
    el.dialogue.setAttribute('aria-hidden', 'false');
    showPage();
  }
  function showPage() {
    dlg.typed = 0;
    dlg.full = false;
    el.dlgText.textContent = '';
    el.dlgNext.firstChild.textContent = dlg.i < dlg.pages.length - 1 ? 'Seguir' : 'Pechar';
    [...el.dlgDots.children].forEach((d, i) => d.classList.toggle('on', i === dlg.i));
  }
  function advance() {
    if (!dlg) return false;
    if (!dlg.full) {
      dlg.typed = 1e9;
      return true;
    }
    if (++dlg.i >= dlg.pages.length) {
      const cb = dlg.onClose;
      dlg = null;
      el.dialogue.classList.add('hidden');
      el.dialogue.setAttribute('aria-hidden', 'true');
      cb?.();
      return true;
    }
    showPage();
    return true;
  }
  function tickDialogue(dt) {
    if (!dlg || dlg.full) return;
    const text = dlg.pages[dlg.i];
    dlg.typed += dt * 60;
    const n = Math.min(text.length, Math.floor(dlg.typed));
    el.dlgText.textContent = text.slice(0, n);
    if (n >= text.length) dlg.full = true;
  }
  el.dlgNext.addEventListener('click', () => advance());

  const map = el.minimap,
    mctx = map.getContext('2d');
  const MS = 2,
    SCALE = 0.78 * MS,
    R = 107 * MS,
    CX = 110 * MS,
    CY = 110 * MS;
  map.width = map.height = 220 * MS;
  const base = document.createElement('canvas');
  base.width = base.height = 220 * MS;
  function bakeMap(heights, res) {
    const g = base.getContext('2d'),
      W = base.width,
      img = g.createImageData(W, W),
      d = img.data;
    const hAt = (x, y) => {
      const wx = (x - CX) / SCALE,
        wz = (y - CY) / SCALE;
      const i = Math.floor(((wx - WORLD.min) / WORLD.size) * res),
        j = Math.floor(((wz - WORLD.min) / WORLD.size) * res);
      return i >= 0 && j >= 0 && i < res && j < res ? heights[j * res + i] : -7;
    };
    const H = new Float32Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) H[y * W + x] = hAt(x, y);
    const navy = hex(C.navy),
      blue = hex(C.blue),
      b50 = hex(C.b50),
      moss = hex(C.moss),
      mist = hex(C.mist),
      white = mist,
      deep = mix(navy, [7, 24, 32], 0.35);
    const band = (h, lv) => h - lv;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x,
          h = H[k];
        let c;
        if (h > 0) c = mix(mix(moss, mist, 0.18), mist, clamp(h / 12, 0, 1) * 0.55);
        else if (h > -0.7) c = white;
        else {
          const t = clamp((h + 7) / 6.3, 0, 1);
          c = t < 0.6 ? mix(deep, navy, t / 0.6) : mix(navy, blue, ((t - 0.6) / 0.4) * 0.8);
        }
        const r = x + 1 < W ? H[k + 1] : h,
          dn = y + 1 < W ? H[k + W] : h;
        for (const lv of [-2, -4, 3, 7]) {
          if (Math.sign(band(h, lv)) !== Math.sign(band(r, lv)) || Math.sign(band(h, lv)) !== Math.sign(band(dn, lv)))
            c = lv < 0 ? mix(c, b50, 0.4) : mix(c, navy, 0.28);
        }
        const p = k * 4;
        d[p] = c[0];
        d[p + 1] = c[1];
        d[p + 2] = c[2];
        d[p + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.lineWidth = MS * 0.75;
    for (let i = -120; i <= 120; i += 30) {
      g.beginPath();
      g.moveTo(CX + i * SCALE, 0);
      g.lineTo(CX + i * SCALE, W);
      g.stroke();
      g.beginPath();
      g.moveTo(0, CY + i * SCALE);
      g.lineTo(W, CY + i * SCALE);
      g.stroke();
    }
  }
  function diamond(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y - s);
    g.lineTo(x + s, y);
    g.lineTo(x, y + s);
    g.lineTo(x - s, y);
    g.closePath();
  }
  function drawMap(t, data) {
    const g = mctx;
    g.clearRect(0, 0, map.width, map.height);
    g.save();
    g.beginPath();
    g.arc(CX, CY, R, 0, PI2);
    g.clip();
    g.drawImage(base, 0, 0);
    const P = (x, z) => [CX + x * SCALE, CY + z * SCALE];
    const [fx, fy] = P(data.faro.x, data.faro.z);
    if (data.found === 7) {
      const [x, y] = P(data.finale.x, data.finale.z);
      g.strokeStyle = C.light;
      g.lineWidth = 2 * MS;
      g.beginPath();
      g.arc(x, y, (6 + Math.sin(t * 4) * 2) * MS, 0, PI2);
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.strokeStyle = C.beacon;
    g.lineWidth = 2 * MS;
    g.beginPath();
    g.arc(fx, fy, 3.6 * MS, 0, PI2);
    g.fill();
    g.stroke();
    for (const m of data.markers) {
      const [x, y] = P(m.x, m.z);
      if (m.kind === 'npc') {
        diamond(g, x, y, 4.2 * MS);
        g.lineWidth = 1.6 * MS;
        g.strokeStyle = C.magic;
        g.stroke();
        if (m.ready) {
          g.fillStyle = C.magic;
          g.fill();
        }
      }
      if (m.kind === 'herb') {
        g.fillStyle = C.magic;
        g.beginPath();
        g.arc(x, y, 2.4 * MS, 0, PI2);
        g.fill();
      }
      if (m.kind === 'gate') {
        g.strokeStyle = C.light;
        g.lineWidth = 1.6 * MS;
        g.beginPath();
        g.arc(x, y, (4 + Math.sin(t * 6)) * MS, 0, PI2);
        g.stroke();
      }
    }
    for (const s of data.sparks) {
      const [x, y] = P(s.x, s.z);
      g.shadowColor = C.light;
      g.shadowBlur = 10 * MS;
      g.fillStyle = C.light;
      diamond(g, x, y, (3.6 + Math.sin(t * 3 + s.i) * 0.5) * MS);
      g.fill();
      g.shadowBlur = 0;
    }
    let [px, py] = P(data.x, data.z);
    const dx = px - CX,
      dy = py - CY,
      dl = Math.hypot(dx, dy);
    if (dl > R - 8 * MS) {
      px = CX + (dx / dl) * (R - 8 * MS);
      py = CY + (dy / dl) * (R - 8 * MS);
    }
    g.save();
    g.translate(px, py);
    g.rotate(data.heading);
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, 34 * MS);
    cone.addColorStop(0, 'rgba(255,255,255,.28)');
    cone.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 34 * MS, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.strokeStyle = C.navy;
    g.lineWidth = 1.5 * MS;
    g.beginPath();
    g.moveTo(0, -7 * MS);
    g.lineTo(-4.5 * MS, 5 * MS);
    g.lineTo(0, 2.6 * MS);
    g.lineTo(4.5 * MS, 5 * MS);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 1.2 * MS;
    g.beginPath();
    g.arc(CX, CY, R, 0, PI2);
    g.stroke();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * PI2,
        long = i % 18 === 0,
        l = (long ? 7 : i % 6 === 0 ? 4.5 : 2.5) * MS;
      g.strokeStyle = long ? '#fff' : 'rgba(255,255,255,.4)';
      g.lineWidth = (long ? 1.6 : 0.9) * MS;
      g.beginPath();
      g.moveTo(CX + Math.sin(a) * R, CY - Math.cos(a) * R);
      g.lineTo(CX + Math.sin(a) * (R - l), CY - Math.cos(a) * (R - l));
      g.stroke();
    }
    g.fillStyle = C.blue;
    g.beginPath();
    g.arc(CX, CY - R + 5.5 * MS, 7.5 * MS, 0, PI2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = `700 ${9 * MS}px ${C.font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', CX, CY - R + 5.5 * MS);
    const wa = data.windHeading,
      wr = R - 16 * MS;
    g.save();
    g.translate(CX + Math.sin(wa) * wr, CY - Math.cos(wa) * wr);
    g.rotate(wa);
    g.strokeStyle = C.b25;
    g.lineWidth = 1.4 * MS;
    g.beginPath();
    g.moveTo(0, 6 * MS);
    g.lineTo(0, -6 * MS);
    g.moveTo(-3 * MS, -3 * MS);
    g.lineTo(0, -6 * MS);
    g.lineTo(3 * MS, -3 * MS);
    g.stroke();
    g.restore();
  }

  const cs = el.compassStrip,
    cctx = cs.getContext('2d');
  function sizeCompass() {
    const r = cs.getBoundingClientRect();
    cs.width = Math.max(200, Math.round(r.width * 2));
    cs.height = Math.max(40, Math.round(r.height * 2));
  }
  sizeCompass();
  addEventListener('resize', sizeCompass);
  function drawCompass(heading, targets) {
    const g = cctx,
      W = cs.width,
      H = cs.height,
      span = Math.PI * 0.95,
      px = W / span,
      s = H / 72;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(0, H * 0.62, W, 2);
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * PI2;
      let d = a - heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > span / 2) continue;
      const x = W / 2 + d * px;
      g.globalAlpha = 1 - Math.pow(Math.abs(d) / (span / 2), 2);
      if (k % 9 === 0) {
        const card = k % 18 === 0;
        g.font = `700 ${(card ? 26 : 19) * s}px ${C.font}`;
        g.fillStyle = card ? '#fff' : C.b25;
        g.fillText(CARD[k / 9], x, H * 0.34);
      } else {
        g.fillStyle = 'rgba(255,255,255,.55)';
        const h = k % 3 === 0 ? 12 : 6;
        g.fillRect(x - 1, H * 0.62 - h * s, 2, h * s);
      }
    }
    for (const t of targets) {
      let d = Math.atan2(t.x, -t.z) - heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const edge = Math.abs(d) > span / 2,
        x = W / 2 + clamp(d, -span / 2, span / 2) * px * 0.97,
        y = H * 0.84;
      g.globalAlpha = edge ? 0.7 : 1;
      g.fillStyle = t.color;
      if (edge) {
        const sg = Math.sign(d);
        g.beginPath();
        g.moveTo(x - sg * 6 * s, y - 8 * s);
        g.lineTo(x + sg * 6 * s, y);
        g.lineTo(x - sg * 6 * s, y + 8 * s);
        g.fill();
      } else {
        diamond(g, x, y, 7 * s);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = C.beacon;
    g.fillRect(W / 2 - 1.5 * s, H * 0.5, 3 * s, H * 0.5);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(W / 2 - 8 * s, H * 0.5);
    g.lineTo(W / 2 + 8 * s, H * 0.5);
    g.lineTo(W / 2, H * 0.5 + 10 * s);
    g.fill();
  }

  let lastQuest = '',
    lastFound = -1,
    lastState = '';
  function hud(s) {
    if (s.found !== lastFound) {
      pips.forEach((p, i) => {
        p.classList.toggle('on', i < s.found);
        p.classList.toggle('new', i === s.found - 1 && s.found > lastFound && lastFound >= 0);
      });
      el.collected.textContent = s.found;
      lastFound = s.found;
      $('lightsMeter').setAttribute('aria-label', `${s.found} de 7 faíscas recuperadas`);
    }
    el.timer.textContent = fmtTime(s.elapsed);
    el.speed.textContent = String(Math.round(s.speed * 2.3));
    const deg = ((((s.heading * 180) / Math.PI) % 360) + 360) % 360;
    el.headingText.textContent = `${String(Math.round(deg) % 360).padStart(3, '0')}° ${CARD[Math.round(deg / 45) % 8]}`;
    const st = s.found === 7 ? 'faro' : 'run';
    if (st !== lastState) {
      lastState = st;
      if (st === 'faro') {
        el.missionTitle.textContent = 'Acende o faro de Fisterra';
        el.missionDesc.textContent = 'Navega ata o círculo de luz baixo o cantil.';
        el.missionState.textContent = 'Volve ao faro';
        el.missionState.className = 'chip light';
      } else {
        el.missionTitle.textContent = 'Recupera a luz do Atlántico';
        el.missionDesc.textContent = 'Atopa as sete faíscas entre as illas. Segue as columnas de luz.';
        el.missionState.textContent = 'En curso';
        el.missionState.className = 'chip';
      }
    }
    const q = JSON.stringify(s.quests);
    if (q !== lastQuest) {
      lastQuest = q;
      el.questPanel.classList.toggle('hidden', !s.quests.length);
      el.questLog.innerHTML = s.quests
        .map(
          (x) =>
            `<div class="quest ${x.done ? 'done' : ''} ${x.detail === 'volve e fala' ? 'ready' : ''}"><i class="q-ico"></i><span>${x.title}</span><em>${x.detail}</em></div>`,
        )
        .join('');
    }
    el.songHint.style.opacity = s.song > 0.02 ? String(0.35 + s.song * 0.65) : '0';
    el.songHint.textContent =
      s.song > 0.6 ? '♪ ♪ ♪  o canto está moi preto' : s.song > 0.3 ? '♪ ♪  escoitas un canto' : '♪  un canto afastado';
    el.fogHint.classList.toggle('show', s.fogPush > 2);
  }
  function boost(v, boosting, upgraded) {
    el.boostFill.style.transform = `scaleX(${v})`;
    el.boostWrap.classList.toggle('active', boosting);
    el.boostWrap.classList.toggle('low', v < 0.15);
    el.boostWrap.classList.toggle('gold', upgraded);
  }
  let lastPrompt = null;
  function prompt(p) {
    const label = p ? p.label : null;
    if (label === lastPrompt) return;
    lastPrompt = label;
    if (p) {
      el.promptText.textContent = p.label;
      el.prompt.classList.remove('hidden');
    } else el.prompt.classList.add('hidden');
  }
  function reset() {
    lastFound = -1;
    lastState = '';
    lastPlace = '';
  }
  return {
    toast,
    discover,
    sparkCard,
    place,
    dialogue,
    advance,
    tickDialogue,
    get inDialogue() {
      return !!dlg;
    },
    bakeMap,
    drawMap,
    drawCompass,
    hud,
    boost,
    prompt,
    reset,
    el,
    colors: C,
  };
}
