import {
  AdditiveBlending,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { World } from '../World';
import { G, T, grp, m } from '../kit';
import { barrel, crate, palm, rock, sign, stripeMat, umbrella } from '../props';
import { PAL, toonUnique } from '../../render/materials';
import { Reel, tokenLine } from '../Collectibles';
import { NPC } from '../../npc/NPC';
import { bobber } from '../../npc/characters';
import { makeGlowSprite } from '../../render/Sky';
import { patchUnlit } from '../../render/gbuffer';

export const LIGHTHOUSE = { x: -64, z: 108, base: 6.5, height: 20, stairR: 4.75 };

export function buildDocks(w: World) {
  const ctx = w.ctx;
  const plank = T(0xb9824c);
  const plankDark = T(PAL.woodDark);

  // ---------------- pier
  const PX = 18;
  const deckY = 2.0;
  const z0 = 103;
  const z1 = 150;
  const pier = new Group();
  pier.add(m(G.box(5, 0.35, z1 - z0), plank, { p: [PX, deckY - 0.17, (z0 + z1) / 2] }));
  for (let z = z0; z <= z1; z += 1.2) pier.add(m(G.box(5.1, 0.06, 0.08), plankDark, { p: [PX, deckY + 0.01, z], shadow: false }));
  for (let z = z0 + 1; z <= z1; z += 4)
    for (const sx of [-2.6, 2.6]) {
      pier.add(m(G.cyl(0.28, 0.32, 5.5, 10), plankDark, { p: [PX + sx, deckY - 2.2, z] }));
      pier.add(m(G.cyl(0.3, 0.3, 0.6, 10), plank, { p: [PX + sx, deckY + 0.3, z] }));
    }
  // T at the end
  pier.add(m(G.box(16, 0.35, 5), plank, { p: [PX, deckY - 0.17, z1 + 2.5] }));
  for (const sx of [-7.5, 7.5]) pier.add(m(G.cyl(0.3, 0.32, 5.5, 10), plankDark, { p: [PX + sx, deckY - 2.2, z1 + 2.5] }));
  // steps up from the sand
  pier.add(m(G.box(5, 0.3, 1.2), plank, { p: [PX, 1.55, z0 - 1.6] }));
  pier.add(m(G.box(5, 0.3, 1.2), plank, { p: [PX, 1.8, z0 - 0.6] }));
  ctx.root.add(pier);
  ctx.physics.box({ x: PX, z: (z0 + z1) / 2, hx: 2.5, hz: (z1 - z0) / 2, y0: -3, y1: deckY });
  ctx.physics.box({ x: PX, z: z1 + 2.5, hx: 8, hz: 2.5, y0: -3, y1: deckY });
  ctx.physics.box({ x: PX, z: z0 - 1.6, hx: 2.5, hz: 0.6, y0: 0, y1: 1.7 });
  ctx.physics.box({ x: PX, z: z0 - 0.6, hx: 2.5, hz: 0.5, y0: 0, y1: 1.95 });

  // crates & barrels as a little climb to a token perch
  let top = crate(ctx, PX - 1.4, deckY, 132, 1.5);
  top = crate(ctx, PX - 1.4, top, 132, 1.3, 0.3);
  w.tokens.place('pier-perch', PX - 1.4, top + 1.2, 132);
  crate(ctx, PX + 1.3, deckY, 140, 1.4, 0.5);
  barrel(ctx, PX + 1.6, deckY, 128);
  barrel(ctx, PX + 1.5, deckY, 145.5);
  barrel(ctx, PX - 6, deckY, z1 + 2.5);
  tokenLine(w.tokens, 'pier-', [PX, 106], [PX, 126], 5, () => deckY - 0.1);
  tokenLine(w.tokens, 'pier-t-', [PX - 6, z1 + 2.5], [PX + 6, z1 + 2.5], 4, () => deckY - 0.1);

  // bobbing boats you can stand on
  const boat = (x: number, z: number, yaw: number, hull: number, stripe: number) => {
    const g = grp(x, 0, z, yaw);
    g.userData.dynamic = true;
    const h = m(new SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), T(hull, { gloss: true }), { s: [1.6, 1.0, 3.2] });
    h.position.y = 0.9;
    g.add(h);
    g.add(m(G.torus(1, 0.12, 6, 28), T(stripe), { p: [0, 0.9, 0], r: [Math.PI / 2, 0, 0], s: [1.6, 3.2, 1] }));
    g.add(m(G.box(2.6, 0.14, 5.6), T(0xc58a4f), { p: [0, 0.75, 0] }));
    g.add(m(G.box(2.6, 0.3, 0.5), T(0xb9824c), { p: [0, 1.0, 0.6] }));
    ctx.root.add(g);
    const col = ctx.physics.box({ x, z, yaw, hx: 1.5, hz: 2.9, y0: -2, y1: 0.85, dynamic: true });
    let ph = Math.random() * 6;
    w.updaters.push((dt) => {
      ph += dt;
      const y = Math.sin(ph * 1.3) * 0.18 - 0.05;
      g.position.y = y;
      g.rotation.z = Math.sin(ph * 0.9) * 0.05;
      g.rotation.x = Math.sin(ph * 1.1) * 0.03;
      col.y1 = y + 0.85;
      col.y0 = y - 2;
    });
    return g;
  };
  boat(10.5, 118, 0.15, 0xfbf0d4, PAL.red);
  boat(26.5, 138, -0.25, PAL.red, PAL.cream);
  w.tokens.place('boat-a', 10.5, 2.2, 118);
  w.tokens.place('boat-b', 26.5, 2.2, 138);

  // ---------------- Captain Bobber
  const cap = new NPC('bobber', 'Captain Bobber', 150, bobber(), -Math.PI / 2);
  cap.position.set(PX - 0.5, deckY, 121);
  ctx.root.add(cap);
  w.npcs.set('bobber', cap);

  // ---------------- beach dressing
  umbrella(ctx, -4, 86, '#d2402f', '#fbf0d4');
  umbrella(ctx, 8, 96, '#3d8f94', '#fbf0d4');
  umbrella(ctx, -14, 98, '#f2b83b', '#d2402f');
  for (const [x, z] of [
    [-2, 90],
    [9, 99],
    [-12, 101],
  ]) {
    const y = w.heightAt(x, z) + 0.03;
    ctx.root.add(m(G.box(1.4, 0.05, 2.6), stripeMat('#d2402f', '#fbf0d4', 6), { p: [x + 1.5, y, z], r: [0, 0.3, 0], shadow: false }));
  }
  palm(ctx, -22, 84, 7.5, 1);
  palm(ctx, 30, 84, 6.8, 2);
  palm(ctx, 36, 96, 7.2, 3);
  palm(ctx, -30, 92, 6.5, 4);
  palm(ctx, 2, 74, 7, 5);
  // sandcastle with a little flag
  {
    const x = -8;
    const z = 104;
    const y = w.heightAt(x, z);
    const sand = T(0xe9c98a);
    const g = grp(x, y, z);
    g.add(m(G.box(2.4, 1, 2.4), sand, { p: [0, 0.5, 0] }));
    for (const [px, pz] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [-1.2, 1.2],
      [1.2, 1.2],
    ]) {
      g.add(m(G.cyl(0.45, 0.5, 1.6, 10), sand, { p: [px, 0.8, pz] }));
      g.add(m(G.cone(0.55, 0.7, 10), sand, { p: [px, 1.95, pz] }));
    }
    g.add(m(G.cyl(0.03, 0.03, 1.2, 4), T(PAL.woodDark), { p: [0, 1.6, 0] }));
    g.add(m(G.box(0.02, 0.35, 0.55), T(PAL.red, { side: DoubleSide }), { p: [0, 2.0, 0.28] }));
    ctx.root.add(g);
    ctx.physics.box({ x, z, hx: 1.6, hz: 1.6, y0: y, y1: y + 1.0 });
    w.tokens.place('sandcastle', x, y + 2.4, z);
  }
  // starfish & shells
  for (let i = 0; i < 14; i++) {
    const x = -20 + Math.random() * 50;
    const z = 92 + Math.random() * 18;
    const y = w.heightAt(x, z);
    if (y < 0.2 || y > 1.8) continue;
    const c = [PAL.pink, PAL.gold, 0xf28c5a, PAL.cream][i % 4];
    ctx.root.add(m(G.cone(0.35, 0.12, 5), T(c), { p: [x, y + 0.04, z], r: [0, Math.random() * 6, 0], shadow: false }));
  }

  // ---------------- lighthouse
  buildLighthouse(w);
  tokenLine(w.tokens, 'beach-lh-', [-10, 92], [-44, 104], 6, w.heightAt.bind(w));
  w.pois.set('docks', new Vector3(PX, deckY, 121));
}

function buildLighthouse(w: World) {
  const ctx = w.ctx;
  const { x: LX, z: LZ, base, height } = LIGHTHOUSE;
  const topY = base + height;
  rock(ctx, LX + 7, LZ + 9, 2.5, 3);
  rock(ctx, LX - 8, LZ + 6, 3, 4);
  rock(ctx, LX - 4, LZ - 9, 2.2, 5);

  const g = grp(LX, base, LZ);
  const tower = m(new CylinderGeometry(2.7, 3.7, height, 28, 1), stripeMat('#d2402f', '#fbf0d4', 6, false), { p: [0, height / 2, 0] });
  g.add(tower);
  g.add(m(new CylinderGeometry(3.9, 4.1, 1, 28), T(PAL.stone), { p: [0, 0.4, 0] }));
  // door + porthole windows
  g.add(m(G.box(1.4, 2.4, 0.3), T(PAL.woodDark), { p: [0, 1.6, 3.55], r: [0.06, 0, 0] }));
  for (const hh of [7, 12.5, 17]) g.add(m(G.cyl(0.42, 0.42, 0.3, 14), T(0x3a4e6a, { gloss: true }), { p: [0, hh, 3.72 - hh / height], r: [Math.PI / 2 - 0.05, 0, 0] }));
  // balcony + railing
  g.add(m(new CylinderGeometry(5.3, 5.0, 0.45, 32), T(0x3a2e28), { p: [0, height + 0.05, 0] }));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.add(m(G.cyl(0.06, 0.06, 1.1, 5), T(0x3a2e28), { p: [Math.cos(a) * 5.1, height + 0.8, Math.sin(a) * 5.1] }));
  }
  g.add(m(G.torus(5.1, 0.08, 6, 48), T(0x3a2e28), { p: [0, height + 1.35, 0], r: [Math.PI / 2, 0, 0] }));
  // lamp room
  const glass = toonUnique(0x8fa6b3, { gloss: true, mottle: 0 });
  g.add(m(new CylinderGeometry(2.2, 2.2, 3.0, 16, 1, true), glass, { p: [0, height + 1.8, 0] }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(m(G.box(0.15, 3.0, 0.15), T(0x3a2e28), { p: [Math.cos(a) * 2.22, height + 1.8, Math.sin(a) * 2.22] }));
  }
  const lampMat = toonUnique(0x6c6a5c, { gloss: true });
  const lamp = m(G.sphere(1.1, 20, 14), lampMat, { p: [0, height + 1.8, 0] });
  g.add(lamp);
  g.add(m(new ConeGeometry(2.8, 2.2, 16), T(PAL.red, { gloss: true }), { p: [0, height + 4.4, 0] }));
  g.add(m(G.sphere(0.4, 12, 10), T(PAL.gold, { gloss: true }), { p: [0, height + 5.7, 0] }));
  g.userData.dynamic = false;
  ctx.root.add(g);
  ctx.physics.cyl({ x: LX, z: LZ, r: 3.6, y0: base - 1, y1: topY });
  ctx.physics.cyl({ x: LX, z: LZ, r: 5.3, y0: topY - 0.3, y1: topY + 0.25 });
  ctx.physics.cyl({ x: LX, z: LZ, r: 2.3, y0: topY + 0.25, y1: topY + 3.5 });

  // the lit beacon: glow + two sweeping beams
  const beams = new Group();
  beams.position.set(LX, topY + 1.8, LZ);
  beams.visible = false;
  beams.userData.dynamic = true;
  const beamMat = patchUnlit(
    new MeshBasicMaterial({ color: 0xfff0b8, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    'keep',
  );
  for (const s of [1, -1]) {
    const b = new Mesh(new ConeGeometry(4, 60, 20, 1, true), beamMat);
    b.rotation.z = (s * Math.PI) / 2;
    b.position.x = s * 30;
    beams.add(b);
  }
  const glow = makeGlowSprite(0xffe08a, 16);
  beams.add(glow);
  ctx.root.add(beams);

  // ---------------- spiral stairs (the Baron's storm knocked out the upper steps)
  const R = LIGHTHOUSE.stairR;
  const rise = 0.3;
  const dA = 0.2;
  const a0 = 0.15;
  const steps: Array<{ x: number; z: number; y: number; yaw: number }> = [];
  const n = Math.round(height / rise);
  for (let i = 0; i < n; i++) {
    const broken = i >= 34 && i % 3 !== 0;
    if (broken) continue;
    const a = a0 + i * dA;
    const x = LX + Math.cos(a) * R;
    const z = LZ + Math.sin(a) * R;
    const y = base + rise * (i + 1);
    steps.push({ x, z, y, yaw: -a });
  }
  const stepGeo = G.box(1.9, 0.32, 1.25);
  const stepMesh = new InstancedMesh(stepGeo, T(0xb9824c), steps.length);
  stepMesh.castShadow = true;
  stepMesh.receiveShadow = true;
  const mat4 = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  steps.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    mat4.compose(new Vector3(s.x, s.y - 0.16, s.z), q, new Vector3(1, 1, 1));
    stepMesh.setMatrixAt(i, mat4);
    ctx.physics.box({ x: s.x, z: s.z, yaw: s.yaw, hx: 0.95, hz: 0.62, y0: s.y - 0.35, y1: s.y });
  });
  stepMesh.userData.dynamic = true;
  ctx.root.add(stepMesh);
  // tokens up the stairs
  for (const i of [8, 20, 33, 42, 51, 60]) {
    const a = a0 + i * dA;
    w.tokens.place(`lh-stair-${i}`, LX + Math.cos(a) * R, base + rise * (i + 1) + 1.2, LZ + Math.sin(a) * R);
  }

  // the reel waits on the balcony once the lamp is lit
  const reel = new Reel('lighthouse', 'The Lighthouse Reel');
  reel.position.set(LX + 3.8, topY + 0.25, LZ + 0.8);
  w.reels.set('lighthouse', reel);

  const flash = new Vector3(LX, topY + 1.8, LZ);
  w.interactables.push({
    id: 'lamp',
    pos: new Vector3(LX, topY, LZ),
    radius: 5.2,
    yRange: [-0.5, 3],
    label: () => 'Light the lamp',
    enabled: () => !w.lighthouseLit,
    act: () => {
      w.lighthouseLit = true;
      lightLamp();
      w.fx.burst('spark', flash, 40, 9, { up: 0.3 });
      w.fx.burst('star', flash, 12, 7);
      w.emit({ type: 'lamp-lit' });
    },
  });
  const lightLamp = () => {
    lampMat.color.set(0xfff4c4);
    lampMat.emissive.set(0xffd36b);
    lampMat.emissiveIntensity = 1.4;
    glass.color.set(0xfff0b0);
    glass.emissive.set(0xffd36b);
    glass.emissiveIntensity = 0.35;
    beams.visible = true;
  };
  w.updaters.push((_dt, t) => {
    if (beams.visible) beams.rotation.y = t * 0.6;
  });
  w.restoreLamp = lightLamp;

  const plaque = sign('OLD BLINKY', 2.6, 0.6, '#fbf0d4');
  plaque.position.set(LX, base + 3.4, LZ + 3.62);
  ctx.root.add(plaque);
  w.pois.set('lighthouse', new Vector3(LX, base, LZ));
}
