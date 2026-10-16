import { CylinderGeometry, IcosahedronGeometry, Mesh, PlaneGeometry, SphereGeometry, Vector3, DoubleSide } from 'three';
import type { World } from '../World';
import { G, T, alive, grp, m } from '../kit';
import { mushroom, rock, sign } from '../props';
import { Lantern, Reel, tokenArc, tokenLine } from '../Collectibles';
import { NPC } from '../../npc/NPC';
import { oak } from '../../npc/characters';
import { pathDistance } from '../Terrain';
import { rng } from '../../core/math';
import { decalFace, type FaceSpec } from '../../render/faces';
import { toon } from '../../render/materials';

export const OAK = { x: -96, z: -22 };
export const LANTERNS: Array<{ id: string; x: number; z: number; y?: number; post?: number }> = [
  { id: 'l-path', x: -64, z: -20 },
  { id: 'l-stump', x: -104, z: 4 },
  { id: 'l-log', x: -78, z: -46 },
  { id: 'l-cap', x: -121, z: -25 },
  { id: 'l-ring', x: -100, z: -50 },
];

const FACES: FaceSpec[] = [
  { eyes: 'sleepy', mouth: 'smile' },
  { eyes: 'pie', mouth: 'o', brows: 'worried' },
  { eyes: 'pie', mouth: 'smile', cheeks: true },
  { eyes: 'angry', mouth: 'frown', brows: 'angry' },
  { eyes: 'happy', mouth: 'grin' },
];

function tree(w: World, x: number, z: number, s: number, seed: number, faceIdx = -1, faceYaw = 0) {
  const ctx = w.ctx;
  const r = rng(seed);
  const y = w.heightAt(x, z) - 0.2;
  const g = grp(x, y, z, faceIdx >= 0 ? faceYaw : r() * 6);
  const bark = T(r() > 0.5 ? 0x8a5a36 : 0x7a4e2f, { mottle: 0.9 });
  const h = (4.2 + r() * 2.2) * s;
  const trunk = m(new CylinderGeometry(0.42 * s, 0.7 * s, h, 10), bark, { p: [0, h / 2, 0], r: [(r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08] });
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    g.add(m(G.cone(0.35 * s, 1.2 * s, 6), bark, { p: [Math.cos(a) * 0.6 * s, 0.35 * s, Math.sin(a) * 0.6 * s], r: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8] }));
  }
  const greens = [0x5f9a3a, 0x4f8a32, 0x6fa83f, 0x3f7a2a];
  const blobs = 2 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = r() * Math.PI * 2;
    const d = i === 0 ? 0 : (1.0 + r() * 0.8) * s;
    const rad = (i === 0 ? 2.6 : 1.8 + r() * 0.7) * s;
    g.add(m(new IcosahedronGeometry(1, 2), T(greens[Math.floor(r() * greens.length)], { mottle: 0.8 }), { p: [Math.cos(a) * d, h + (i === 0 ? 0.6 : -0.3 + r()) * s, Math.sin(a) * d], s: rad, r: [r(), r(), r()] }));
  }
  if (faceIdx >= 0) {
    const face = new Mesh(new PlaneGeometry(1.6 * s, 1.6 * s), toon(0xffffff, { map: decalFace(FACES[faceIdx % FACES.length]), alphaTest: 0.5, mottle: 0, side: DoubleSide, key: 'treeface' + (faceIdx % FACES.length) }));
    face.position.set(0, h * 0.42, 0.62 * s);
    g.add(face);
    alive(g, 0.04, r(), 0.04);
  }
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r: 0.62 * s, y0: y, y1: y + h });
  return g;
}

export function buildForest(w: World) {
  const ctx = w.ctx;

  // ---------------- Old Man Oak
  const oy = w.heightAt(OAK.x, OAK.z);
  const oakNpc = new NPC('oak', 'Old Man Oak', 70, oak(), Math.PI / 2);
  oakNpc.turnToPlayer = false;
  oakNpc.talkRadius = 7;
  oakNpc.bob = 0.12;
  oakNpc.position.set(OAK.x, oy, OAK.z);
  ctx.root.add(oakNpc);
  w.npcs.set('oak', oakNpc);
  ctx.physics.cyl({ x: OAK.x, z: OAK.z, r: 3.0, y0: oy, y1: oy + 13 });
  // shelf-fungus steps spiralling up the trunk; the reel waits on the big top shelf
  const shelf = T(0xe9c27a, { mottle: 0.6 });
  const shelfDark = T(0xb8863f);
  const steps = 5;
  const perch = new Vector3();
  for (let i = 0; i < steps; i++) {
    const last = i === steps - 1;
    const a = -0.4 + i * 1.05;
    const hh = 2.6 + i * 2.35;
    const trunkR = 3.3 - (hh / 13) * 1.0;
    const sr = last ? 1.9 : 1.45;
    const d = trunkR + sr * 0.55;
    const sx = OAK.x + Math.cos(a) * d;
    const sz = OAK.z + Math.sin(a) * d;
    const g = grp(sx, oy + hh, sz, -a);
    g.add(m(new SphereGeometry(sr, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shelf, { s: [1, 0.32, 1] }));
    g.add(m(G.cyl(sr * 0.98, sr * 0.9, 0.16, 20), shelfDark, { p: [0, -0.05, 0] }));
    ctx.root.add(g);
    ctx.physics.cyl({ x: sx, z: sz, r: sr * 0.9, y0: oy + hh - 0.4, y1: oy + hh + 0.4 });
    if (i % 2 === 0 && !last) w.tokens.place(`oak-step-${i}`, sx, oy + hh + 1.6, sz);
    if (last) perch.set(sx, oy + hh + 0.4, sz);
  }
  const oakReel = new Reel('oak', "Old Oak's Reel");
  oakReel.position.copy(perch);
  w.reels.set('oak', oakReel);
  w.pois.set('oak', new Vector3(OAK.x, oy, OAK.z));

  // ---------------- lanterns
  for (const L of LANTERNS) {
    let baseY = w.heightAt(L.x, L.z);
    if (L.id === 'l-stump') {
      const sh = 4.4;
      const g = grp(L.x, baseY - 0.2, L.z);
      g.add(m(new CylinderGeometry(1.6, 1.9, sh, 16), T(0x8a5a36, { mottle: 0.9 }), { p: [0, sh / 2, 0] }));
      g.add(m(G.cyl(1.55, 1.55, 0.1, 16), T(0xe2c18a), { p: [0, sh + 0.02, 0] }));
      for (let k = 0; k < 4; k++) g.add(m(G.torus(0.4 + k * 0.32, 0.04, 4, 24), T(0xb8863f), { p: [0, sh + 0.08, 0], r: [Math.PI / 2, 0, 0], shadow: false }));
      ctx.root.add(g);
      ctx.physics.cyl({ x: L.x, z: L.z, r: 1.75, y0: baseY - 1, y1: baseY - 0.2 + sh });
      baseY = baseY - 0.2 + sh;
      mushroom(ctx, L.x + 4.2, L.z + 2.6, 1.4, 1.2, 16, 0xe07a3c);
    }
    if (L.id === 'l-log') {
      // a long fallen log you run along to reach the lantern
      const lx0 = L.x + 9;
      const lz0 = L.z + 3;
      const yaw = Math.atan2(L.x - lx0, L.z - lz0);
      const len = Math.hypot(L.x - lx0, L.z - lz0) + 2;
      const mx = (L.x + lx0) / 2;
      const mz = (L.z + lz0) / 2;
      const ly = Math.max(w.heightAt(mx, mz), w.heightAt(L.x, L.z));
      const log = m(new CylinderGeometry(1.1, 1.2, len, 14), T(0x7a4e2f, { mottle: 0.9 }), { p: [mx, ly + 1.0, mz] });
      log.rotation.set(Math.PI / 2, 0, 0);
      log.rotation.order = 'YXZ';
      log.rotation.y = yaw;
      ctx.root.add(log);
      ctx.physics.box({ x: mx, z: mz, yaw, hx: 1.0, hz: len / 2, y0: ly - 0.5, y1: ly + 2.0 });
      baseY = ly + 2.0;
      tokenLine(w.tokens, 'log-', [lx0, lz0], [L.x, L.z], 4, () => baseY - 0.4 + 0.2);
    }
    if (L.id === 'l-cap') {
      const tall = mushroom(ctx, L.x, L.z, 2.4, 7.2, 0, 0x8a6bb0);
      baseY = tall.top;
      mushroom(ctx, L.x + 5.2, L.z + 3.4, 1.8, 1.4, 25, 0xe04a3c);
      tokenArc(w.tokens, 'cap-', new Vector3(L.x + 5.2, w.heightAt(L.x + 5.2, L.z + 3.4) + 3, L.z + 3.4), new Vector3(L.x, baseY + 1.2, L.z), 3, 5);
    }
    if (L.id === 'l-ring') {
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const px = L.x + Math.cos(a) * 4;
        const pz = L.z + Math.sin(a) * 4;
        const g = grp(px, w.heightAt(px, pz), pz);
        g.add(m(G.cyl(0.12, 0.15, 0.5, 6), T(0xf6ead0), { p: [0, 0.25, 0], shadow: false }));
        g.add(m(new SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), T(k % 2 ? 0xe04a3c : 0xf2b83b, { gloss: true }), { p: [0, 0.48, 0], shadow: false }));
        ctx.root.add(g);
      }
    }
    const lan = new Lantern(L.id, L.post ?? 2.2);
    lan.position.set(L.x, baseY, L.z);
    ctx.root.add(lan);
    w.lanterns.push(lan);
    ctx.physics.cyl({ x: L.x, z: L.z, r: 0.2, y0: baseY, y1: baseY + 2.2 });
  }
  // light a lantern just by touching it
  w.updaters.push((_dt, _t, _b, p) => {
    for (const lan of w.lanterns) {
      if (lan.lit) continue;
      const base = lan.position;
      const hd = Math.hypot(p.x - base.x, p.z - base.z);
      if (hd < 1.6 && p.y > base.y - 1.2 && p.y < base.y + 3.2) {
        lan.light();
        const count = w.lanterns.filter((l) => l.lit).length;
        w.fx.burst('spark', lan.top, 26, 6, { up: 0.4 });
        w.fx.burst('star', lan.top, 6, 5);
        w.emit({ type: 'lantern-lit', id: lan.key, count });
      }
    }
  });

  // ---------------- bounce mushrooms scattered through the wood
  const mush: Array<[number, number, number, number, number]> = [
    [-74, 0, 2.0, 1.8, 22],
    [-88, 2, 2.4, 2.2, 24],
    [-108, -34, 2.2, 2.0, 24],
    [-84, -30, 1.8, 1.6, 20],
    [-112, -6, 2.0, 1.8, 22],
  ];
  for (const [x, z, cr, sh, b] of mush) {
    mushroom(ctx, x, z, cr, sh, b);
    tokenArc(w.tokens, `mush-${x}-`, new Vector3(x, w.heightAt(x, z) + sh + 2, z), new Vector3(x + 4, w.heightAt(x + 4, z + 4) + 2, z + 4), 3, 6);
  }
  // small decorative mushrooms
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 6 + r() * 38;
    const x = -86 + Math.cos(a) * d;
    const z = -12 + Math.sin(a) * d;
    if (pathDistance(x, z) < 3.5 || w.heightAt(x, z) < 2) continue;
    const g = grp(x, w.heightAt(x, z), z);
    const s = 0.5 + r() * 0.6;
    g.add(m(G.cyl(0.12 * s, 0.16 * s, 0.7 * s, 6), T(0xf6ead0), { p: [0, 0.35 * s, 0], shadow: false }));
    g.add(m(new SphereGeometry(0.45 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), T([0xe04a3c, 0xf2b83b, 0x8a6bb0][i % 3], { gloss: true }), { p: [0, 0.65 * s, 0], shadow: false }));
    ctx.root.add(g);
  }

  // ---------------- trees
  const tr = rng(4242);
  const avoid: Array<[number, number, number]> = [
    [OAK.x, OAK.z, 13],
    ...LANTERNS.map((l) => [l.x, l.z, 5] as [number, number, number]),
    ...mush.map(([x, z]) => [x, z, 5] as [number, number, number]),
    [-121 + 5.2, -25 + 3.4, 5],
    [-104 + 4.2, 4 + 2.6, 4],
  ];
  let placed = 0;
  let faces = 0;
  for (let tries = 0; tries < 600 && placed < 78; tries++) {
    const a = tr() * Math.PI * 2;
    const d = Math.sqrt(tr()) * 50;
    const x = -88 + Math.cos(a) * d;
    const z = -14 + Math.sin(a) * d;
    if (x > -44) continue;
    if (w.heightAt(x, z) < 2.6) continue;
    const pd = pathDistance(x, z);
    if (pd < 4.5) continue;
    if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
    const s = 0.85 + tr() * 0.55;
    let faceIdx = -1;
    let yaw = 0;
    if (pd < 9 && faces < 12 && tr() > 0.3) {
      faceIdx = faces++;
      // look toward the path
      const n = new Vector3();
      let best = 1e9;
      for (let k = 0; k < 16; k++) {
        const aa = (k / 16) * Math.PI * 2;
        const dd = pathDistance(x + Math.cos(aa) * 3, z + Math.sin(aa) * 3);
        if (dd < best) {
          best = dd;
          n.set(Math.cos(aa), 0, Math.sin(aa));
        }
      }
      yaw = Math.atan2(n.x, n.z);
    }
    tree(w, x, z, s, 1000 + tries, faceIdx, yaw);
    placed++;
  }
  // scattered rocks & a forest sign
  rock(ctx, -60, -26, 1.6, 21);
  rock(ctx, -116, 8, 2.2, 22);
  rock(ctx, -92, 18, 1.8, 23);
  {
    const x = -54;
    const z = -6;
    const y = w.heightAt(x, z);
    const post = grp(x, y, z, -Math.PI / 2 + 0.2);
    post.add(m(G.cyl(0.15, 0.18, 3, 8), T(0x7a4e2f), { p: [-1.4, 1.5, 0] }));
    post.add(m(G.cyl(0.15, 0.18, 3, 8), T(0x7a4e2f), { p: [1.4, 1.5, 0] }));
    const s = sign('GLOOMWOOD', 3.4, 0.9, '#5f9a3a', '#fbf0d4');
    s.position.set(0, 2.5, 0.05);
    post.add(s);
    const s2 = s.clone();
    s2.rotation.y = Math.PI;
    s2.position.z = -0.05;
    post.add(s2);
    ctx.root.add(post);
  }
  tokenLine(w.tokens, 'fp-', [-58, -11], [-70, -15], 4, w.heightAt.bind(w));
  tokenLine(w.tokens, 'fo-', [-74, -16], [-90, -16], 4, w.heightAt.bind(w));

  // ---------------- fireflies
  const ff = new Vector3();
  const fv = new Vector3();
  let acc = 0;
  w.updaters.push((dt, _t, _b, p) => {
    if (w.forestness < 0.2) return;
    acc += dt * w.forestness * 14;
    while (acc > 1) {
      acc -= 1;
      ff.set(p.x + (Math.random() - 0.5) * 30, p.y + 0.5 + Math.random() * 4, p.z + (Math.random() - 0.5) * 30);
      fv.set((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6);
      w.fx.emit('spark', ff, fv, { size: 0.12, life: 2.4, color: 0xfff08a, grav: -0.05, drag: 0.2, grow: 0 });
    }
  });
  w.pois.set('forest', new Vector3(-86, w.heightAt(-86, -12), -12));
}
