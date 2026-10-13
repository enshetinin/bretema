import * as THREE from 'three';
import { Builder, clamp, lerp, damp, smoothstep, angleDiff } from './util.js';
import { heightAt, seaward, waveHeight, waveDamp, WORLD } from './terrain.js';
import { COL } from './world.js';

function hullGeometry() {
  const S = 14,
    pos = [],
    col = [];
  const bottom = new THREE.Color(0x6b2a22),
    body = new THREE.Color(0x245a7a),
    band = new THREE.Color(0xeee6d2),
    stripe = new THREE.Color(0xc0432f);
  const section = (t) => {
    const z = lerp(-3.3, 2.6, t);
    const w = 1.32 * (1 - Math.pow(1 - t, 2.1)) * (1 - 0.28 * smoothstep(0.75, 1, t));
    const sheer = 0.62 + 0.95 * Math.pow(1 - t, 3.2) + 0.18 * t;
    const keel = -0.58 * (1 - 0.65 * Math.pow(1 - t, 4));
    return [
      [0, keel, z],
      [w * 0.78, keel * 0.5, z],
      [w, 0.12, z],
      [w * 0.97, sheer * 0.55, z],
      [w * 0.94, sheer, z],
    ];
  };
  const segCol = [bottom, body, body, band];
  const quad = (a, b, c, d, color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < S; i++) {
    const A = section(i / S),
      B = section((i + 1) / S);
    for (let k = 0; k < 4; k++) {
      const c = k === 2 && i > 1 && i < S - 1 ? stripe : segCol[k];
      quad(A[k], B[k], B[k + 1], A[k + 1], c);
      const m = (p) => [-p[0], p[1], p[2]];
      quad(m(A[k + 1]), m(B[k + 1]), m(B[k]), m(A[k]), c);
    }
  }
  const T = section(1);
  for (let k = 0; k < 4; k++) {
    const m = (p) => [-p[0], p[1], p[2]];
    quad(T[k], T[k + 1], m(T[k + 1]), m(T[k]), band);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const SAIL_U = 10,
  SAIL_V = 10;
const SAIL_CORNERS = { tack: [0, 1.05, -1.55], clew: [0, 1.15, 1.9], peak: [0, 5.9, 1.55], throat: [0, 4.5, -1.15] };

export class Boat {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);
    const hull = new THREE.Mesh(
      hullGeometry(),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.75,
        side: THREE.DoubleSide,
      }),
    );
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.body.add(hull);
    this.fallback = [hull];
    const b = new Builder(3);
    b.box(1.9, 0.08, 4.6, COL.woodLight, 0, -0.1, 0.2);
    for (const z of [-1.2, 0.4, 1.7]) b.box(2.25, 0.1, 0.45, COL.wood, 0, 0.38, z);
    b.box(0.12, 1.25, 0.12, COL.woodDark, 0, 1.25, -3.25);
    b.box(0.1, 0.9, 0.7, COL.woodDark, 0, -0.1, 2.75);
    b.box(0.08, 0.08, 1.3, COL.woodDark, 0, 0.75, 2.4);
    b.cyl(0.06, 0.085, 6, COL.woodDark, 0, 3, -1.1, 6);
    b.box(0.5, 0.32, 0.5, 0x3a2e24, 0, 0.75, 1.9);
    b.box(0.9, 0.35, 0.6, 0x8a6a3f, -0.4, 0.12, -0.5);
    b.box(0.55, 0.28, 0.55, 0x5d7f8e, 0.45, 0.1, 0.9);
    const fittings = b.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
    this.body.add(fittings);
    this.fallback.push(fittings);
    this.lanternPos = new THREE.Vector3(0, 1.15, 1.9);
    const lantern = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.17, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd38a, toneMapped: false }),
    );
    lantern.position.copy(this.lanternPos);
    this.body.add(lantern);
    this.fallback.push(lantern);

    this.sailPivot = new THREE.Group();
    this.sailPivot.position.set(0, 0, -1.1);
    this.body.add(this.sailPivot);
    const sg = new THREE.PlaneGeometry(1, 1, SAIL_U, SAIL_V);
    this.sailGeo = sg;
    this.sailBase = [];
    const p = sg.attributes.position;
    const L = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5,
        v = p.getY(i) + 0.5;
      const bottom = L(SAIL_CORNERS.tack, SAIL_CORNERS.clew, u),
        top = L(SAIL_CORNERS.throat, SAIL_CORNERS.peak, u);
      const q = L(bottom, top, v);
      q[2] += 1.1;
      this.sailBase.push({ u, v, x: q[0], y: q[1], z: q[2] });
      p.setXYZ(i, q[0], q[1], q[2]);
    }
    this.sail = new THREE.Mesh(
      sg,
      new THREE.MeshStandardMaterial({ color: 0xd9b27c, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }),
    );
    this.sail.castShadow = true;
    this.sailPivot.add(this.sail);
    const yb = new Builder(4);
    const th = SAIL_CORNERS.throat,
      pk = SAIL_CORNERS.peak,
      len = Math.hypot(pk[1] - th[1], pk[2] - th[2]);
    yb.box(
      0.09,
      0.09,
      len + 0.4,
      COL.woodDark,
      0,
      (th[1] + pk[1]) / 2,
      (th[2] + pk[2]) / 2 + 1.1,
      0,
      -Math.atan2(pk[1] - th[1], pk[2] - th[2]),
    );
    const yard = yb.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
    this.sailPivot.add(yard);
    this.fallback.push(yard);
    this.flag = new THREE.Group();
    this.flag.position.set(0, 6, -1.1);
    this.body.add(this.flag);
    const fb = new Builder(8);
    fb.box(0.02, 0.42, 0.7, 0xf5f2ea, 0, 0, 0.35, 0, 0, 0);
    fb.box(0.03, 0.1, 0.78, 0x6cb4e4, 0, 0, 0.35, 0, -0.5, 0);
    this.flag.add(
      fb.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }), { cast: false }),
    );

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.bow = new THREE.Vector3();
    this.stern = new THREE.Vector3();
    this._n = { x: 0, z: 0 };
    this.reset(0, 111, 0);
  }
  attachModel(root) {
    const hull = root.getObjectByName('Hull'),
      yard = root.getObjectByName('Yard'),
      sail = root.getObjectByName('Sail');
    if (!hull || !yard || !sail) return false;
    for (const m of this.fallback) m.visible = false;
    this.body.add(hull);
    yard.position.z += 1.1;
    this.sailPivot.add(yard);
    const sailMat = sail.material;
    sailMat.side = THREE.DoubleSide;
    sailMat.shadowSide = THREE.DoubleSide;
    this.sail.material.dispose();
    this.sail.material = sailMat;
    return true;
  }
  reset(x, z, h) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0);
    this.heading = h;
    this.yawRate = 0;
    this.rudder = 0;
    this.throttle = 0;
    this.stamina = 1;
    this.boosting = false;
    this.regenDelay = 0;
    this.speed = 0;
    this.forwardSpeed = 0;
    this.pitch = 0;
    this.roll = 0;
    this.heave = 0;
    this.accel = 0;
    this.sailBillow = 0;
    this.sailAngle = 0.4;
    this.fogPush = 0;
  }
  get fwdX() {
    return Math.sin(this.heading);
  }
  get fwdZ() {
    return -Math.cos(this.heading);
  }

  step(dt, input, mods, colliders) {
    const fx = this.fwdX,
      fz = this.fwdZ,
      rx = Math.cos(this.heading),
      rz = Math.sin(this.heading);
    let vf = this.vel.x * fx + this.vel.y * fz,
      vr = this.vel.x * rx + this.vel.y * rz;
    const prevVf = vf;
    this.throttle = damp(this.throttle, input.throttle, input.throttle > this.throttle ? 2.2 : 3.5, dt);
    const wantBoost = input.boost && input.throttle > 0 && this.stamina > 0.02;
    if (wantBoost) {
      this.stamina = Math.max(0, this.stamina - (dt * 0.3) / mods.boostCapacity);
      this.regenDelay = 0.6;
    } else {
      this.regenDelay -= dt;
      if (this.regenDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * 0.14 * mods.boostRegen);
    }
    this.boosting = wantBoost;
    const windFactor = 1 + 0.1 * Math.cos(angleDiff(this.heading, mods.windHeading));
    let thrust = this.throttle > 0 ? this.throttle * 13 * mods.speed * windFactor : this.throttle * 6;
    if (this.boosting) thrust += 17 * mods.speed;
    vf += (thrust - 0.33 * vf - 0.042 * vf * Math.abs(vf)) * dt;
    vr *= Math.exp(-3.1 * dt);
    if (Math.abs(vf) < 0.03 && Math.abs(input.throttle) < 0.01) vf = 0;
    this.rudder = damp(this.rudder, input.steer, 6, dt);
    const sf = clamp(Math.abs(vf) / 8, 0, 1);
    const turnRate = (0.32 + 0.78 * sf) * (1 - 0.22 * clamp((Math.abs(vf) - 14) / 8, 0, 1));
    const dir = vf >= -0.3 ? 1 : -1;
    this.yawRate = damp(this.yawRate, this.rudder * turnRate * dir, 3.2, dt);
    vf -= Math.abs(this.rudder) * vf * 0.12 * dt;
    this.vel.set(fx * vf + rx * vr, fz * vf + rz * vr);
    this.heading += this.yawRate * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.accel = damp(this.accel, (vf - prevVf) / Math.max(dt, 1e-4), 6, dt);

    let impact = 0;
    const samples = [
      [0, 0],
      [2.6, 0],
      [-2.2, 0],
      [0.6, 1.1],
      [0.6, -1.1],
    ];
    const hits = () => {
      for (const [f, r] of samples)
        if (heightAt(this.pos.x + fx * f + rx * r, this.pos.z + fz * f + rz * r) > -0.65) return true;
      return false;
    };
    if (hits()) {
      const n = seaward(this.pos.x + fx * 1.2, this.pos.z + fz * 1.2, this._n);
      for (let i = 0; i < 20 && hits(); i++) {
        this.pos.x += n.x * 0.2;
        this.pos.z += n.z * 0.2;
      }
      impact = Math.max(impact, this.reflect(n.x, n.z, 0.25));
    }
    for (const c of colliders) {
      const dx = this.pos.x - c.x,
        dz = this.pos.z - c.z,
        d = Math.hypot(dx, dz),
        min = c.r + 1.6;
      if (d < min && d > 1e-3) {
        const nx = dx / d,
          nz = dz / d;
        this.pos.x = c.x + nx * min;
        this.pos.z = c.z + nz * min;
        impact = Math.max(impact, this.reflect(nx, nz, 0.3));
      }
    }
    const B = WORLD.bound,
      ex = Math.max(0, Math.abs(this.pos.x) - B),
      ez = Math.max(0, Math.abs(this.pos.z) - B);
    this.fogPush = Math.max(ex, ez);
    if (ex > 0) this.vel.x -= Math.sign(this.pos.x) * ex * 3 * dt;
    if (ez > 0) this.vel.y -= Math.sign(this.pos.z) * ez * 3 * dt;
    this.pos.x = clamp(this.pos.x, -B - 14, B + 14);
    this.pos.z = clamp(this.pos.z, -B - 14, B + 14);

    this.forwardSpeed = this.vel.x * this.fwdX + this.vel.y * this.fwdZ;
    this.speed = this.vel.length();
    return impact;
  }
  reflect(nx, nz, e) {
    const vn = this.vel.x * nx + this.vel.y * nz;
    if (vn >= 0) return 0;
    this.vel.x -= (1 + e) * vn * nx;
    this.vel.y -= (1 + e) * vn * nz;
    this.vel.multiplyScalar(0.82);
    this.yawRate *= 0.5;
    return -vn;
  }

  updateVisual(dt, t, windHeading) {
    const fx = this.fwdX,
      fz = this.fwdZ,
      rx = Math.cos(this.heading),
      rz = Math.sin(this.heading);
    const P = this.pos;
    const wd = (x, z) => waveHeight(x, z, t, waveDamp(-heightAt(x, z)));
    const hb = wd(P.x + fx * 2.4, P.z + fz * 2.4),
      hs = wd(P.x - fx * 2.2, P.z - fz * 2.2);
    const hp = wd(P.x - rx * 1.2, P.z - rz * 1.2),
      hst = wd(P.x + rx * 1.2, P.z + rz * 1.2);
    const avg = (hb + hs + hp + hst) / 4;
    const heel = clamp(this.yawRate * this.forwardSpeed * 0.028, -0.24, 0.24);
    const tPitch =
      Math.atan2(hb - hs, 4.6) + clamp(this.accel * 0.012, -0.08, 0.1) + clamp(this.forwardSpeed * 0.004, 0, 0.06);
    const tRoll = Math.atan2(hst - hp, 2.4) + heel;
    this.pitch = damp(this.pitch, tPitch, 5, dt);
    this.roll = damp(this.roll, tRoll, 4, dt);
    this.heave = damp(this.heave, avg, 7, dt);
    this.root.position.set(P.x, this.heave + 0.2, P.z);
    this.root.rotation.set(0, -this.heading, 0);
    this.body.rotation.set(this.pitch, 0, this.roll, 'YXZ');

    const rel = angleDiff(this.heading, windHeading);
    const side = Math.sin(rel) >= 0 ? 1 : -1;
    const open = lerp(0.12, 0.95, (1 + Math.cos(rel)) / 2);
    this.sailAngle = damp(this.sailAngle, side * open + this.yawRate * 0.15, 2.2, dt);
    this.sailPivot.rotation.y = this.sailAngle;
    const luff = smoothstep(2.5, 3.0, Math.abs(rel));
    const billowT = (0.25 + 0.5 * clamp(this.throttle, 0, 1) + (this.boosting ? 0.35 : 0)) * (1 - luff * 0.7);
    this.sailBillow = damp(this.sailBillow, billowT, 3, dt);
    const p = this.sailGeo.attributes.position;
    for (let i = 0; i < this.sailBase.length; i++) {
      const s = this.sailBase[i],
        shape = Math.sin(Math.PI * s.u) * Math.sin(Math.PI * Math.min(1, s.v * 1.1));
      const flutter = luff * Math.sin(t * 17 + s.u * 9 + s.v * 4) * 0.12 * s.u;
      p.setX(i, side * (shape * this.sailBillow * 1.1 + flutter));
    }
    p.needsUpdate = true;
    this.sailGeo.computeVertexNormals();
    this.flag.rotation.y = Math.PI - angleDiff(this.heading, windHeading) + Math.sin(t * 9) * 0.18;
    this.bow.set(P.x + fx * 3.1, this.heave, P.z + fz * 3.1);
    this.stern.set(P.x - fx * 2.6, this.heave, P.z - fz * 2.6);
  }
}
