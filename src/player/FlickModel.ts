import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshToonMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  BoxGeometry,
  ConeGeometry,
} from 'three';
import { HoseLimb } from './HoseLimb';
import { PAL, toon, toonUnique } from '../render/materials';
import { canvas, INK, pieEye, tex } from '../render/textures';
import { clamp, damp, lerp } from '../core/math';
import { bakeDeep } from '../world/kit';

export type Mouth = 'smile' | 'open' | 'o' | 'grit' | 'flat' | 'grin';

export interface FlickPose {
  speed01: number;
  grounded: boolean;
  vy: number;
  dashing: boolean;
  spin: number; // 0..1 progress of double-jump twirl
  talking: boolean;
  shooting: boolean;
  hurt: boolean;
  celebrate: boolean;
  beat: number; // musical beat phase (beats)
  glow: number; // 0..1 how bright the bulb is
}

const BULB = '#fff1b3';

export class FlickModel extends Group {
  private body = new Group(); // squash/stretch pivot at feet
  private hips = new Group();
  private torso = new Group();
  private head: Mesh;
  private headMat: MeshToonMaterial;
  private faceCanvas: HTMLCanvasElement;
  private faceCtx: CanvasRenderingContext2D;
  private faceTex: CanvasTexture;
  private faceKey = '';
  private armL: HoseLimb;
  private armR: HoseLimb;
  private legL: HoseLimb;
  private legR: HoseLimb;
  private handL: Group;
  private handR: Group;
  private footL: Mesh;
  private footR: Mesh;
  readonly light: PointLight;
  private bowMat: MeshToonMaterial;
  readonly muzzle = new Vector3();

  private phase = 0;
  private squash = 0; // spring value, + = stretched, - = squashed
  private squashVel = 0;
  private blinkT = 2;
  private talkT = 0;
  private wasGrounded = true;
  private lean = 0;
  private armLift = 0;

  constructor() {
    super();
    this.add(this.body);
    this.body.add(this.hips);

    const ink = toon(0x2a1f19, { mottle: 0.2 });
    const overalls = toon(PAL.teal, { mottle: 0.4 });
    const shirt = toon(PAL.cream, { mottle: 0.3 });
    const brass = toon(PAL.brass, { gloss: true, mottle: 0.2 });
    const glove = toon(PAL.white, { gloss: true, mottle: 0.1 });
    const shoe = toon(0x6a3a22, { gloss: true, mottle: 0.2 });
    const red = toonUnique(PAL.red, { gloss: true, mottle: 0.2 });
    this.bowMat = red;

    // ---- hips / shorts (overalls)
    const shorts = new Mesh(new SphereGeometry(0.27, 24, 16), overalls);
    shorts.scale.set(1.05, 0.78, 0.92);
    shorts.castShadow = true;
    this.hips.add(shorts);
    this.hips.position.y = 0.62;

    // ---- torso
    this.hips.add(this.torso);
    this.torso.position.y = 0.2;
    const chest = new Mesh(new SphereGeometry(0.23, 24, 16), shirt);
    chest.scale.set(1, 1.08, 0.9);
    chest.castShadow = true;
    this.torso.add(chest);
    const bib = new Mesh(new SphereGeometry(0.235, 24, 16, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), overalls);
    bib.scale.set(1.02, 1.1, 0.94);
    this.torso.add(bib);
    for (const sx of [-1, 1]) {
      const strap = new Mesh(new BoxGeometry(0.06, 0.3, 0.04), overalls);
      strap.position.set(sx * 0.1, 0.08, 0.19);
      strap.rotation.x = -0.35;
      this.torso.add(strap);
      const btn = new Mesh(new SphereGeometry(0.035, 10, 8), brass);
      btn.position.set(sx * 0.1, 0.0, 0.215);
      this.torso.add(btn);
    }
    // bow tie
    for (const sx of [-1, 1]) {
      const wing = new Mesh(new ConeGeometry(0.07, 0.13, 10), red);
      wing.rotation.z = (sx * Math.PI) / 2;
      wing.position.set(sx * 0.065, 0.22, 0.17);
      this.torso.add(wing);
    }
    const knot = new Mesh(new SphereGeometry(0.035, 10, 8), red);
    knot.position.set(0, 0.22, 0.18);
    this.torso.add(knot);

    // ---- neck: brass screw base
    const neck = new Group();
    neck.position.y = 0.27;
    this.torso.add(neck);
    const base = new Mesh(new CylinderGeometry(0.15, 0.12, 0.2, 18), brass);
    base.position.y = 0.06;
    neck.add(base);
    for (let i = 0; i < 3; i++) {
      const ring = new Mesh(new TorusGeometry(0.15 - i * 0.008, 0.028, 8, 20), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.0 + i * 0.065;
      neck.add(ring);
    }
    const tipCap = new Mesh(new SphereGeometry(0.06, 10, 8), ink);
    tipCap.position.y = -0.05;
    neck.add(tipCap);

    // ---- head: the bulb
    const fc = canvas(1024, 512);
    this.faceCanvas = fc.c;
    this.faceCtx = fc.g;
    this.faceTex = tex(this.faceCanvas);
    this.headMat = toonUnique(0xffffff, { mottle: 0.05, map: this.faceTex, emissive: 0xffe9a0 });
    this.headMat.emissiveIntensity = 0.12;
    this.head = new Mesh(new SphereGeometry(0.44, 40, 28), this.headMat);
    this.head.scale.set(1, 1.08, 1);
    this.head.position.y = 0.6;
    this.head.castShadow = true;
    neck.add(this.head);
    this.drawFace({ blink: 0, mouth: 'smile', look: 0 });

    this.light = new PointLight(0xffd88a, 0, 9, 1.6);
    this.light.position.y = 0.6;
    neck.add(this.light);

    // ---- limbs
    this.armL = new HoseLimb(ink, 0.78, 0.05);
    this.armR = new HoseLimb(ink, 0.78, 0.05);
    this.legL = new HoseLimb(ink, 0.6, 0.055);
    this.legR = new HoseLimb(ink, 0.6, 0.055);
    this.body.add(this.armL, this.armR, this.legL, this.legR);

    const mkHand = () => {
      const h = new Group();
      const palm = new Mesh(new SphereGeometry(0.115, 18, 12), glove);
      palm.scale.set(1, 0.9, 0.85);
      palm.castShadow = true;
      h.add(palm);
      const thumb = new Mesh(new SphereGeometry(0.05, 10, 8), glove);
      thumb.position.set(0, 0.07, 0.07);
      h.add(thumb);
      const cuff = new Mesh(new TorusGeometry(0.075, 0.035, 8, 16), glove);
      cuff.position.y = 0.09;
      cuff.rotation.x = Math.PI / 2;
      h.add(cuff);
      this.body.add(h);
      return h;
    };
    this.handL = mkHand();
    this.handR = mkHand();

    const mkFoot = () => {
      const f = new Mesh(new SphereGeometry(0.15, 20, 14), shoe);
      f.scale.set(1, 0.72, 1.55);
      f.castShadow = true;
      this.body.add(f);
      return f;
    };
    this.footL = mkFoot();
    this.footR = mkFoot();
    this.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
    });
    // merge rigid parts (each animated piece keeps its own transform)
    this.head.userData.dynamic = true;
    this.footL.userData.dynamic = true;
    this.footR.userData.dynamic = true;
    this.handL.userData.dynamic = true;
    this.handR.userData.dynamic = true;
    this.torso.userData.dynamic = true;
    bakeDeep(this.body);
  }

  private drawFace(o: { blink: number; mouth: Mouth; look: number; ouch?: boolean }) {
    const key = `${o.blink > 0.85 ? 1 : 0}|${o.mouth}|${o.look.toFixed(1)}|${o.ouch ? 1 : 0}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    const g = this.faceCtx;
    const W = 1024;
    const H = 512;
    g.fillStyle = BULB;
    g.fillRect(0, 0, W, H);
    // subtle glass shading toward the back
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(230,200,120,0.35)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(230,200,120,0.35)');
    grd.addColorStop(0.75, 'rgba(230,200,120,0.5)');
    grd.addColorStop(1, 'rgba(230,200,120,0.35)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    const cx = W * 0.25; // front of the sphere (+z)
    // filament "hair" curl at the top
    g.strokeStyle = '#c98a1f';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const x = cx - 50 + t * 100;
      const y = 92 - Math.abs(Math.sin(t * Math.PI * 4)) * 22 - Math.sin(t * Math.PI) * 14;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 50, 92);
    g.lineTo(cx - 62, 150);
    g.moveTo(cx + 50, 92);
    g.lineTo(cx + 62, 150);
    g.stroke();

    // eyes
    const ey = 214;
    if (o.ouch) {
      g.strokeStyle = INK;
      g.lineWidth = 12;
      for (const sx of [-1, 1]) {
        const x = cx + sx * 56;
        g.beginPath();
        g.moveTo(x - 20, ey - 20);
        g.lineTo(x + 20, ey + 20);
        g.moveTo(x + 20, ey - 20);
        g.lineTo(x - 20, ey + 20);
        g.stroke();
      }
    } else {
      pieEye(g, cx - 56, ey, 66, 96, o.look, 0.1, o.blink);
      pieEye(g, cx + 56, ey, 66, 96, o.look, 0.1, o.blink);
    }
    // cheeks
    g.fillStyle = 'rgba(240,130,110,0.45)';
    g.beginPath();
    g.ellipse(cx - 112, 282, 26, 15, 0, 0, Math.PI * 2);
    g.ellipse(cx + 112, 282, 26, 15, 0, 0, Math.PI * 2);
    g.fill();

    // mouth
    g.strokeStyle = INK;
    g.fillStyle = '#7a2016';
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const my = 296;
    g.beginPath();
    switch (o.mouth) {
      case 'smile':
        g.moveTo(cx - 64, my - 8);
        g.quadraticCurveTo(cx, my + 54, cx + 64, my - 8);
        g.stroke();
        break;
      case 'grin':
      case 'open':
        g.moveTo(cx - 66, my - 10);
        g.quadraticCurveTo(cx, my + (o.mouth === 'grin' ? 84 : 68), cx + 66, my - 10);
        g.quadraticCurveTo(cx, my + 10, cx - 66, my - 10);
        g.fill();
        g.stroke();
        g.fillStyle = '#e8706a';
        g.beginPath();
        g.ellipse(cx, my + 36, 24, 11, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'o':
        g.ellipse(cx, my + 14, 18, 24, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        break;
      case 'grit':
        g.fillStyle = '#fffaf0';
        g.moveTo(cx - 46, my);
        g.lineTo(cx + 46, my);
        g.lineTo(cx + 40, my + 26);
        g.lineTo(cx - 40, my + 26);
        g.closePath();
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(cx - 44, my + 13);
        g.lineTo(cx + 44, my + 13);
        g.stroke();
        break;
      case 'flat':
        g.moveTo(cx - 34, my + 10);
        g.lineTo(cx + 34, my + 10);
        g.stroke();
        break;
    }
    // glass glint painted on (sells the "bulb")
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(cx + 120, 120, 26, 46, 0.5, 0, Math.PI * 2);
    g.fill();
    this.faceTex.needsUpdate = true;
  }

  setBowTie(gold: boolean) {
    this.bowMat.color.set(gold ? PAL.gold : PAL.red);
    this.bowMat.emissive.set(gold ? 0x553311 : 0x000000);
  }

  /** Big squash or stretch impulse (+ stretch, - squash). */
  punch(amount: number) {
    this.squashVel += amount * 14;
  }

  update(dt: number, p: FlickPose) {
    const sp = clamp(p.speed01, 0, 1);
    // gait
    const stepFreq = lerp(1.6, 2.7, sp);
    if (p.grounded && sp > 0.05) this.phase += dt * stepFreq * Math.PI * 2;
    else if (p.grounded) this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 8, dt);
    const ph = this.phase;

    // squash spring
    if (p.grounded && !this.wasGrounded) this.punch(-0.35);
    this.wasGrounded = p.grounded;
    const k = 220;
    const c = 16;
    this.squashVel += (-k * this.squash - c * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    let stretch = this.squash;
    if (!p.grounded) stretch += clamp(Math.abs(p.vy) * 0.008, 0, 0.12);
    if (p.dashing) stretch += 0.12;
    const beatBob = Math.sin(p.beat * Math.PI * 2);
    if (p.grounded && sp < 0.1) stretch += beatBob * 0.025;
    const sy = 1 + stretch;
    const sxz = 1 / Math.sqrt(Math.max(0.4, sy));
    this.body.scale.set(sxz, sy, sxz);

    // lean & spin
    this.lean = damp(this.lean, p.dashing ? 0.55 : sp * 0.16 + (p.grounded ? 0 : -0.05), 10, dt);
    this.body.rotation.x = this.lean;
    this.body.rotation.y = p.spin > 0 && p.spin < 1 ? p.spin * Math.PI * 2 : 0;

    // hips bob
    const bob = p.grounded ? Math.abs(Math.sin(ph)) * 0.07 * sp : 0;
    const idle = p.grounded && sp < 0.1 ? (beatBob * 0.5 + 0.5) * 0.03 : 0;
    this.hips.position.y = 0.62 + bob - idle;
    this.hips.rotation.z = Math.sin(ph) * 0.06 * sp;
    this.hips.rotation.y = Math.sin(ph) * 0.18 * sp;
    this.torso.rotation.z = -Math.sin(ph) * 0.05 * sp + (p.grounded && sp < 0.1 ? Math.sin(p.beat * Math.PI) * 0.04 : 0);
    this.head.rotation.z = Math.sin(p.beat * Math.PI) * (sp < 0.1 ? 0.07 : 0.03);

    // ---- feet
    const stride = 0.34 * sp;
    const lift = 0.2 * sp;
    const footPos = (side: number, f: Mesh) => {
      const s = side < 0 ? 0 : Math.PI;
      let z = Math.sin(ph + s) * stride;
      let y = 0.1 + Math.max(0, Math.cos(ph + s)) * lift;
      let x = side * 0.13;
      if (!p.grounded) {
        // tuck & kick in the air
        const up = p.vy > 0 ? 1 : 0;
        y = 0.28 + up * 0.12 + (side < 0 ? 0.1 : -0.02);
        z = side < 0 ? 0.18 : -0.18;
        x = side * 0.16;
      }
      if (p.dashing) {
        y = 0.35;
        z = -0.35 + side * 0.08;
      }
      f.position.set(x, y, z + 0.06);
      f.rotation.x = p.grounded ? -Math.cos(ph + s) * 0.35 * sp : -0.4;
    };
    footPos(-1, this.footL);
    footPos(1, this.footR);

    // ---- legs from hips to ankles
    const hipY = this.hips.position.y - 0.08;
    this.legL.root.set(-0.12, hipY, 0);
    this.legR.root.set(0.12, hipY, 0);
    this.legL.tip.set(this.footL.position.x, this.footL.position.y + 0.07, this.footL.position.z - 0.1);
    this.legR.tip.set(this.footR.position.x, this.footR.position.y + 0.07, this.footR.position.z - 0.1);
    this.legL.bendDir.set(-0.2, 0, 1).normalize();
    this.legR.bendDir.set(0.2, 0, 1).normalize();
    this.legL.update();
    this.legR.update();

    // ---- arms
    const shoulderY = this.hips.position.y + this.torso.position.y + 0.12;
    this.armLift = damp(this.armLift, p.grounded ? 0 : p.vy > 0 ? 1 : 0.6, 8, dt);
    const swing = Math.sin(ph) * 0.32 * sp;
    const handPos = (side: number, h: Group, sw: number) => {
      let x = side * (0.52 + this.armLift * 0.12);
      let y = shoulderY - 0.46 + this.armLift * 0.78 + Math.abs(sw) * 0.12;
      let z = sw;
      if (sp < 0.1 && p.grounded) {
        y += Math.sin(p.beat * Math.PI * 2 + side) * 0.04;
        x += side * 0.04;
      }
      if (!p.grounded && p.vy < 0) {
        // flail
        y += Math.sin(performance.now() * 0.02 + side * 2) * 0.08;
        x += Math.cos(performance.now() * 0.017 + side) * 0.05;
      }
      if (p.dashing) {
        x = side * 0.3;
        y = shoulderY - 0.1;
        z = -0.5;
      }
      if (p.celebrate) {
        x = side * 0.36;
        y = shoulderY + 0.55 + Math.sin(performance.now() * 0.012 + side) * 0.06;
        z = 0.05;
      }
      if (p.talking && side > 0) {
        y = shoulderY - 0.05 + Math.sin(performance.now() * 0.008) * 0.06;
        z = 0.2;
      }
      if (p.shooting && side > 0) {
        x = 0.18;
        y = shoulderY + 0.02;
        z = 0.62;
      }
      h.position.set(x, y, z);
      h.rotation.z = side * 0.3;
    };
    handPos(-1, this.handL, -swing);
    handPos(1, this.handR, swing);
    this.armL.root.set(-0.21, shoulderY, 0);
    this.armR.root.set(0.21, shoulderY, 0);
    this.armL.tip.copy(this.handL.position).add(new Vector3(0, 0.08, 0));
    this.armR.tip.copy(this.handR.position).add(new Vector3(0, 0.08, 0));
    this.armL.bendDir.set(-1, -0.4, -0.3).normalize();
    this.armR.bendDir.set(1, -0.4, -0.3).normalize();
    this.armL.update();
    this.armR.update();
    this.handR.localToWorld(this.muzzle.set(0, 0, 0.12));

    // ---- face
    this.blinkT -= dt;
    let blink = 0;
    if (this.blinkT < 0.12) blink = 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    let mouth: Mouth = 'smile';
    if (!p.grounded) mouth = p.vy > 0 ? 'grin' : 'o';
    if (p.dashing) mouth = 'grit';
    if (p.shooting) mouth = 'grit';
    if (p.celebrate) mouth = 'grin';
    if (p.talking) {
      this.talkT += dt;
      mouth = Math.floor(this.talkT * 9) % 2 ? 'open' : 'smile';
    }
    this.drawFace({ blink, mouth, look: 0, ouch: p.hurt });

    // ---- glow
    const glow = clamp(p.glow, 0, 1);
    this.headMat.emissiveIntensity = 0.1 + glow * 0.55;
    this.light.intensity = glow * 6;
    (this.headMat.emissive as Color).setRGB(1, 0.92, 0.62);
  }
}
