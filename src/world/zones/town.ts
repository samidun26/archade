import { CylinderGeometry, Group, Vector3 } from 'three';
import type { World } from '../World';
import { G, T, grp, m } from '../kit';
import { bench, bunting, flowerPatch, house, lampPost, sign, signpost } from '../props';
import { PAL, toon } from '../../render/materials';
import { tokenLine, tokenRing } from '../Collectibles';
import { NPC } from '../../npc/NPC';
import { mayor, mort, penny } from '../../npc/characters';

const DEG = Math.PI / 180;

export function buildTown(w: World) {
  const ctx = w.ctx;
  const y0 = w.heightAt(0, 0);

  // ---------------- fountain with an empty film-reel statue (the reels are missing!)
  const stone = T(0xd8c8a6);
  const stoneDark = T(0xb3a07c);
  const f = grp(0, y0, 0);
  f.add(m(new CylinderGeometry(3.7, 3.9, 0.9, 32), stone, { p: [0, 0.45, 0] }));
  f.add(m(G.torus(3.7, 0.22, 8, 40), stoneDark, { p: [0, 0.92, 0], r: [Math.PI / 2, 0, 0] }));
  const water = m(new CylinderGeometry(3.45, 3.45, 0.1, 32), toon(0x6fc0c4, { gloss: true, mottle: 0.3 }), { p: [0, 0.82, 0] });
  f.add(water);
  f.add(m(G.cyl(0.55, 0.75, 6.6, 16), stone, { p: [0, 3.6, 0] }));
  f.add(m(new CylinderGeometry(1.5, 0.45, 0.7, 24), stone, { p: [0, 6.9, 0] }));
  f.add(m(G.torus(1.5, 0.14, 8, 28), stoneDark, { p: [0, 7.25, 0], r: [Math.PI / 2, 0, 0] }));
  const statue = new Group();
  statue.position.y = 8.9;
  statue.add(m(G.torus(1.1, 0.2, 10, 32), toon(PAL.brass, { gloss: true })));
  for (let i = 0; i < 3; i++)
    statue.add(m(G.box(0.18, 2.1, 0.18), toon(PAL.brass, { gloss: true }), { r: [0, 0, (i * Math.PI) / 3] }));
  statue.add(m(G.cyl(0.3, 0.3, 0.3, 14), toon(PAL.brass, { gloss: true }), { r: [Math.PI / 2, 0, 0] }));
  statue.userData.dynamic = true;
  f.add(statue);
  ctx.root.add(f);
  ctx.physics.cyl({ x: 0, z: 0, r: 3.9, y0, y1: y0 + 0.95 });
  ctx.physics.cyl({ x: 0, z: 0, r: 0.75, y0, y1: y0 + 6.6 });
  ctx.physics.cyl({ x: 0, z: 0, r: 1.5, y0: y0 + 6.6, y1: y0 + 7.3 });
  const spray = new Vector3(0, y0 + 7.4, 0);
  const tmp = new Vector3();
  let sprayAcc = 0;
  w.updaters.push((dt, t) => {
    statue.rotation.y = t * 0.5;
    sprayAcc += dt;
    while (sprayAcc > 0.06) {
      sprayAcc -= 0.06;
      const a = Math.random() * Math.PI * 2;
      tmp.set(Math.cos(a) * 2.2, 3.5 + Math.random(), Math.sin(a) * 2.2);
      w.fx.emit('splash', spray, tmp, { size: 0.22, life: 0.85, color: 0xd9f1ef });
    }
  });
  tokenRing(w.tokens, 'town-ring-', 0, y0 + 1.6, 0, 6, 8);
  w.tokens.place('town-statue', 0, y0 + 10.6, 0);

  // ---------------- houses around the plaza
  const houses: Array<[number, number, number, number, 'happy' | 'sleepy' | 'surprised', string]> = [
    [30, 0xf6d7b0, PAL.red, 0, 'happy', '#3d8f94'],
    [55, 0xf2c7c7, 0x5a6fa8, 1, 'sleepy', '#8a6bb0'],
    [125, 0xd9e8c4, PAL.red, 2, 'happy', '#d2402f'],
    [152, 0xf5e1a4, 0x7a4a29, 3, 'surprised', '#3d8f94'],
    [-152, 0xc9dfe8, 0xb5533a, 4, 'happy', '#f2b83b'],
    [-128, 0xf6d7b0, 0x3d8f94, 5, 'sleepy', '#d2402f'],
    [-58, 0xe8d0f0, PAL.red, 6, 'happy', '#3d8f94'],
    [-32, 0xf5e1a4, 0x5a6fa8, 7, 'surprised', '#8a6bb0'],
  ];
  for (const [deg, wall, roof, seed, mood, shutter] of houses) {
    const a = deg * DEG;
    const r = 30 + (seed % 2) * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const yaw = Math.atan2(-x, -z);
    house(ctx, x, z, yaw, { wall, roof, mood, seed, shutter, w: 6 + (seed % 3), h: 5 + (seed % 2) * 1.2 });
  }

  // ---------------- lamp posts, benches, bunting
  const lampAngles = [20, 68, 112, 160, 200, 248, 292, 340];
  const lampPos: Vector3[] = [];
  for (const deg of lampAngles) {
    const a = deg * DEG;
    const x = Math.cos(a) * 19.2;
    const z = Math.sin(a) * 19.2;
    lampPost(ctx, x, z, Math.atan2(-x, -z) + Math.PI / 2);
    lampPos.push(new Vector3(x, w.heightAt(x, z) + 4.4, z));
  }
  for (let i = 0; i < lampPos.length; i++) {
    const a = lampPos[i];
    const b = lampPos[(i + 1) % lampPos.length];
    if (i % 2 === 0) bunting(ctx.root, a, b, 10, 1.1);
  }
  for (const deg of [44, 136, 224, 316]) {
    const a = deg * DEG;
    const x = Math.cos(a) * 15;
    const z = Math.sin(a) * 15;
    bench(ctx, x, z, Math.atan2(-x, -z));
  }
  flowerPatch(ctx.root, w.terrain, 22, 18, 3, 16, 11);
  flowerPatch(ctx.root, w.terrain, -22, 16, 3, 14, 12);
  flowerPatch(ctx.root, w.terrain, -20, -20, 3, 14, 13);
  flowerPatch(ctx.root, w.terrain, 21, -19, 3, 14, 14);

  // ---------------- wayfinding signpost
  signpost(ctx, 6.5, 6.5, [
    { text: 'CARNIVAL', yaw: 0 },
    { text: 'DOCKS', yaw: -Math.PI / 2 },
    { text: 'GLOOMWOOD', yaw: Math.PI },
    { text: 'LOOKOUT', yaw: Math.PI / 2 },
  ]);

  // ---------------- Mayor Gramophone
  const mayorNpc = new NPC('mayor', 'Mayor Gramophone', 105, mayor(), 0);
  mayorNpc.position.set(0, w.heightAt(0, 7.5), 7.5);
  mayorNpc.talkRadius = 4.2;
  ctx.root.add(mayorNpc);
  w.npcs.set('mayor', mayorNpc);

  // ---------------- Penny's savings stall
  const bx = -12.5;
  const bz = 9.5;
  const by = w.heightAt(bx, bz);
  const stall = grp(bx, by, bz, Math.atan2(-bx, -bz));
  stall.add(m(G.box(4.6, 1.2, 1.4), T(0x3d8f94), { p: [0, 0.6, -1.2] }));
  stall.add(m(G.box(4.8, 0.15, 1.6), T(PAL.gold, { gloss: true }), { p: [0, 1.25, -1.2] }));
  for (const sx of [-2.2, 2.2]) stall.add(m(G.cyl(0.12, 0.12, 3.6, 8), T(PAL.woodDark), { p: [sx, 1.8, -1.8] }));
  for (let i = 0; i < 7; i++) stall.add(m(G.box(0.7, 0.14, 2.0), T(i % 2 ? PAL.cream : 0x3d8f94), { p: [-2.1 + i * 0.7, 3.6, -1.2], r: [0.25, 0, 0] }));
  const s1 = sign('PENNY\'S BANK', 3.4, 0.7, '#f2b83b');
  s1.position.set(0, 4.25, -1.6);
  stall.add(s1);
  // a stack of coins on the counter
  for (let i = 0; i < 5; i++) stall.add(m(G.cyl(0.25, 0.25, 0.08, 14), T(PAL.gold, { gloss: true }), { p: [1.4, 1.37 + i * 0.09, -1.0] }));
  ctx.root.add(stall);
  ctx.physics.box({ x: bx + Math.sin(stall.rotation.y) * -1.2, z: bz + Math.cos(stall.rotation.y) * -1.2, yaw: stall.rotation.y, hx: 2.4, hz: 0.8, y0: by, y1: by + 1.3 });
  const pennyNpc = new NPC('penny', 'Penny Piggybank', 330, penny(), stall.rotation.y);
  pennyNpc.position.set(bx, by, bz);
  ctx.root.add(pennyNpc);
  w.npcs.set('penny', pennyNpc);

  // ---------------- Mort the mailbox (tips)
  const mortNpc = new NPC('mort', 'Mort the Mailbox', 190, mort(), Math.PI * 0.8);
  mortNpc.position.set(9, w.heightAt(9, -12), -12);
  ctx.root.add(mortNpc);
  w.npcs.set('mort', mortNpc);

  // a few street-side tokens to start the breadcrumb trails out of town
  tokenLine(w.tokens, 'town-e-', [24, 3], [46, 6], 5, w.heightAt.bind(w));
  tokenLine(w.tokens, 'town-w-', [-24, -4], [-46, -9], 5, w.heightAt.bind(w));
  tokenLine(w.tokens, 'town-s-', [4, 26], [8, 50], 5, w.heightAt.bind(w));
  tokenLine(w.tokens, 'town-n-', [-6, -24], [-13, -40], 4, w.heightAt.bind(w));

  w.pois.set('town', new Vector3(0, y0, 0));
}
