import {
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  PlaneGeometry,
  Mesh,
} from 'three';
import type { World } from '../World';
import { G, T, alive, grp, m } from '../kit';
import { rock, stripeMat } from '../props';
import { PAL, toon } from '../../render/materials';
import { landValue } from '../Terrain';
import { rng } from '../../core/math';
import { decalFace } from '../../render/faces';

export function buildScenery(w: World) {
  const ctx = w.ctx;
  const r = rng(99);

  // ---------------- a windmill landmark with a face, on the hill west of the docks path
  {
    const x = -34;
    const z = 40;
    const y = w.heightAt(x, z) - 0.3;
    const g = grp(x, y, z, 0.5);
    g.add(m(new CylinderGeometry(2.0, 3.0, 9, 8), T(0xf3dcb0), { p: [0, 4.5, 0] }));
    g.add(m(G.cone(2.8, 3, 8), T(PAL.red, { gloss: true }), { p: [0, 10.4, 0] }));
    const face = new Mesh(new PlaneGeometry(3, 3), toon(0xffffff, { map: decalFace({ eyes: 'pie', mouth: 'smile', cheeks: true }), alphaTest: 0.5, mottle: 0, side: DoubleSide, key: 'windmill-face' }));
    face.position.set(0, 5.4, 2.62);
    face.rotation.x = -0.1;
    g.add(face);
    g.add(m(G.box(1.2, 2, 0.3), T(PAL.woodDark), { p: [0, 1, 2.85] }));
    const blades = new Group();
    blades.position.set(0, 8.6, 2.6);
    for (let i = 0; i < 4; i++) {
      const b = new Group();
      b.rotation.z = (i * Math.PI) / 2;
      b.add(m(G.box(0.35, 6.2, 0.15), T(PAL.woodDark), { p: [0, 3.2, 0] }));
      b.add(m(G.box(1.5, 5, 0.06), stripeMat('#fbf0d4', '#e9dcc0', 4, false), { p: [0.85, 3.6, 0] }));
      blades.add(b);
    }
    blades.add(m(G.sphere(0.5, 12, 10), T(PAL.gold, { gloss: true })));
    blades.userData.dynamic = true;
    g.add(blades);
    alive(g, 0.025, 0.4, 0.015);
    ctx.root.add(g);
    ctx.physics.cyl({ x, z, r: 2.9, y0: y, y1: y + 9 });
    w.updaters.push((dt) => (blades.rotation.z -= dt * 0.9));
    w.tokens.place('windmill-a', x + 3, y + 2.5, z + 4);
    w.tokens.place('windmill-b', x + 5, y + 2.5, z + 2);
  }

  // ---------------- distant islets on the horizon
  const islets: Array<[number, number, number, number]> = [
    [260, -120, 40, 18],
    [-300, 60, 55, 24],
    [120, 300, 36, 14],
    [-180, -280, 48, 20],
    [320, 160, 30, 12],
  ];
  for (const [x, z, rr, h] of islets) {
    const g = grp(x, -1, z);
    g.add(m(new IcosahedronGeometry(1, 2), T(0x7fae5a, { mottle: 0.6 }), { s: [rr, h, rr * 0.8], shadow: false }));
    g.add(m(new IcosahedronGeometry(1, 1), T(0x5f9a3a, { mottle: 0.6 }), { p: [rr * 0.3, h * 0.6, 0], s: [rr * 0.5, h * 0.7, rr * 0.4], shadow: false }));
    ctx.root.add(g);
  }

  // ---------------- sea stacks and coastal rocks
  for (let i = 0; i < 36; i++) {
    const a = r() * Math.PI * 2;
    const d = 120 + r() * 70;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const L = landValue(x, z);
    if (L > 0.05 || L < -0.25) continue;
    rock(ctx, x, z, 1.5 + r() * 3, 200 + i, true);
  }

  // ---------------- seagulls circling the docks + a sailboat on the horizon
  const gulls: Array<{ g: Group; r: number; h: number; s: number; ph: number; cx: number; cz: number }> = [];
  for (let i = 0; i < 6; i++) {
    const g = new Group();
    g.userData.dynamic = true;
    const wingM = T(0xfffaf0, { side: DoubleSide, mottle: 0 });
    const lw = m(G.box(1.2, 0.06, 0.35), wingM, { p: [-0.6, 0, 0], shadow: false, dynamic: true });
    const rw = m(G.box(1.2, 0.06, 0.35), wingM, { p: [0.6, 0, 0], shadow: false, dynamic: true });
    g.add(lw, rw, m(G.sphere(0.2, 8, 6), wingM, { s: [1, 0.8, 1.8], shadow: false }));
    g.userData.wings = [lw, rw];
    ctx.root.add(g);
    gulls.push({ g, r: 14 + r() * 20, h: 14 + r() * 10, s: 0.3 + r() * 0.2, ph: r() * 6, cx: i < 3 ? 18 : -60, cz: i < 3 ? 130 : 110 });
  }
  const sail = grp(-80, 0, 220);
  sail.userData.dynamic = true;
  sail.add(m(G.box(3, 1.2, 8), T(PAL.red), { p: [0, 0.4, 0], shadow: false }));
  sail.add(m(G.cyl(0.12, 0.12, 9, 6), T(PAL.woodDark), { p: [0, 5, 0], shadow: false }));
  sail.add(m(new PlaneGeometry(4, 7), T(PAL.cream, { side: DoubleSide }), { p: [0.1, 5.5, 1.5], r: [0, Math.PI / 2, 0], shadow: false }));
  ctx.root.add(sail);
  w.updaters.push((_dt, t) => {
    for (const gl of gulls) {
      const a = t * gl.s + gl.ph;
      gl.g.position.set(gl.cx + Math.cos(a) * gl.r, gl.h + Math.sin(t * 0.7 + gl.ph) * 2, gl.cz + Math.sin(a) * gl.r);
      gl.g.rotation.y = -a;
      gl.g.rotation.z = 0.3;
      const [lw, rw] = gl.g.userData.wings as Mesh[];
      const flap = Math.sin(t * 6 + gl.ph) * 0.5;
      lw.rotation.z = flap;
      rw.rotation.z = -flap;
    }
    sail.position.x = -80 + Math.sin(t * 0.02) * 120;
    sail.position.y = Math.sin(t * 0.8) * 0.3;
    sail.rotation.z = Math.sin(t * 0.6) * 0.05;
  });
}
