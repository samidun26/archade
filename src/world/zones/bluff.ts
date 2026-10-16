import { CylinderGeometry, Group, IcosahedronGeometry, SphereGeometry, Vector3 } from 'three';
import type { World } from '../World';
import { G, T, alive, grp, m } from '../kit';
import { bench, fence, flowerPatch, mushroom, sign, stripeMat } from '../props';
import { PAL, toon } from '../../render/materials';
import { Reel, tokenArc, tokenLine, tokenRing } from '../Collectibles';
import { NPC } from '../../npc/NPC';
import { gus } from '../../npc/characters';
import { rng } from '../../core/math';

export const ISLES = [
  { x: -12, z: -131, y: 27, r: 6 },
  { x: 6, z: -142, y: 32, r: 5 },
  { x: 26, z: -136, y: 40, r: 4.5 },
  { x: 14, z: -161, y: 50, r: 6.5 },
];

function isle(w: World, x: number, z: number, y: number, r: number, seed: number) {
  const ctx = w.ctx;
  const rr = rng(seed);
  const g = grp(x, y, z);
  const depth = r * 1.5;
  const rockG = new CylinderGeometry(r * 0.95, r * 0.18, depth, 14, 3);
  const pos = rockG.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    if (py < depth / 2 - 0.01) {
      const k = 0.85 + rr() * 0.3;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
  }
  rockG.computeVertexNormals();
  g.add(m(rockG, T(0xa77b4f, { mottle: 0.9 }), { p: [0, -depth / 2 - 0.3, 0] }));
  g.add(m(new CylinderGeometry(r, r * 0.97, 0.7, 24), T(PAL.grass, { mottle: 0.8 }), { p: [0, -0.35, 0] }));
  g.add(m(G.torus(r * 0.985, 0.18, 6, 32), T(PAL.grassDark), { p: [0, -0.02, 0], r: [Math.PI / 2, 0, 0], shadow: false }));
  // hanging roots + a few bushes
  for (let i = 0; i < 6; i++) {
    const a = rr() * Math.PI * 2;
    g.add(m(G.cone(0.2, 1.6 + rr() * 1.5, 5), T(0x6b4a2a), { p: [Math.cos(a) * r * 0.8, -1.4 - rr(), Math.sin(a) * r * 0.8], r: [Math.PI, 0, 0] }));
  }
  for (let i = 0; i < 3; i++) {
    const a = rr() * Math.PI * 2;
    const d = r * (0.45 + rr() * 0.35);
    g.add(m(new IcosahedronGeometry(0.9 + rr() * 0.5, 1), T(0x4f8a32, { mottle: 0.8 }), { p: [Math.cos(a) * d, 0.3, Math.sin(a) * d], s: [1, 0.7, 1] }));
  }
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r, y0: y - depth, y1: y });
  return g;
}

function cloudPlatform(w: World, a: Vector3, b: Vector3, period: number, phase = 0) {
  const ctx = w.ctx;
  const g = new Group();
  g.userData.dynamic = true;
  const white = toon(0xfffaf0, { mottle: 0.15, emissive: 0xfff4e0, emissiveIntensity: 0.35 });
  const shade = toon(0xe9dcc4, { mottle: 0.15, emissive: 0xfff4e0, emissiveIntensity: 0.25 });
  for (const [x, y, z, r, mat] of [
    [0, 0, 0, 1.3, white],
    [-1.1, -0.15, 0.2, 0.95, white],
    [1.1, -0.1, -0.2, 1.0, white],
    [0.2, -0.2, 1.0, 0.85, shade],
    [-0.2, -0.25, -1.0, 0.85, shade],
  ] as const)
    g.add(m(new SphereGeometry(r, 18, 12), mat, { p: [x, y, z], s: [1, 0.62, 1] }));
  // sleepy little face
  ctx.root.add(g);
  const col = ctx.physics.cyl({ x: a.x, z: a.z, r: 1.9, y0: a.y - 1, y1: a.y + 0.75, dynamic: true, oneWay: true });
  const tmp = new Vector3();
  w.updaters.push((_dt, t) => {
    const k = 0.5 - 0.5 * Math.cos(((t + phase) / period) * Math.PI * 2);
    tmp.copy(a).lerp(b, k);
    g.position.copy(tmp);
    g.rotation.y = Math.sin(t * 0.5 + phase) * 0.2;
    col.x = tmp.x;
    col.z = tmp.z;
    col.y1 = tmp.y + 0.75;
    col.y0 = tmp.y - 1;
  });
}

export function buildBluff(w: World) {
  const ctx = w.ctx;
  const by = w.heightAt(-12, -102);

  // ---------------- Gus the weathervane
  const g = new NPC('gus', 'Gus the Weathervane', 420, gus(), Math.PI);
  g.position.set(-3, w.heightAt(-3, -97), -97);
  g.turnToPlayer = false;
  g.talkRadius = 4.2;
  ctx.root.add(g);
  w.npcs.set('gus', g);
  ctx.physics.cyl({ x: -3, z: -97, r: 0.4, y0: by, y1: by + 3.4 });

  // ---------------- telescope + bench at the lookout
  {
    const x = -22;
    const z = -112;
    const y = w.heightAt(x, z);
    const t = grp(x, y, z, Math.PI * 0.95);
    t.add(m(G.cyl(0.08, 0.1, 1.6, 6), T(0x2e2622), { p: [-0.4, 0.8, 0], r: [0, 0, 0.25] }));
    t.add(m(G.cyl(0.08, 0.1, 1.6, 6), T(0x2e2622), { p: [0.4, 0.8, 0], r: [0, 0, -0.25] }));
    t.add(m(G.cyl(0.08, 0.1, 1.6, 6), T(0x2e2622), { p: [0, 0.8, -0.4], r: [0.25, 0, 0] }));
    t.add(m(G.cyl(0.22, 0.32, 2.2, 14), T(PAL.brass, { gloss: true }), { p: [0, 1.8, 0.3], r: [1.2, 0, 0] }));
    ctx.root.add(t);
    ctx.physics.cyl({ x, z, r: 0.6, y0: y, y1: y + 2 });
    bench(ctx, -28, -106, Math.PI * 0.9);
  }
  fence(ctx, [
    [-32, -114],
    [-24, -119],
    [-16, -121],
  ]);
  fence(ctx, [
    [-8, -121],
    [0, -119],
    [8, -114],
  ]);
  flowerPatch(ctx.root, w.terrain, -4, -108, 4, 18, 31);
  flowerPatch(ctx.root, w.terrain, -24, -96, 3, 14, 32);

  const sgn = grp(-12, w.heightAt(-12, -114), -114, 0);
  sgn.add(m(G.cyl(0.12, 0.14, 2.6, 8), T(PAL.woodDark), { p: [0, 1.3, 0] }));
  const s = sign('CUMULUS ISLES ↑', 2.8, 0.7, '#fbf0d4');
  s.position.set(0, 2.4, 0.1);
  sgn.add(s);
  const s2 = s.clone();
  s2.position.z = -0.1;
  s2.rotation.y = Math.PI;
  sgn.add(s2);
  ctx.root.add(sgn);

  // launch mushroom at the cliff edge
  mushroom(ctx, -12, -119, 2.2, 1.6, 29, 0xe04a3c);

  // ---------------- the isles
  ISLES.forEach((i, k) => isle(w, i.x, i.z, i.y, i.r, 50 + k));
  cloudPlatform(w, new Vector3(-5.5, 26.5, -135), new Vector3(0.6, 30.0, -138.8), 6.5);
  mushroom(ctx, 9.4, -140.2, 1.5, 1.0, 26, 0xf2b83b, ISLES[1].y - 0.05);
  cloudPlatform(w, new Vector3(20, 39.4, -148), new Vector3(20, 49.0, -148), 7.5, 2);

  // tokens along the sky route
  tokenArc(w.tokens, 'sky-a-', new Vector3(-12, by + 3, -119), new Vector3(-12, 28.5, -129), 3, 9);
  tokenRing(w.tokens, 'sky-i1-', -12, 28.3, -131, 3, 4);
  tokenArc(w.tokens, 'sky-b-', new Vector3(9.4, 34, -140.2), new Vector3(24, 41.5, -136.5), 4, 10);
  tokenLine(w.tokens, 'sky-c-', [20, -148], [20, -148], 1, () => 46);
  tokenRing(w.tokens, 'sky-top-', 14, 51.4, -161, 4, 6);

  // ---------------- summit: reel + gazebo + return balloon
  const top = ISLES[3];
  const gz = grp(top.x - 2.5, top.y, top.z - 1.5);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    gz.add(m(G.cyl(0.12, 0.12, 3, 6), T(PAL.cream), { p: [Math.cos(a) * 2, 1.5, Math.sin(a) * 2] }));
  }
  gz.add(m(new CylinderGeometry(0.2, 2.7, 1.6, 6), stripeMat('#3d8f94', '#fbf0d4', 6), { p: [0, 3.8, 0] }));
  gz.add(m(G.cyl(2.1, 2.1, 0.2, 6), T(PAL.wood), { p: [0, 0.1, 0] }));
  ctx.root.add(gz);
  const reel = new Reel('sky', 'The Cloud-Top Reel');
  reel.position.set(top.x - 2.5, top.y + 0.2, top.z - 1.5);
  reel.reveal(true);
  w.reels.set('sky', reel);

  const balloon = new Group();
  balloon.position.set(top.x + 3.2, top.y, top.z + 2.2);
  balloon.userData.dynamic = true;
  balloon.add(m(G.box(1.6, 1.0, 1.6), T(0xa86b3c), { p: [0, 0.5, 0] }));
  for (const [x, z] of [
    [-0.7, -0.7],
    [0.7, -0.7],
    [-0.7, 0.7],
    [0.7, 0.7],
  ])
    balloon.add(m(G.cyl(0.03, 0.03, 2.2, 4), T(0x3a2e28), { p: [x, 2.1, z] }));
  const env = m(new SphereGeometry(2.3, 24, 18), stripeMat('#d2402f', '#f2b83b', 12), { p: [0, 5.0, 0], s: [1, 1.15, 1], dynamic: true });
  balloon.add(env);
  balloon.add(m(G.cone(1.3, 1.2, 12), stripeMat('#d2402f', '#f2b83b', 12), { p: [0, 2.9, 0], r: [Math.PI, 0, 0] }));
  ctx.root.add(balloon);
  alive(balloon, 0.03, 0.2, 0.02);
  ctx.physics.box({ x: balloon.position.x, z: balloon.position.z, hx: 0.8, hz: 0.8, y0: top.y, y1: top.y + 1.0 });
  w.interactables.push({
    id: 'balloon',
    pos: balloon.position.clone(),
    radius: 3.2,
    label: () => 'Ride the balloon down',
    enabled: () => true,
    act: () => w.emit({ type: 'balloon-ride' }),
  });
  w.updaters.push((_dt, t) => {
    env.position.y = 5.0 + Math.sin(t * 1.2) * 0.12;
  });

  // ---------------- tokens up the switchback
  tokenLine(w.tokens, 'sw-a-', [2, -58], [-14, -74], 5, w.heightAt.bind(w));
  tokenLine(w.tokens, 'sw-b-', [-14, -78], [-12, -90], 3, w.heightAt.bind(w));
  w.pois.set('bluff', new Vector3(-12, by, -102));
  w.pois.set('sky', new Vector3(top.x, top.y, top.z));
}
