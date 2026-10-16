import {
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { HoseLimb } from '../player/HoseLimb';
import { FaceRig } from '../render/faces';
import { PAL, toon, toonUnique } from '../render/materials';
import { canvas, INK, tex } from '../render/textures';
import { G, m } from '../world/kit';
import type { NPCBuild } from './NPC';

const ink = () => toon(0x2a1f19, { mottle: 0.2 });
const glove = () => toon(PAL.white, { gloss: true, mottle: 0.1 });
const shoeMat = () => toon(0x6a3a22, { gloss: true, mottle: 0.2 });

function legs(g: Group, hipY: number, spread: number, shoe = shoeMat()) {
  for (const sx of [-1, 1]) {
    const leg = new HoseLimb(ink(), hipY * 1.05, 0.06);
    leg.root.set(sx * spread, hipY, 0);
    leg.tip.set(sx * (spread + 0.08), 0.16, 0.05);
    leg.bendDir.set(sx * 0.4, 0, 1).normalize();
    leg.update();
    g.add(leg);
    g.add(m(G.sphere(0.17, 16, 12), shoe, { p: [sx * (spread + 0.08), 0.1, 0.16], s: [1, 0.7, 1.5] }));
  }
}

interface Arm {
  limb: HoseLimb;
  hand: Group;
  rest: Vector3;
}
function arm(g: Group, shoulder: Vector3, hand: Vector3, side: number, len = 1): Arm {
  const limb = new HoseLimb(ink(), len, 0.05);
  limb.root.copy(shoulder);
  limb.bendDir.set(side, -0.5, -0.3).normalize();
  const h = new Group();
  h.userData.dynamic = true;
  h.add(m(G.sphere(0.13, 14, 10), glove(), { s: [1, 0.9, 0.85] }));
  h.add(m(G.torus(0.085, 0.04, 8, 14), glove(), { p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0] }));
  h.position.copy(hand);
  g.add(limb, h);
  limb.tip.copy(hand).add(new Vector3(0, 0.08, 0));
  limb.update();
  return { limb, hand: h, rest: hand.clone() };
}
function gesture(a: Arm, t: number, talking: boolean, side: number, amp = 0.25) {
  const target = a.rest.clone();
  if (talking) {
    target.y += 0.25 + Math.sin(t * 7 + side) * amp;
    target.z += 0.25;
    target.x += side * Math.sin(t * 5) * 0.1;
  }
  a.hand.position.lerp(target, 0.18);
  a.limb.tip.copy(a.hand.position).add(new Vector3(0, 0.08, 0));
  a.limb.update();
}

function facePlane(face: FaceRig, w: number, h: number) {
  return new Mesh(new PlaneGeometry(w, h), toonUnique(0xffffff, { map: face.texture, alphaTest: 0.5, mottle: 0, side: DoubleSide }));
}

// ------------------------------------------------------------------ Mayor Gramophone
export function mayor(): NPCBuild {
  const body = new Group();
  legs(body, 0.95, 0.35);
  const wood = toon(0x9a5a32, { gloss: true });
  const brass = toon(PAL.brass, { gloss: true, mottle: 0.15 });
  const cab = m(G.box(1.7, 1.4, 1.25), wood, { p: [0, 1.65, 0] });
  body.add(cab);
  body.add(m(G.box(1.8, 0.14, 1.35), brass, { p: [0, 2.38, 0] }));
  body.add(m(G.box(1.8, 0.14, 1.35), brass, { p: [0, 0.95, 0] }));
  const face = new FaceRig('decal', { eyes: 'pie', mouth: 'smile', mustache: true, brows: 'up', cheeks: true });
  const fp = facePlane(face, 1.5, 1.5);
  fp.position.set(0, 1.62, 0.64);
  body.add(fp);
  // mayoral bow tie + medal
  for (const sx of [-1, 1]) body.add(m(G.cone(0.16, 0.3, 10), toon(PAL.red, { gloss: true }), { p: [sx * 0.15, 2.48, 0.6], r: [0, 0, (sx * Math.PI) / 2] }));
  body.add(m(G.sphere(0.08, 10, 8), toon(PAL.red, { gloss: true }), { p: [0, 2.48, 0.62] }));
  body.add(m(G.cyl(0.16, 0.16, 0.05, 14), toon(PAL.gold, { gloss: true }), { p: [0.55, 1.05, 0.64], r: [Math.PI / 2, 0, 0] }));
  // crank
  body.add(m(G.cyl(0.05, 0.05, 0.5, 6), brass, { p: [0.98, 1.7, 0], r: [0, 0, Math.PI / 2] }));
  body.add(m(G.sphere(0.12, 10, 8), toon(PAL.red, { gloss: true }), { p: [1.24, 1.95, 0] }));
  // the horn (worn like a grand hat)
  const horn = new Group();
  horn.userData.dynamic = true;
  horn.position.set(0, 2.45, -0.1);
  horn.rotation.x = -0.45;
  horn.add(m(new CylinderGeometry(1.15, 0.14, 1.9, 28, 1, true), toon(PAL.brass, { gloss: true, side: DoubleSide }), { p: [0, 1.0, 0] }));
  horn.add(m(new CylinderGeometry(1.08, 0.1, 1.85, 28, 1, true), toon(0x5a3d26, { side: DoubleSide }), { p: [0, 1.02, 0] }));
  horn.add(m(G.torus(1.15, 0.06, 8, 32), brass, { p: [0, 1.95, 0], r: [Math.PI / 2, 0, 0] }));
  body.add(horn);
  const aL = arm(body, new Vector3(-0.85, 1.9, 0), new Vector3(-1.15, 1.25, 0.25), -1);
  const aR = arm(body, new Vector3(0.85, 1.9, 0), new Vector3(1.15, 1.25, 0.25), 1);
  return {
    body,
    face,
    top: 4.6,
    animate: (_dt, t, talking) => {
      gesture(aL, t, talking, -1);
      gesture(aR, t, talking, 1, 0.35);
      horn.rotation.z = Math.sin(t * 2) * 0.05;
    },
  };
}

// ------------------------------------------------------------------ Captain Bobber
export function bobber(): NPCBuild {
  const body = new Group();
  legs(body, 0.75, 0.28);
  const face = new FaceRig(
    'sphere',
    { eyes: 'pie', mouth: 'smile', brows: 'up', cheeks: true },
    (g, w, h) => {
      g.fillStyle = '#d2402f';
      g.fillRect(0, 0, w, h * 0.42);
      g.fillStyle = '#fbf0d4';
      g.fillRect(0, h * 0.42, w, h * 0.58);
      g.fillStyle = INK;
      g.fillRect(0, h * 0.4, w, h * 0.04);
    },
    0.75,
    290,
  );
  const ball = m(new SphereGeometry(0.85, 32, 22), toonUnique(0xffffff, { map: face.texture, gloss: true, mottle: 0.05 }), { p: [0, 1.55, 0] });
  body.add(ball);
  // captain's cap
  const cap = new Group();
  cap.position.set(0, 2.25, 0);
  cap.rotation.x = -0.12;
  cap.add(m(G.cyl(0.52, 0.48, 0.32, 20), toon(0x2b3a5a), { p: [0, 0.15, 0] }));
  cap.add(m(G.cyl(0.58, 0.56, 0.12, 20), toon(0xfbf0d4), { p: [0, 0.36, 0] }));
  cap.add(m(G.cyl(0.6, 0.6, 0.05, 20), toon(0x1d2436), { p: [0, 0.0, 0.18], s: [1, 1, 0.9] }));
  cap.add(m(G.sphere(0.09, 10, 8), toon(PAL.gold, { gloss: true }), { p: [0, 0.2, 0.5] }));
  body.add(cap);
  // stem of the bobber sticking out the top of the cap
  body.add(m(G.cyl(0.05, 0.05, 0.7, 8), toon(0xfbf0d4), { p: [0, 2.9, 0] }));
  // corncob pipe
  body.add(m(G.cyl(0.03, 0.03, 0.4, 6), toon(0x7a4a29), { p: [0.32, 1.32, 0.82], r: [0, 0, 1.2] }));
  body.add(m(G.cyl(0.08, 0.07, 0.18, 10), toon(0xd9a441), { p: [0.52, 1.42, 0.86] }));
  const aL = arm(body, new Vector3(-0.7, 1.45, 0), new Vector3(-1.05, 0.95, 0.2), -1, 0.9);
  const aR = arm(body, new Vector3(0.7, 1.45, 0), new Vector3(1.05, 0.95, 0.2), 1, 0.9);
  return {
    body,
    face,
    top: 3.3,
    animate: (_dt, t, talking) => {
      gesture(aL, t, talking, -1, 0.2);
      gesture(aR, t, talking, 1, 0.3);
    },
  };
}

// ------------------------------------------------------------------ Madame Kettlecorn (popcorn cart)
export function kettlecorn(): NPCBuild {
  const body = new Group();
  const red = toon(PAL.red, { gloss: true });
  const gold = toon(PAL.gold, { gloss: true });
  body.add(m(G.box(2.4, 1.3, 1.5), red, { p: [0, 1.15, 0] }));
  body.add(m(G.box(2.5, 0.12, 1.6), gold, { p: [0, 1.82, 0] }));
  for (const sx of [-1, 1]) {
    body.add(m(G.torus(0.42, 0.09, 8, 20), toon(0x2e2622), { p: [sx * 1.0, 0.45, 0.78] }));
    body.add(m(G.cyl(0.05, 0.05, 0.84, 6), gold, { p: [sx * 1.0, 0.45, 0.78], r: [0, 0, Math.PI / 2] }));
  }
  // glass popper chamber: a brass frame full of popcorn
  const frame = toon(PAL.brass, { gloss: true });
  for (const [x, z] of [
    [-1.05, -0.62],
    [1.05, -0.62],
    [-1.05, 0.62],
    [1.05, 0.62],
  ])
    body.add(m(G.box(0.1, 1.4, 0.1), frame, { p: [x, 2.55, z] }));
  body.add(m(G.box(2.3, 0.1, 1.4), frame, { p: [0, 3.25, 0] }));
  const corn = toon(0xfff3cf, { mottle: 0.3 });
  for (let i = 0; i < 46; i++) {
    const p = new Vector3((Math.random() - 0.5) * 1.9, 1.95 + Math.random() * 0.75, (Math.random() - 0.5) * 1.1);
    body.add(m(new IcosahedronGeometry(0.17 + Math.random() * 0.06, 0), corn, { p: [p.x, p.y, p.z], r: [Math.random() * 3, Math.random() * 3, 0], shadow: false }));
  }
  // striped awning roof
  const roof = new Group();
  roof.userData.dynamic = true;
  roof.position.y = 3.35;
  for (let i = 0; i < 8; i++) roof.add(m(G.box(0.34, 0.12, 1.9), toon(i % 2 ? PAL.cream : PAL.red), { p: [-1.2 + i * 0.34, 0.25 - Math.abs(i - 3.5) * -0.06, 0] }));
  body.add(roof);
  body.add(m(G.sphere(0.2, 12, 10), gold, { p: [0, 3.9, 0] }));
  // face on the cart front
  const face = new FaceRig('decal', { eyes: 'pie', mouth: 'smile', brows: 'up', cheeks: true, eyeGap: 1.1 });
  const fp = facePlane(face, 1.4, 1.4);
  fp.position.set(0, 1.18, 0.76);
  body.add(fp);
  // a big bow on top
  for (const sx of [-1, 1]) body.add(m(G.cone(0.25, 0.45, 10), toon(PAL.pink, { gloss: true }), { p: [sx * 0.25, 4.0, 0], r: [0, 0, (sx * Math.PI) / 2] }));
  const aL = arm(body, new Vector3(-1.2, 1.4, 0), new Vector3(-1.55, 1.05, 0.3), -1, 0.85);
  const aR = arm(body, new Vector3(1.2, 1.4, 0), new Vector3(1.55, 1.05, 0.3), 1, 0.85);
  return {
    body,
    face,
    top: 4.3,
    animate: (_dt, t, talking) => {
      gesture(aL, t, talking, -1);
      gesture(aR, t, talking, 1);
      roof.position.y = 3.35 + Math.max(0, Math.sin(t * 9)) * 0.04;
    },
  };
}

// ------------------------------------------------------------------ Old Man Oak
export function oak(): NPCBuild {
  const body = new Group();
  const bark = toon(0x8a5a36, { mottle: 0.9 });
  body.add(m(new CylinderGeometry(2.3, 3.3, 13, 18), bark, { p: [0, 6.5, 0] }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    body.add(m(G.cone(1.1, 3.2, 8), bark, { p: [Math.cos(a) * 3.0, 0.6, Math.sin(a) * 3.0], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9] }));
  }
  const leaf = toon(0x5f9a3a, { mottle: 0.8 });
  const leaf2 = toon(0x4f8a32, { mottle: 0.8 });
  for (const [x, y, z, r] of [
    [0, 19, 0, 6.2],
    [-4.5, 16.8, 1, 4.2],
    [4.5, 17.1, -1, 4.4],
    [1, 16.4, 4, 4],
    [-1, 16.8, -4, 4.2],
  ])
    body.add(m(new IcosahedronGeometry(1, 2), r > 4.3 ? leaf : leaf2, { p: [x, y, z], s: r }));
  // branch arms
  const armL = new Group();
  armL.userData.dynamic = true;
  armL.position.set(-2.1, 8, 0);
  armL.add(m(new CylinderGeometry(0.35, 0.6, 4.2, 10), bark, { p: [0, 2.0, 0] }));
  armL.rotation.z = 1.0;
  const armR = armL.clone();
  armR.position.x = 2.1;
  armR.rotation.z = -1.0;
  body.add(armL, armR);
  const face = new FaceRig('decal', { eyes: 'sleepy', mouth: 'smile', mustache: true, brows: 'worried', nose: true });
  const fp = facePlane(face, 4.4, 4.4);
  fp.position.set(0, 5.2, 2.85);
  fp.rotation.x = -0.08;
  body.add(fp);
  return {
    body,
    face,
    top: 9.5,
    animate: (_dt, t, talking) => {
      armL.rotation.z = 1.0 + Math.sin(t * (talking ? 3 : 1)) * (talking ? 0.2 : 0.06);
      armR.rotation.z = -1.0 - Math.sin(t * (talking ? 3.4 : 1.2)) * (talking ? 0.2 : 0.06);
    },
  };
}

// ------------------------------------------------------------------ Gus the weathervane rooster
export function gus(): NPCBuild {
  const body = new Group();
  const iron = toon(0x2e2622, { gloss: true });
  const copper = toon(0xc4733f, { gloss: true });
  body.add(m(G.cyl(0.12, 0.16, 3.2, 8), iron, { p: [0, 1.6, 0] }));
  // compass arms N E S W
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    body.add(m(G.box(1.8, 0.08, 0.08), iron, { p: [Math.cos(a) * 0.9, 2.6, Math.sin(a) * 0.9], r: [0, -a, 0] }));
    body.add(m(G.sphere(0.14, 8, 6), toon(PAL.gold, { gloss: true }), { p: [Math.cos(a) * 1.8, 2.6, Math.sin(a) * 1.8] }));
  }
  const bird = new Group();
  bird.userData.dynamic = true;
  bird.position.y = 3.3;
  bird.add(m(G.sphere(0.6, 20, 14), copper, { s: [1.1, 0.9, 1.3] }));
  const face = new FaceRig('sphere', { eyes: 'pie', mouth: 'none', brows: 'up' }, '#c4733f', 0.9, 230);
  const head = m(G.sphere(0.42, 24, 16), toonUnique(0xffffff, { map: face.texture, gloss: true }), { p: [0, 0.55, 0.55], dynamic: true });
  bird.add(head);
  bird.add(m(G.cone(0.13, 0.38, 8), toon(PAL.gold, { gloss: true }), { p: [0, 0.48, 1.02], r: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 3; i++) bird.add(m(G.sphere(0.13, 10, 8), toon(PAL.red, { gloss: true }), { p: [0, 0.98 + i * 0.03, 0.4 + i * 0.16] }));
  bird.add(m(G.sphere(0.12, 10, 8), toon(PAL.red, { gloss: true }), { p: [0, 0.22, 0.86] }));
  for (let i = 0; i < 5; i++)
    bird.add(m(G.cone(0.22, 1.2, 6), i % 2 ? copper : toon(0x8f5a2f, { gloss: true }), { p: [(i - 2) * 0.18, 0.5, -0.9], r: [-0.7, 0, (i - 2) * 0.25], s: [1, 1, 0.4] }));
  body.add(bird);
  for (const sx of [-1, 1]) body.add(m(G.cyl(0.04, 0.04, 0.5, 5), toon(PAL.gold), { p: [sx * 0.2, 2.95, 0] }));
  return {
    body,
    face,
    top: 4.8,
    animate: (_dt, t, talking) => {
      bird.rotation.y = Math.sin(t * 0.4) * 0.5;
      head.rotation.x = talking ? Math.sin(t * 14) * 0.15 : 0;
    },
  };
}

// ------------------------------------------------------------------ Penny the piggy bank
export function penny(): NPCBuild {
  const body = new Group();
  const pink = '#f2a3b4';
  const face = new FaceRig('sphere', { eyes: 'pie', mouth: 'smile', cheeks: true, brows: 'up' }, pink, 0.8, 240);
  const pig = m(new SphereGeometry(1.05, 32, 22), toonUnique(0xffffff, { map: face.texture, gloss: true, mottle: 0.05 }), { p: [0, 1.25, 0], s: [1.1, 1, 1.05] });
  body.add(pig);
  const pinkM = toon(0xf2a3b4, { gloss: true });
  body.add(m(G.cyl(0.32, 0.36, 0.3, 16), pinkM, { p: [0, 1.05, 1.08], r: [Math.PI / 2, 0, 0] }));
  for (const sx of [-0.12, 0.12]) body.add(m(G.sphere(0.07, 8, 6), toon(0x9a4f5e), { p: [sx, 1.05, 1.24], s: [1, 1.4, 0.4] }));
  for (const sx of [-1, 1]) body.add(m(G.cone(0.28, 0.5, 8), pinkM, { p: [sx * 0.55, 2.2, 0.15], r: [0.3, 0, sx * -0.4] }));
  body.add(m(G.box(0.6, 0.08, 0.14), toon(0x3a2430), { p: [0, 2.28, -0.1] }));
  for (const [x, z] of [
    [-0.55, 0.45],
    [0.55, 0.45],
    [-0.55, -0.45],
    [0.55, -0.45],
  ])
    body.add(m(G.cyl(0.2, 0.18, 0.5, 12), pinkM, { p: [x, 0.25, z] }));
  body.add(m(new TorusGeometry(0.18, 0.05, 6, 14, Math.PI * 1.6), pinkM, { p: [0, 1.4, -1.15] }));
  // a jaunty bowler hat
  body.add(m(G.cyl(0.38, 0.42, 0.42, 18), toon(0x3a2e28), { p: [0.2, 2.55, 0.1], r: [0, 0, -0.2] }));
  body.add(m(G.cyl(0.62, 0.62, 0.06, 18), toon(0x3a2e28), { p: [0.16, 2.36, 0.1], r: [0, 0, -0.2] }));
  return { body, face, top: 3.2 };
}

// ------------------------------------------------------------------ Tess the ticket
export function tess(): NPCBuild {
  const body = new Group();
  legs(body, 0.7, 0.22);
  const { c, g } = canvas(512, 900);
  g.fillStyle = '#f4d59a';
  g.fillRect(0, 0, 512, 900);
  g.strokeStyle = '#d2402f';
  g.lineWidth = 24;
  g.strokeRect(30, 30, 452, 840);
  g.setLineDash([18, 16]);
  g.lineWidth = 6;
  g.strokeStyle = INK;
  g.beginPath();
  g.moveTo(40, 640);
  g.lineTo(472, 640);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#d2402f';
  g.font = '64px "Rye", Georgia, serif';
  g.textAlign = 'center';
  g.fillText('ADMIT', 256, 730);
  g.fillText('ONE', 256, 810);
  body.add(m(G.box(1.25, 2.1, 0.16), toonUnique(0xffffff, { map: tex(c), mottle: 0.1 }), { p: [0, 1.85, 0] }));
  const face = new FaceRig('decal', { eyes: 'pie', mouth: 'smile', cheeks: true, brows: 'up' });
  const fp = facePlane(face, 1.15, 1.15);
  fp.position.set(0, 2.3, 0.09);
  body.add(fp);
  const aL = arm(body, new Vector3(-0.62, 1.9, 0), new Vector3(-0.95, 1.3, 0.25), -1, 0.8);
  const aR = arm(body, new Vector3(0.62, 1.9, 0), new Vector3(0.95, 1.3, 0.25), 1, 0.8);
  return {
    body,
    face,
    top: 3.4,
    animate: (_dt, t, talking) => {
      gesture(aL, t, talking, -1);
      gesture(aR, t, talking, 1);
    },
  };
}

// ------------------------------------------------------------------ Mort the mailbox
export function mort(): NPCBuild {
  const body = new Group();
  const blue = toon(0x3c6aa8, { gloss: true });
  body.add(m(G.cyl(0.12, 0.14, 1.4, 8), toon(PAL.woodDark), { p: [0, 0.7, 0] }));
  body.add(m(G.box(1.0, 0.85, 1.4), blue, { p: [0, 1.75, 0] }));
  body.add(m(new CylinderGeometry(0.5, 0.5, 1.4, 20, 1, false, 0, Math.PI), blue, { p: [0, 2.17, 0], r: [Math.PI / 2, Math.PI / 2, 0] }));
  const flagArm = new Group();
  flagArm.userData.dynamic = true;
  flagArm.position.set(0.55, 1.8, -0.3);
  flagArm.add(m(G.box(0.06, 0.9, 0.08), toon(PAL.red), { p: [0, 0.4, 0] }));
  flagArm.add(m(G.box(0.06, 0.32, 0.42), toon(PAL.red), { p: [0, 0.72, 0.2] }));
  body.add(flagArm);
  const face = new FaceRig('decal', { eyes: 'pie', mouth: 'smile', brows: 'up' });
  const fp = facePlane(face, 0.95, 0.95);
  fp.position.set(0, 1.85, 0.71);
  body.add(fp);
  return {
    body,
    face,
    top: 2.8,
    animate: (_dt, t, talking) => {
      flagArm.rotation.x = talking ? -0.8 + Math.sin(t * 10) * 0.3 : 0;
    },
  };
}

// ------------------------------------------------------------------ Kernel kid (lost popcorn)
export function kernelKid(): NPCBuild {
  const body = new Group();
  const corn = toon(0xfff3cf, { gloss: true, mottle: 0.3 });
  for (const [x, y, z, r] of [
    [0, 0.75, 0, 0.42],
    [-0.28, 0.95, -0.1, 0.28],
    [0.3, 0.98, -0.08, 0.3],
    [0.02, 1.15, -0.12, 0.3],
  ])
    body.add(m(G.sphere(r, 16, 12), corn, { p: [x, y, z] }));
  body.add(m(G.sphere(0.22, 12, 8), toon(PAL.gold), { p: [0, 0.45, 0], s: [1.2, 0.6, 1.2] }));
  const face = new FaceRig('decal', { eyes: 'wide', mouth: 'o', cheeks: true });
  const fp = facePlane(face, 0.62, 0.62);
  fp.position.set(0, 0.78, 0.43);
  body.add(fp);
  for (const sx of [-1, 1]) {
    const leg = new HoseLimb(ink(), 0.36, 0.035);
    leg.root.set(sx * 0.12, 0.42, 0);
    leg.tip.set(sx * 0.16, 0.06, 0.03);
    leg.bendDir.set(sx, 0, 1).normalize();
    leg.update();
    body.add(leg);
    body.add(m(G.sphere(0.09, 10, 8), shoeMat(), { p: [sx * 0.16, 0.05, 0.08], s: [1, 0.7, 1.4] }));
  }
  return { body, face, top: 1.5 };
}
