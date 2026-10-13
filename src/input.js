export function createInput(canvas, handlers) {
  const keys = { up: false, down: false, left: false, right: false, boost: false };
  const touch = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false };
  const map = {
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'boost',
    ShiftLeft: 'boost',
    ShiftRight: 'boost',
  };
  const state = {
    throttle: 0,
    steer: 0,
    boost: false,
    look: 0,
    lookPitch: 0,
    dragging: false,
    lastLookInput: -10,
    usingGamepad: false,
  };

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.matches('select, input')) return;
    if (map[e.code]) {
      e.preventDefault();
      keys[map[e.code]] = true;
    }
    if (e.repeat) return;
    handlers.key?.(e.code, e);
  });
  window.addEventListener('keyup', (e) => {
    if (map[e.code]) {
      e.preventDefault();
      keys[map[e.code]] = false;
    }
  });
  const release = () => {
    for (const k in keys) keys[k] = false;
    for (const k in touch) touch[k] = false;
    document.querySelectorAll('[data-key]').forEach((b) => b.classList.remove('active'));
    state.dragging = false;
  };
  window.addEventListener('blur', release);

  for (const b of document.querySelectorAll('[data-key]')) {
    const key = b.dataset.key;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {}
      touch[key] = true;
      b.classList.add('active');
      handlers.touchStart?.();
    });
    const up = (e) => {
      e.preventDefault();
      touch[key] = false;
      b.classList.remove('active');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', () => {
      touch[key] = false;
      b.classList.remove('active');
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  let px = 0,
    py = 0,
    pid = null;
  canvas.addEventListener('pointerdown', (e) => {
    pid = e.pointerId;
    px = e.clientX;
    py = e.clientY;
    state.dragging = true;
    try {
      canvas.setPointerCapture(pid);
    } catch {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging || e.pointerId !== pid) return;
    state.look -= (e.clientX - px) * 0.006;
    state.lookPitch = Math.max(-0.35, Math.min(0.6, state.lookPitch + (e.clientY - py) * 0.004));
    px = e.clientX;
    py = e.clientY;
    state.lastLookInput = performance.now() / 1000;
  });
  const endDrag = () => {
    state.dragging = false;
    pid = null;
    state.lastLookInput = performance.now() / 1000;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  let padButtons = [];
  function poll() {
    let throttle = (keys.up || touch.ArrowUp ? 1 : 0) - (keys.down || touch.ArrowDown ? 1 : 0);
    let steer = (keys.right || touch.ArrowRight ? 1 : 0) - (keys.left || touch.ArrowLeft ? 1 : 0);
    let boost = keys.boost || touch.Space;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = Math.abs(p.axes[0]) > 0.15 ? p.axes[0] : 0;
      const rt = p.buttons[7]?.value || 0,
        lt = p.buttons[6]?.value || 0;
      const ay = Math.abs(p.axes[1]) > 0.2 ? -p.axes[1] : 0;
      if (ax || rt || lt || ay) state.usingGamepad = true;
      steer = steer || ax;
      throttle = throttle || rt - lt || ay;
      boost = boost || !!p.buttons[0]?.pressed || !!p.buttons[5]?.pressed;
      const rx = Math.abs(p.axes[2]) > 0.2 ? p.axes[2] : 0;
      if (rx) {
        state.look -= rx * 0.04;
        state.lastLookInput = performance.now() / 1000;
      }
      const now = p.buttons.map((b) => b.pressed);
      if (now[2] && !padButtons[2]) handlers.key?.('KeyE');
      if (now[3] && !padButtons[3]) handlers.key?.('KeyE');
      if (now[9] && !padButtons[9]) handlers.key?.('KeyP');
      padButtons = now;
      break;
    }
    state.throttle = Math.max(-1, Math.min(1, throttle));
    state.steer = Math.max(-1, Math.min(1, steer));
    state.boost = boost;
    return state;
  }
  return { poll, release, state };
}
