import { CylinderGeometry, DoubleSide, Group, Mesh, PlaneGeometry, Vector3 } from 'three';
import type { World } from '../World';
import { G, T, alive, grp, m } from '../kit';
import { bunting, crate, lampPost, sign, stripeMat, tent } from '../props';
import { PAL, toon, toonUnique } from '../../render/materials';
import { Reel, tokenArc, tokenLine, tokenRing } from '../Collectibles';
import { NPC } from '../../npc/NPC';
import { kernelKid, kettlecorn, tess } from '../../npc/characters';
import { FaceRig } from '../../render/faces';
import type { NPCBuild } from '../../npc/NPC';

export const FERRIS = { x: 106, z: -14, hubH: 17, R: 14, speed: 0.17, cars: 10 };
export const BIGTOP = { x: 84, z: -74, r: 15 };

export function buildCarnival(w: World) {
  const ctx = w.ctx;
  const gy = w.heightAt(86, 4);

  // ---------------- entrance arch
  {
    const x = 54;
    const z = 4;
    const y = w.heightAt(x, z);
    const g = grp(x, y, z, Math.PI / 2);
    for (const sx of [-6, 6]) {
      g.add(m(G.cyl(0.6, 0.75, 9, 16), stripeMat('#d2402f', '#fbf0d4', 10), { p: [sx, 4.5, 0] }));
      g.add(m(G.sphere(0.9, 16, 12), T(PAL.gold, { gloss: true }), { p: [sx, 9.4, 0] }));
    }
    g.add(m(G.box(13, 2.2, 0.5), T(PAL.red, { gloss: true }), { p: [0, 8.2, 0] }));
    const s = sign('MIDWAY CARNIVAL', 11.5, 1.6, '#f2b83b', '#1d140f');
    s.position.set(0, 8.2, 0.27);
    g.add(s);
    const s2 = s.clone();
    s2.rotation.y = Math.PI;
    s2.position.z = -0.27;
    g.add(s2);
    for (let i = 0; i < 11; i++) g.add(m(G.sphere(0.2, 8, 6), toon(0xfff1b3, { emissive: 0xffc35a, emissiveIntensity: 0.8 }), { p: [-5 + i, 9.45, 0.3], shadow: false }));
    ctx.root.add(g);
    ctx.physics.cyl({ x, z: z - 6, r: 0.8, y0: y, y1: y + 9 });
    ctx.physics.cyl({ x, z: z + 6, r: 0.8, y0: y, y1: y + 9 });
  }

  // ---------------- tents
  const tents: Array<[number, number, number, number, string, string]> = [
    [100, 24, 4.6, 3.4, '#d2402f', '#fbf0d4'],
    [116, 6, 3.6, 3.0, '#3d8f94', '#fbf0d4'],
    [64, -16, 4.0, 3.2, '#8a6bb0', '#f2b83b'],
    [100, 36, 3.2, 2.6, '#d2402f', '#f2b83b'],
    [118, -36, 3.4, 2.8, '#3d8f94', '#f2b83b'],
  ];
  const flags: Mesh[] = [];
  for (const [x, z, r, h, a, b] of tents) {
    const t = tent(ctx, x, z, r, h, a, b);
    flags.push(t.flag);
  }
  w.updaters.push((_dt, t) => {
    flags.forEach((f, i) => {
      f.rotation.y = Math.sin(t * 3 + i) * 0.4;
      f.scale.x = 1 + Math.sin(t * 6 + i) * 0.08;
    });
  });

  // ---------------- lamps + bunting across the midway
  const poles: Vector3[] = [];
  for (const [x, z] of [
    [64, 12],
    [64, -6],
    [84, 20],
    [86, -10],
    [104, 14],
    [102, -2],
  ]) {
    lampPost(ctx, x, z, 0);
    poles.push(new Vector3(x, w.heightAt(x, z) + 4.4, z));
  }
  bunting(ctx.root, poles[0], poles[2], 12, 1.4);
  bunting(ctx.root, poles[1], poles[3], 12, 1.4);
  bunting(ctx.root, poles[2], poles[4], 12, 1.4);
  bunting(ctx.root, poles[3], poles[5], 12, 1.4);
  bunting(ctx.root, poles[0], poles[1], 10, 1.0);

  buildFerris(w);
  buildCarousel(w, 74, 26);
  buildStrength(w, 70, -2);

  // ---------------- Madame Kettlecorn's popcorn cart
  const k = new NPC('kettlecorn', 'Madame Kettlecorn', 260, kettlecorn(), -Math.PI / 2);
  k.position.set(80, w.heightAt(80, -6), -6);
  ctx.root.add(k);
  w.npcs.set('kettlecorn', k);
  const popReel = new Reel('popcorn', 'The Popcorn Reel');
  popReel.position.set(75.5, gy, -6);
  w.reels.set('popcorn', popReel);
  ctx.physics.box({ x: 80, z: -6, yaw: -Math.PI / 2, hx: 1.25, hz: 0.8, y0: gy, y1: gy + 1.85 });

  // ---------------- balloon seller's bouquet
  {
    const x = 92;
    const z = 12;
    const y = w.heightAt(x, z);
    const g = grp(x, y, z);
    g.add(m(G.cyl(0.1, 0.12, 2.2, 8), T(PAL.woodDark), { p: [0, 1.1, 0] }));
    const cols = [PAL.red, PAL.gold, PAL.teal, PAL.pink, PAL.purple, PAL.cream, PAL.blue];
    const balloons: Group[] = [];
    for (let i = 0; i < 9; i++) {
      const b = new Group();
      b.userData.dynamic = true;
      const a = (i / 9) * Math.PI * 2;
      const r = 0.6 + (i % 3) * 0.35;
      b.position.set(Math.cos(a) * r, 4.4 + (i % 4) * 0.5, Math.sin(a) * r);
      b.add(m(G.sphere(0.55, 16, 12), toon(cols[i % cols.length], { gloss: true }), { s: [1, 1.18, 1] }));
      b.add(m(G.cone(0.12, 0.18, 6), toon(cols[i % cols.length]), { p: [0, -0.68, 0], r: [Math.PI, 0, 0] }));
      const strLen = b.position.y - 2.2;
      const str = m(G.cyl(0.015, 0.015, 1, 3), T(0x3a2e28), { shadow: false });
      str.scale.y = strLen;
      str.position.set(-b.position.x / 2, -strLen / 2 - 0.4, -b.position.z / 2);
      str.lookAt(new Vector3(0, -100, 0));
      b.add(str);
      g.add(b);
      balloons.push(b);
    }
    g.userData.dynamic = true;
    ctx.root.add(g);
    ctx.physics.cyl({ x, z, r: 0.3, y0: y, y1: y + 2.2 });
    w.updaters.push((_dt, t) => balloons.forEach((b, i) => (b.position.y = 4.4 + (i % 4) * 0.5 + Math.sin(t * 1.5 + i) * 0.15)));
  }

  // ---------------- lost kernel kids
  const kidSpots: Array<[string, Vector3 | null]> = [
    ['kid-tent', new Vector3(121, w.heightAt(121, 7), 7)],
    ['kid-carousel', null], // rides the carousel; placed by buildCarousel
    ['kid-crates', null],
  ];
  // crate stack under the Ferris wheel
  let top = crate(ctx, 94, null, -24, 1.6, 0.2);
  crate(ctx, 96, null, -26.2, 1.6, 0.1);
  top = crate(ctx, 96, top - 0.0, -26.2, 1.4, 0.4);
  top = crate(ctx, 94.4, top, -27.8, 1.3, 0.7);
  kidSpots[2][1] = new Vector3(94.4, top, -27.8);
  const homes = [new Vector3(78, gy, -9), new Vector3(79.6, gy, -9.4), new Vector3(81.2, gy, -9)];
  kidSpots.forEach(([id, p], i) => {
    const npc = new NPC(id, 'Kernel Kid', 520 + i * 40, kernelKid() as NPCBuild, Math.random() * 6);
    npc.talkRadius = 0;
    if (p) npc.position.copy(p);
    if (id === 'kid-carousel') w.carouselSeat?.add(npc);
    else ctx.root.add(npc);
    w.npcs.set(id, npc);
    w.kids.push({ id, npc, found: false, home: homes[i], hopT: -1, from: new Vector3() });
  });

  // ---------------- tokens
  tokenLine(w.tokens, 'mid-a-', [60, 4], [80, 4], 6, w.heightAt.bind(w));
  tokenLine(w.tokens, 'mid-b-', [88, 6], [104, -6], 5, w.heightAt.bind(w));
  tokenRing(w.tokens, 'mid-tent-', 100, gy + 8.2, 24, 2.2, 4);
  tokenArc(w.tokens, 'mid-c-', new Vector3(104, gy + 1, 18), new Vector3(112, gy + 1, 30), 4, 3);

  // ---------------- big top + ticket booth
  buildBigTop(w);
  w.pois.set('carnival', new Vector3(86, gy, 4));
}

// ------------------------------------------------------------------ Ferris wheel ("Wheely")
function buildFerris(w: World) {
  const ctx = w.ctx;
  const { x: FX, z: FZ, hubH, R, cars } = FERRIS;
  const gy = w.heightAt(FX, FZ);
  const hubY = gy + hubH;
  const iron = T(0xd8c8a6, { gloss: true });
  const red = T(PAL.red, { gloss: true });
  // A-frame supports
  for (const sz of [-3.2, 3.2])
    for (const sx of [-1, 1]) {
      const leg = m(G.cyl(0.35, 0.5, hubH + 2, 10), T(0x8a7a66), { p: [FX + sx * 5.2, gy + hubH / 2, FZ + sz] });
      leg.rotation.z = sx * 0.3;
      ctx.root.add(leg);
      ctx.physics.cyl({ x: FX + sx * 7.5, z: FZ + sz, r: 0.6, y0: gy, y1: gy + 3 });
    }
  ctx.root.add(m(G.cyl(0.5, 0.5, 7, 12), T(0x8a7a66), { p: [FX, hubY, FZ], r: [Math.PI / 2, 0, 0] }));

  const wheel = new Group();
  wheel.position.set(FX, hubY, FZ);
  wheel.userData.dynamic = true;
  for (const sz of [-1.6, 1.6]) {
    wheel.add(m(G.torus(R, 0.28, 8, 64), iron, { p: [0, 0, sz] }));
    wheel.add(m(G.torus(R * 0.55, 0.18, 8, 48), red, { p: [0, 0, sz] }));
    for (let i = 0; i < cars * 2; i++) {
      const a = (i / (cars * 2)) * Math.PI * 2;
      const spoke = m(G.cyl(0.1, 0.1, R, 6), iron, { p: [(Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, sz], r: [0, 0, a - Math.PI / 2] });
      wheel.add(spoke);
    }
  }
  for (let i = 0; i < cars; i++) {
    const a = (i / cars) * Math.PI * 2;
    wheel.add(m(G.cyl(0.12, 0.12, 3.4, 6), iron, { p: [Math.cos(a) * R, Math.sin(a) * R, 0], r: [Math.PI / 2, 0, 0] }));
    wheel.add(m(G.sphere(0.32, 10, 8), toon(0xfff1b3, { emissive: 0xffc35a, emissiveIntensity: 0.7 }), { p: [Math.cos(a + 0.31) * R, Math.sin(a + 0.31) * R, 1.75], shadow: false }));
  }
  // hub face: Wheely
  const face = new FaceRig('decal', { eyes: 'pie', mouth: 'grin', cheeks: true, brows: 'up' }, '#f2b83b');
  wheel.add(m(G.cyl(2.3, 2.3, 0.6, 32), T(PAL.gold, { gloss: true }), { p: [0, 0, 1.9], r: [Math.PI / 2, 0, 0] }));
  const facePlane = new Mesh(new PlaneGeometry(3.6, 3.6), toonUnique(0xffffff, { map: face.texture, alphaTest: 0.5, mottle: 0 }));
  facePlane.position.z = 2.25;
  const hubFace = new Group();
  hubFace.position.set(FX, hubY, FZ);
  hubFace.add(facePlane);
  hubFace.userData.dynamic = true;
  ctx.root.add(wheel, hubFace);

  // gondolas (rideable moving platforms)
  const carCols = [PAL.red, PAL.gold, PAL.teal, PAL.pink, PAL.blue];
  const gondolas: Array<{ g: Group; col: ReturnType<typeof ctx.physics.box>; a: number }> = [];
  for (let i = 0; i < cars; i++) {
    const g = new Group();
    g.userData.dynamic = true;
    const c = T(carCols[i % carCols.length], { gloss: true });
    g.add(m(G.box(2.8, 1.1, 2.4), c, { p: [0, -2.05, 0] }));
    g.add(m(G.box(3.0, 0.16, 2.6), T(PAL.cream), { p: [0, -1.48, 0] }));
    g.add(m(G.cyl(0.08, 0.08, 1.4, 6), iron, { p: [0, -0.7, 0] }));
    g.add(m(G.box(3.0, 0.2, 2.6), c, { p: [0, -0.05, 0] }));
    g.add(m(G.cyl(0.04, 0.04, 1.4, 4), iron, { p: [-1.35, -0.75, 1.15] }));
    g.add(m(G.cyl(0.04, 0.04, 1.4, 4), iron, { p: [1.35, -0.75, -1.15] }));
    ctx.root.add(g);
    const col = ctx.physics.box({ x: FX, z: FZ, hx: 1.4, hz: 1.2, y0: 0, y1: 1, dynamic: true });
    gondolas.push({ g, col, a: (i / cars) * Math.PI * 2 });
  }
  const place = (t: number) => {
    const rot = t * FERRIS.speed;
    wheel.rotation.z = rot;
    for (const gd of gondolas) {
      const a = gd.a + rot;
      const x = FX + Math.cos(a) * R;
      const y = hubY + Math.sin(a) * R;
      gd.g.position.set(x, y, FZ);
      gd.g.rotation.z = Math.sin(t * 1.3 + gd.a) * 0.03;
      gd.col.x = x;
      gd.col.z = FZ;
      gd.col.y1 = y - 1.48 + 0.08;
      gd.col.y0 = y - 2.6;
    }
  };
  place(0);
  w.updaters.push((_dt, t) => place(t));

  // the reel hangs at the very top of the wheel
  const reel = new Reel('ferris', 'The Ferris Wheel Reel');
  reel.position.set(FX, hubY + R - 0.2, FZ);
  w.reels.set('ferris', reel);
  reel.reveal(true);

  // Wheely talks from a little operator booth out front
  const booth: NPCBuild = (() => {
    const body = new Group();
    body.add(m(G.box(1.2, 1.3, 1.0), T(PAL.red, { gloss: true }), { p: [0, 0.65, 0] }));
    body.add(m(G.box(1.35, 0.12, 1.15), T(PAL.gold, { gloss: true }), { p: [0, 1.36, 0] }));
    const lever = new Group();
    lever.userData.dynamic = true;
    lever.position.set(0.3, 1.4, 0);
    lever.add(m(G.cyl(0.05, 0.05, 0.9, 6), T(0x2e2622), { p: [0, 0.45, 0] }));
    lever.add(m(G.sphere(0.14, 10, 8), T(PAL.red, { gloss: true }), { p: [0, 0.92, 0] }));
    lever.rotation.z = -0.3;
    body.add(lever);
    const s = sign('ASK WHEELY', 1.6, 0.4, '#f2b83b');
    s.position.set(0, 0.8, 0.51);
    body.add(s);
    return {
      body,
      face,
      top: 2.4,
      animate: (_dt: number, t: number, talking: boolean) => {
        lever.rotation.z = -0.3 + (talking ? Math.sin(t * 6) * 0.25 : 0);
      },
    };
  })();
  const wheely = new NPC('wheely', 'Wheely', 120, booth, Math.PI);
  wheely.turnToPlayer = false;
  const bx = FX - 9;
  const bz = FZ + 7;
  wheely.position.set(bx, w.heightAt(bx, bz), bz);
  ctx.root.add(wheely);
  w.npcs.set('wheely', wheely);
  ctx.physics.box({ x: bx, z: bz, hx: 0.6, hz: 0.5, y0: gy, y1: gy + 1.4 });
  w.pois.set('ferris', new Vector3(FX, hubY + R, FZ));
}

// ------------------------------------------------------------------ carousel
function buildCarousel(w: World, cx: number, cz: number) {
  const ctx = w.ctx;
  const gy = w.heightAt(cx, cz);
  const R = 7;
  const base = new Group();
  base.position.set(cx, gy, cz);
  base.userData.dynamic = true;
  base.add(m(new CylinderGeometry(R, R + 0.2, 0.7, 40), T(PAL.cream), { p: [0, 0.35, 0] }));
  base.add(m(G.torus(R + 0.1, 0.18, 8, 48), T(PAL.gold, { gloss: true }), { p: [0, 0.7, 0], r: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    base.add(m(G.box(0.5, 0.05, 2), T(i % 2 ? PAL.red : PAL.cream), { p: [Math.cos(a) * (R - 1.2), 0.72, Math.sin(a) * (R - 1.2)], r: [0, -a, 0], shadow: false }));
  }
  base.add(m(G.cyl(1.0, 1.1, 8.5, 16), stripeMat('#d2402f', '#f2b83b', 8), { p: [0, 4.6, 0] }));
  base.add(m(new CylinderGeometry(0.3, R + 0.9, 2.6, 32, 1), stripeMat('#d2402f', '#fbf0d4', 16), { p: [0, 9.9, 0] }));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    base.add(m(G.sphere(0.55, 10, 8), T(i % 2 ? PAL.red : PAL.gold), { p: [Math.cos(a) * (R + 0.85), 8.5, Math.sin(a) * (R + 0.85)], s: [1, 0.6, 0.5], r: [0, -a, 0] }));
  }
  base.add(m(G.sphere(0.6, 12, 10), T(PAL.gold, { gloss: true }), { p: [0, 11.4, 0] }));
  // horses on poles
  const horses: Array<{ g: Group; a: number; col: ReturnType<typeof ctx.physics.box> }> = [];
  const horseCols = [0xfffaf0, 0x3a2e28, 0xf2c7c7, 0xc9dfe8];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const pole = m(G.cyl(0.08, 0.08, 7.8, 6), T(PAL.brass, { gloss: true }), { p: [Math.cos(a) * 4.8, 4.6, Math.sin(a) * 4.8] });
    base.add(pole);
    const h = new Group();
    h.userData.dynamic = true;
    h.position.set(Math.cos(a) * 4.8, 2.4, Math.sin(a) * 4.8);
    h.rotation.y = -a;
    const hc = T(horseCols[i % 4], { gloss: true });
    h.add(m(G.sphere(0.7, 16, 12), hc, { s: [0.7, 0.75, 1.35] }));
    h.add(m(G.sphere(0.4, 12, 10), hc, { p: [0, 0.75, 0.9], s: [0.7, 1.0, 1.1] }));
    h.add(m(G.box(0.3, 0.6, 0.15), T(PAL.red), { p: [0, 0.9, 0.6] }));
    h.add(m(G.box(0.7, 0.12, 0.8), T(PAL.red, { gloss: true }), { p: [0, 0.55, 0] }));
    for (const [lx, lz] of [
      [-0.3, 0.6],
      [0.3, 0.6],
      [-0.3, -0.6],
      [0.3, -0.6],
    ])
      h.add(m(G.cyl(0.09, 0.07, 0.9, 6), hc, { p: [lx, -0.7, lz], r: [lz > 0 ? -0.5 : 0.5, 0, 0] }));
    base.add(h);
    const col = ctx.physics.box({ x: cx, z: cz, hx: 0.45, hz: 0.7, y0: 0, y1: 0, dynamic: true, oneWay: true });
    horses.push({ g: h, a, col });
  }
  ctx.root.add(base);
  // the carousel seat for a hiding kernel kid (child of horse 3)
  const seat = new Group();
  seat.position.set(0, 0.6, -0.1);
  horses[3].g.add(seat);
  w.carouselSeat = seat;

  const plat = ctx.physics.cyl({ x: cx, z: cz, r: R + 0.1, y0: gy, y1: gy + 0.72, dynamic: true });
  ctx.physics.cyl({ x: cx, z: cz, r: 1.1, y0: gy, y1: gy + 9 });
  const speed = 0.45;
  w.updaters.push((_dt, t) => {
    const rot = t * speed;
    base.rotation.y = rot;
    plat.yaw = rot;
    horses.forEach((h, i) => {
      const bob = Math.sin(t * 2.2 + i * 1.3) * 0.55;
      h.g.position.y = 2.6 + bob;
      // world position of the saddle (rotate local around the axis)
      const a = h.a;
      const lx = Math.cos(a) * 4.8;
      const lz = Math.sin(a) * 4.8;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      h.col.x = cx + lx * cs + lz * sn;
      h.col.z = cz - lx * sn + lz * cs;
      h.col.yaw = rot - a;
      h.col.y1 = gy + 2.6 + bob + 0.62;
      h.col.y0 = h.col.y1 - 0.3;
    });
  });
  tokenRing(w.tokens, 'carousel-', cx, gy + 4.6, cz, 4.8, 6);
  void alive;
}

// ------------------------------------------------------------------ test-your-strength bell
function buildStrength(w: World, x: number, z: number) {
  const ctx = w.ctx;
  const gy = w.heightAt(x, z);
  const g = grp(x, gy, z, -Math.PI / 2);
  g.add(m(G.box(3, 0.5, 3), T(PAL.woodDark), { p: [0, 0.25, 0] }));
  const pad = m(G.cyl(1.1, 1.2, 0.35, 20), T(PAL.red, { gloss: true }), { p: [0, 0.6, 0], dynamic: true });
  g.add(pad);
  g.add(m(G.box(0.5, 15, 0.5), T(0xfbf0d4), { p: [0, 7.5, -1.3] }));
  for (let i = 0; i < 7; i++) g.add(m(G.box(0.7, 0.18, 0.1), T([PAL.red, PAL.gold, PAL.teal][i % 3]), { p: [0, 2 + i * 1.8, -1.0], shadow: false }));
  const bell = new Group();
  bell.position.set(0, 14.8, -0.7);
  bell.add(m(new CylinderGeometry(0.4, 0.95, 1.2, 20, 1, true), T(PAL.gold, { gloss: true, side: DoubleSide })));
  bell.add(m(G.sphere(0.25, 10, 8), T(PAL.brass), { p: [0, -0.55, 0] }));
  bell.userData.dynamic = true;
  g.add(bell);
  const s = sign('TEST YOUR STRENGTH', 4.2, 0.7, '#f2b83b');
  s.position.set(0, 2.2, -1.0);
  g.add(s);
  ctx.root.add(g);
  ctx.physics.box({ x, z, hx: 1.5, hz: 1.5, y0: gy, y1: gy + 0.5 });
  ctx.physics.cyl({ x, z, r: 1.1, y0: gy + 0.4, y1: gy + 0.78, bounce: 31, tag: 'strength' });
  ctx.physics.box({ x: x + 1.3, z, hx: 0.3, hz: 0.3, y0: gy, y1: gy + 15 });

  const bellWorld = new Vector3(x + 0.7, gy + 14.8, z);
  let swing = 0;
  const ringBell = () => {
    swing = 1;
    const first = !w.bellRung;
    w.bellRung = true;
    w.emit({ type: 'bell-rung', first });
    w.fx.burst('star', bellWorld, 14, 8);
    if (first) w.tokens.reveal('bell-');
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    w.tokens.place(`bell-${i}`, x - 1 + Math.cos(a) * 2.6, gy + 1.5 + i * 0.35, z + Math.sin(a) * 2.6, true);
  }
  w.restoreBell = () => w.tokens.reveal('bell-');
  let cooldown = 0;
  w.updaters.push((dt, t, _b, p) => {
    cooldown -= dt;
    swing *= Math.exp(-dt * 2);
    bell.rotation.z = Math.sin(t * 18) * 0.5 * swing;
    pad.scale.y = 1 + Math.sin(t * 8) * 0.04;
    if (cooldown <= 0 && Math.hypot(p.x - bellWorld.x, p.z - bellWorld.z) < 2.2 && p.y + 1.9 > bellWorld.y - 0.9 && p.y < bellWorld.y + 0.8) {
      cooldown = 1.2;
      ringBell();
    }
  });
}

// ------------------------------------------------------------------ the Big Top + Tess
function buildBigTop(w: World) {
  const ctx = w.ctx;
  const { x, z, r } = BIGTOP;
  const gy = w.heightAt(x, z);
  const g = grp(x, gy, z);
  const wallH = 8;
  g.add(m(new CylinderGeometry(r, r + 0.3, wallH, 48, 1, true), stripeMat('#d2402f', '#fbf0d4', 24), { p: [0, wallH / 2, 0] }));
  g.add(m(new CylinderGeometry(0.5, r + 1.6, 12, 48, 1), stripeMat('#d2402f', '#fbf0d4', 24), { p: [0, wallH + 6, 0] }));
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    g.add(m(G.sphere(1.1, 10, 8), T(i % 2 ? PAL.gold : PAL.red), { p: [Math.cos(a) * (r + 1.5), wallH + 0.1, Math.sin(a) * (r + 1.5)], s: [1, 0.55, 0.45], r: [0, -a, 0] }));
  }
  g.add(m(G.cyl(0.18, 0.18, 6, 8), T(0x3a2e28), { p: [0, wallH + 14.5, 0] }));
  const flag = m(new PlaneGeometry(3.2, 1.8), T(PAL.gold, { side: DoubleSide }), { p: [1.6, wallH + 16.6, 0], dynamic: true });
  g.add(flag);
  // entrance portal with curtains
  const door = new Group();
  door.position.set(0, 0, r - 0.2);
  door.add(m(G.box(7, 7.4, 1.6), T(PAL.gold, { gloss: true }), { p: [0, 3.7, 0.5] }));
  const curtainL = m(G.box(2.7, 6.2, 0.3), T(0x9e2a22), { p: [-1.35, 3.1, 1.4], dynamic: true });
  const curtainR = m(G.box(2.7, 6.2, 0.3), T(0x9e2a22), { p: [1.35, 3.1, 1.4], dynamic: true });
  door.add(curtainL, curtainR);
  const s = sign('THE BIG TOP', 6, 1.2, '#d2402f', '#fbf0d4');
  s.position.set(0, 8.2, 1.35);
  door.add(s);
  const s2 = sign('CLOSED BY ORDER OF THE BARON', 5.2, 0.6, '#1d140f', '#f2b83b');
  s2.position.set(0, 1.0, 1.58);
  s2.userData.dynamic = true;
  door.add(s2);
  g.add(door);
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r: r + 0.3, y0: gy, y1: gy + wallH + 6 });
  ctx.physics.box({ x, z: z + r + 0.6, hx: 3.5, hz: 1.0, y0: gy, y1: gy + 7.4 });
  w.updaters.push((_dt, t) => {
    flag.rotation.y = Math.sin(t * 2.4) * 0.35;
    curtainL.rotation.y = Math.sin(t * 1.3) * 0.02;
    curtainR.rotation.y = -Math.sin(t * 1.2) * 0.02;
  });
  w.openBigTop = () => {
    curtainL.position.x = -3.1;
    curtainR.position.x = 3.1;
    curtainL.scale.x = 0.45;
    curtainR.scale.x = 0.45;
    s2.visible = false;
  };

  // ticket booth
  const bx = x - 9;
  const bz = z + r + 5;
  const by = w.heightAt(bx, bz);
  const booth = grp(bx, by, bz, 0.35);
  booth.add(m(G.box(3.4, 3.2, 3), T(PAL.red, { gloss: true }), { p: [0, 1.6, -1.6] }));
  booth.add(m(G.box(3.8, 0.4, 3.4), T(PAL.gold, { gloss: true }), { p: [0, 3.4, -1.6] }));
  booth.add(m(new CylinderGeometry(0.2, 2.6, 1.4, 4), T(PAL.red, { gloss: true }), { p: [0, 4.3, -1.6], r: [0, Math.PI / 4, 0] }));
  const ts = sign('TICKETS', 2.6, 0.6, '#f2b83b');
  ts.position.set(0, 2.7, -0.08);
  booth.add(ts);
  ctx.root.add(booth);
  ctx.physics.box({ x: bx - Math.sin(0.35) * 1.6, z: bz - Math.cos(0.35) * 1.6, yaw: 0.35, hx: 1.7, hz: 1.5, y0: by, y1: by + 3.4 });
  const t = new NPC('tess', 'Tess the Ticket', 300, tess(), 0.35);
  t.position.set(bx + 0.4, by, bz + 0.6);
  ctx.root.add(t);
  w.npcs.set('tess', t);
  tokenLine(w.tokens, 'bt-', [84, -24], [84, -50], 6, w.heightAt.bind(w));
  w.pois.set('bigtop', new Vector3(x, gy, z + r + 3));
}
