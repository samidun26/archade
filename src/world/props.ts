import {
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';
import type { Physics } from '../core/Physics';
import type { Terrain } from './Terrain';
import { G, T, alive, grp, m } from './kit';
import { PAL, toon } from '../render/materials';
import { houseFacade } from '../render/faces';
import { signCanvas, stripeTex, tex } from '../render/textures';
import { rng } from '../core/math';

export interface Ctx {
  physics: Physics;
  terrain: Terrain;
  root: Group;
}

/** Ground height under a footprint (lowest corner, so nothing floats). */
export function footY(ctx: Ctx, x: number, z: number, r: number) {
  const t = ctx.terrain;
  return Math.min(
    t.heightAt(x, z),
    t.heightAt(x + r, z),
    t.heightAt(x - r, z),
    t.heightAt(x, z + r),
    t.heightAt(x, z - r),
  );
}

const decalCache = new Map<string, ReturnType<typeof toon>>();
function decal(key: string, make: () => ReturnType<typeof tex>) {
  let mat = decalCache.get(key);
  if (!mat) {
    mat = toon(0xffffff, { map: make(), alphaTest: 0.5, mottle: 0.1, key: 'decal-' + key });
    decalCache.set(key, mat);
  }
  return mat;
}

// ------------------------------------------------------------------ house
export interface HouseOpts {
  w?: number;
  d?: number;
  h?: number;
  wall?: number;
  roof?: number;
  trim?: number;
  mood?: 'happy' | 'sleepy' | 'surprised';
  seed?: number;
  shutter?: string;
  chimney?: boolean;
}

export function house(ctx: Ctx, x: number, z: number, yaw: number, o: HouseOpts = {}) {
  const w = o.w ?? 6;
  const d = o.d ?? 5.5;
  const h = o.h ?? 5;
  const y = footY(ctx, x, z, Math.max(w, d) * 0.55) - 0.15;
  const g = grp(x, y, z, yaw);
  const wall = T(o.wall ?? 0xf3dcb0, { mottle: 0.8 });
  const roofM = T(o.roof ?? PAL.red);
  const trim = T(o.trim ?? PAL.woodDark);
  g.add(m(G.box(w, h, d), wall, { p: [0, h / 2, 0] }));
  // foundation strip + corner trim
  g.add(m(G.box(w * 1.04, 0.32, d * 1.04), trim, { p: [0, 0.16, 0] }));
  for (const [cx, cz] of [
    [-w / 2, d / 2],
    [w / 2, d / 2],
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
  ])
    g.add(m(G.box(0.3, h, 0.3), trim, { p: [cx, h / 2, cz] }));
  // gable roof: two triangle ends + two slanted slabs
  const roofH = h * 0.75;
  const tri = new Shape();
  tri.moveTo(-w * 0.62, 0);
  tri.lineTo(w * 0.62, 0);
  tri.lineTo(0, roofH);
  tri.closePath();
  const rg = new ShapeGeometry(tri);
  const roofFront = m(rg, wall, { p: [0, h - 0.05, d * 0.42] });
  const roofBack = m(rg, wall, { p: [0, h - 0.05, -d * 0.42], r: [0, Math.PI, 0] });
  g.add(roofFront, roofBack);
  const slopeLen = Math.hypot(w * 0.62, roofH);
  const ang = Math.atan2(roofH, w * 0.62);
  for (const sx of [-1, 1]) {
    const slab = m(G.box(slopeLen + 0.5, 0.35, d * 1.08), roofM, {
      p: [sx * w * 0.31, h + roofH / 2, 0],
      r: [0, 0, -sx * ang],
    });
    g.add(slab);
  }
  if (o.chimney !== false) {
    g.add(m(G.box(0.9, 2.2, 0.9), T(0xb35a3a), { p: [w * 0.25, h + roofH * 0.7, -d * 0.15] }));
    g.add(m(G.box(1.1, 0.3, 1.1), trim, { p: [w * 0.25, h + roofH * 0.7 + 1.15, -d * 0.15] }));
  }
  // facade decal (window eyes + door mouth)
  const fh = h - 0.3;
  const fac = new Mesh(new PlaneGeometry(Math.min(w * 0.9, fh * 1.1), fh), decal(`house${o.seed ?? 0}${o.mood}`, () => houseFacade(o.seed ?? 0, o.mood ?? 'happy', o.shutter)));
  fac.position.set(0, 0.3 + fh / 2, d * 0.5 + 0.03);
  g.add(fac);
  alive(g, 0.03, (o.seed ?? 0) * 0.37, 0.02);
  ctx.root.add(g);
  ctx.physics.box({ x, z, yaw, hx: w / 2 + 0.1, hz: d / 2 + 0.1, y0: y, y1: y + h + roofH * 0.45 });
  return g;
}

// ------------------------------------------------------------------ small props
export function lampPost(ctx: Ctx, x: number, z: number, yaw = 0) {
  const y = ctx.terrain.heightAt(x, z);
  const g = grp(x, y, z, yaw);
  const iron = T(0x2e2622, { gloss: true, mottle: 0.2 });
  g.add(m(G.cyl(0.32, 0.4, 0.5, 12), iron, { p: [0, 0.25, 0] }));
  g.add(m(G.cyl(0.11, 0.14, 4.4, 10), iron, { p: [0, 2.6, 0] }));
  g.add(m(G.torus(0.45, 0.07, 8, 16, Math.PI * 1.3), iron, { p: [0.35, 4.6, 0], r: [0, 0, -0.4] }));
  const glass = toon(0xfff1b3, { emissive: 0xffd36b, emissiveIntensity: 0.6, mottle: 0 });
  g.add(m(G.sphere(0.36, 14, 10), glass, { p: [0.8, 4.2, 0] }));
  g.add(m(G.cone(0.42, 0.35, 10), iron, { p: [0.8, 4.62, 0] }));
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r: 0.25, y0: y, y1: y + 4.8 });
  return g;
}

export function bench(ctx: Ctx, x: number, z: number, yaw = 0) {
  const y = ctx.terrain.heightAt(x, z);
  const g = grp(x, y, z, yaw);
  const wood = T(PAL.wood);
  const iron = T(0x2e2622);
  for (let i = 0; i < 3; i++) g.add(m(G.box(2.6, 0.12, 0.26), wood, { p: [0, 0.62, -0.3 + i * 0.3] }));
  for (let i = 0; i < 2; i++) g.add(m(G.box(2.6, 0.22, 0.1), wood, { p: [0, 1.0 + i * 0.3, -0.5], r: [-0.15, 0, 0] }));
  for (const sx of [-1.1, 1.1]) g.add(m(G.box(0.12, 0.65, 0.8), iron, { p: [sx, 0.32, -0.1] }));
  ctx.root.add(g);
  ctx.physics.box({ x, z, yaw, hx: 1.3, hz: 0.45, y0: y, y1: y + 0.7 });
  return g;
}

export function crate(ctx: Ctx, x: number, y: number | null, z: number, s = 1.4, yaw = 0, collide = true) {
  const yy = y ?? ctx.terrain.heightAt(x, z);
  const g = grp(x, yy, z, yaw);
  const wood = T(0xc58a4f);
  const dark = T(PAL.woodDark);
  g.add(m(G.box(s, s, s), wood, { p: [0, s / 2, 0] }));
  // inked frame planks
  const t = s * 0.12;
  for (const [px, pz, w, d] of [
    [0, s / 2, s * 1.02, t],
    [0, -s / 2, s * 1.02, t],
    [s / 2, 0, t, s * 1.02],
    [-s / 2, 0, t, s * 1.02],
  ] as const) {
    g.add(m(G.box(w, t, d), dark, { p: [px, s - t / 2 + 0.01, pz] }));
    g.add(m(G.box(w, t, d), dark, { p: [px, t / 2, pz] }));
  }
  for (const [px, pz] of [
    [s / 2, s / 2],
    [-s / 2, s / 2],
    [s / 2, -s / 2],
    [-s / 2, -s / 2],
  ])
    g.add(m(G.box(t, s, t), dark, { p: [px, s / 2, pz] }));
  ctx.root.add(g);
  if (collide) ctx.physics.box({ x, z, yaw, hx: s / 2, hz: s / 2, y0: yy, y1: yy + s });
  return yy + s;
}

export function barrel(ctx: Ctx, x: number, y: number | null, z: number, r = 0.6, hgt = 1.3) {
  const yy = y ?? ctx.terrain.heightAt(x, z);
  const g = grp(x, yy, z);
  g.add(m(G.cyl(r * 0.92, r * 0.92, hgt, 16), T(0xa86b3c), { p: [0, hgt / 2, 0] }));
  g.add(m(G.cyl(r, r, hgt * 0.5, 16), T(0xb87a46), { p: [0, hgt / 2, 0] }));
  for (const yy2 of [0.12, 0.88]) g.add(m(G.cyl(r * 0.97, r * 0.97, 0.1, 16), T(0x3a2e28), { p: [0, hgt * yy2, 0] }));
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r, y0: yy, y1: yy + hgt });
  return yy + hgt;
}

export function rock(ctx: Ctx, x: number, z: number, s = 1.5, seed = 1, collide = true) {
  const y = ctx.terrain.heightAt(x, z);
  const r = rng(seed);
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.8 + r() * 0.35;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.75, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  const mesh = m(g, T(r() > 0.5 ? PAL.stone : 0xa59a86), { p: [x, y + s * 0.25, z], s, r: [0, r() * 6, 0] });
  ctx.root.add(mesh);
  if (collide) ctx.physics.cyl({ x, z, r: s * 0.85, y0: y - 1, y1: y + s * 0.85 });
  return mesh;
}

export function signpost(ctx: Ctx, x: number, z: number, arrows: Array<{ text: string; yaw: number }>) {
  const y = ctx.terrain.heightAt(x, z);
  const g = grp(x, y, z);
  const wood = T(PAL.wood);
  g.add(m(G.cyl(0.16, 0.2, 4.6, 8), wood, { p: [0, 2.3, 0] }));
  g.add(m(G.sphere(0.24, 10, 8), T(PAL.gold, { gloss: true }), { p: [0, 4.7, 0] }));
  arrows.forEach((a, i) => {
    const arm = new Group();
    arm.position.y = 4.0 - i * 0.75;
    arm.rotation.y = a.yaw;
    const board = m(G.box(2.6, 0.6, 0.12), T(0xf4e7c5), { p: [1.35, 0, 0] });
    arm.add(board);
    const tipShape = new Shape();
    tipShape.moveTo(0, 0.3);
    tipShape.lineTo(0.45, 0);
    tipShape.lineTo(0, -0.3);
    tipShape.closePath();
    const tip = m(new ShapeGeometry(tipShape), T(0xf4e7c5, { side: DoubleSide }), { p: [2.65, 0, 0] });
    arm.add(tip);
    const label = new Mesh(
      new PlaneGeometry(2.4, 0.5),
      decal('sign-' + a.text, () => tex(signCanvas(a.text, 512, 110, '#f4e7c5', '#1d140f'))),
    );
    label.position.set(1.35, 0, 0.07);
    arm.add(label);
    const back = label.clone();
    back.position.z = -0.07;
    back.rotation.y = Math.PI;
    arm.add(back);
    g.add(arm);
  });
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r: 0.25, y0: y, y1: y + 4.6 });
  return g;
}

/** Flat hanging sign with text. */
export function sign(text: string, w: number, h: number, bg = '#f4e7c5', fg = '#1d140f') {
  return new Mesh(new PlaneGeometry(w, h), decal(`s-${text}-${bg}`, () => tex(signCanvas(text, 1024, Math.round((1024 * h) / w), bg, fg))));
}

const stripeMats = new Map<string, ReturnType<typeof toon>>();
export function stripeMat(a: string, b: string, n = 8, vertical = true) {
  const k = a + b + n + vertical;
  let mat = stripeMats.get(k);
  if (!mat) {
    mat = toon(0xffffff, { map: stripeTex(a, b, n, vertical), mottle: 0.25, key: 'stripe-' + k, side: DoubleSide });
    stripeMats.set(k, mat);
  }
  return mat;
}

export function tent(ctx: Ctx, x: number, z: number, r = 4, hgt = 3, a = '#d2402f', b = '#fbf0d4', yaw = 0) {
  const y = footY(ctx, x, z, r) - 0.1;
  const g = grp(x, y, z, yaw);
  const wallM = stripeMat(a, b, 12);
  g.add(m(new CylinderGeometry(r, r * 1.04, hgt, 24, 1, true), wallM, { p: [0, hgt / 2, 0] }));
  g.add(m(new CylinderGeometry(r * 0.98, r * 0.98, 0.1, 24), T(0x5a3d26), { p: [0, 0.05, 0] }));
  const roof = m(new CylinderGeometry(0.15, r * 1.12, hgt * 0.9, 24, 1), wallM, { p: [0, hgt + hgt * 0.45, 0] });
  g.add(roof);
  // scalloped valance
  for (let i = 0; i < 16; i++) {
    const an = (i / 16) * Math.PI * 2;
    g.add(
      m(G.sphere(r * 0.2, 10, 8), T(i % 2 ? a : b), {
        p: [Math.cos(an) * r * 1.08, hgt + 0.05, Math.sin(an) * r * 1.08],
        s: [1, 0.5, 0.4],
        r: [0, -an, 0],
      }),
    );
  }
  g.add(m(G.cyl(0.07, 0.07, 1.6, 6), T(0x3a2e28), { p: [0, hgt * 1.9 + 0.7, 0] }));
  const flag = m(new PlaneGeometry(1, 0.6), T(PAL.gold, { side: DoubleSide }), { p: [0.5, hgt * 1.9 + 1.25, 0], dynamic: true });
  g.add(flag);
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r: r + 0.1, y0: y, y1: y + hgt + hgt * 0.3 });
  return { g, flag };
}

export function mushroom(ctx: Ctx, x: number, z: number, capR = 2.2, stemH = 2.4, bounce = 22, color: number = PAL.mushroom, y?: number) {
  const yy = y ?? ctx.terrain.heightAt(x, z) - 0.1;
  const g = grp(x, yy, z, Math.random() * 6);
  g.add(m(G.cyl(capR * 0.3, capR * 0.4, stemH, 14), T(0xf6ead0), { p: [0, stemH / 2, 0] }));
  const cap = m(new IcosahedronGeometry(1, 3), T(color, { gloss: true }), { p: [0, stemH, 0], s: [capR, capR * 0.55, capR] });
  g.add(cap);
  g.add(m(G.cyl(capR * 0.98, capR * 0.6, 0.3, 20), T(0xf3e2c0), { p: [0, stemH - 0.05, 0] }));
  const r = rng(Math.floor(x * 13 + z * 7));
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const rr = capR * (0.3 + r() * 0.5);
    const py = stemH + capR * 0.55 * Math.sqrt(Math.max(0, 1 - (rr / capR) ** 2)) * 0.97;
    g.add(m(G.sphere(capR * 0.16, 10, 8), T(0xfffaf0), { p: [Math.cos(a) * rr, py, Math.sin(a) * rr], s: [1, 0.35, 1] }));
  }
  alive(g, 0.06, r(), 0.03);
  ctx.root.add(g);
  const top = yy + stemH + capR * 0.45;
  ctx.physics.cyl({ x, z, r: capR * 0.85, y0: yy + stemH - 0.3, y1: top, bounce, tag: 'mushroom' });
  ctx.physics.cyl({ x, z, r: capR * 0.32, y0: yy, y1: yy + stemH - 0.3 });
  return { g, top };
}

export function palm(ctx: Ctx, x: number, z: number, hgt = 7, seed = 1) {
  const y = ctx.terrain.heightAt(x, z) - 0.2;
  const g = grp(x, y, z, seed * 2.1);
  const bark = T(0xa77b4f);
  let px = 0;
  let py = 0;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const nx = Math.sin(t * 1.2) * 1.4;
    g.add(m(G.cyl(0.28 - t * 0.08, 0.34 - t * 0.08, hgt / segs + 0.15, 10), bark, { p: [nx, py + hgt / segs / 2, 0], r: [0, 0, -0.18 * t] }));
    px = nx;
    py += hgt / segs;
  }
  const leaf = T(0x5f9a3a, { side: DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const l = m(G.cone(0.55, 3.4, 4), leaf, { p: [px + Math.cos(a) * 1.4, py - 0.2, Math.sin(a) * 1.4], s: [1, 1, 0.25] });
    l.rotation.set(0, -a, 0);
    l.rotateZ(-Math.PI / 2 - 0.35);
    g.add(l);
  }
  for (let i = 0; i < 3; i++) g.add(m(G.sphere(0.32, 10, 8), T(0x7a4a29, { gloss: true }), { p: [px + Math.cos(i * 2) * 0.35, py - 0.35, Math.sin(i * 2) * 0.35] }));
  alive(g, 0.02, seed * 0.13, 0.05);
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r: 0.4, y0: y, y1: y + hgt });
}

export function umbrella(ctx: Ctx, x: number, z: number, a = '#d2402f', b = '#fbf0d4') {
  const y = ctx.terrain.heightAt(x, z);
  const g = grp(x, y, z, Math.random() * 6);
  g.add(m(G.cyl(0.07, 0.07, 3.2, 6), T(0xfbf0d4), { p: [0, 1.6, 0], r: [0.12, 0, 0] }));
  g.add(m(new CylinderGeometry(0.1, 2.4, 0.9, 12, 1, true), stripeMat(a, b, 12), { p: [0, 3.2, 0.2], r: [0.12, 0, 0] }));
  ctx.root.add(g);
  ctx.physics.cyl({ x, z, r: 0.15, y0: y, y1: y + 3 });
}

/** Pennant bunting along a sagging line between two points. */
export function bunting(root: Group, a: Vector3, b: Vector3, count = 12, sag = 1.2) {
  const cols = ['#d2402f', '#f2b83b', '#3d8f94', '#fbf0d4', '#f08fa6'];
  const line: number[] = [];
  const g = new Group();
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    line.push(p.x, p.y, p.z);
  }
  // thin rope as a chain of small boxes
  for (let i = 0; i < 24; i++) {
    const p0 = new Vector3(line[i * 3], line[i * 3 + 1], line[i * 3 + 2]);
    const p1 = new Vector3(line[i * 3 + 3], line[i * 3 + 4], line[i * 3 + 5]);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const len = p0.distanceTo(p1);
    const seg = m(G.box(0.025, 0.025, 1), T(0x8a6a4a), { shadow: false });
    seg.position.copy(mid);
    seg.scale.z = len;
    seg.lookAt(p1);
    g.add(seg);
  }
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    const tri = new BufferGeometry();
    tri.setAttribute('position', new Float32BufferAttribute([-0.32, 0, 0, 0.32, 0, 0, 0, -0.75, 0], 3));
    tri.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    tri.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
    const f = m(tri, T(cols[i % cols.length], { side: DoubleSide }), { shadow: false });
    f.position.copy(p);
    f.lookAt(p.clone().add(new Vector3(-(b.z - a.z), 0, b.x - a.x)));
    g.add(f);
  }
  root.add(g);
  return g;
}

export function fence(ctx: Ctx, pts: Array<[number, number]>, spacing = 2.4) {
  const wood = T(0xe9dcc0);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ctx.terrain.heightAt(x, z);
      ctx.root.add(m(G.box(0.22, 1.5, 0.22), wood, { p: [x, y + 0.7, z] }));
      ctx.root.add(m(G.cone(0.17, 0.3, 4), wood, { p: [x, y + 1.6, z], r: [0, Math.PI / 4, 0] }));
      if (k < n) {
        const x2 = ax + (bx - ax) * ((k + 0.5) / n);
        const z2 = az + (bz - az) * ((k + 0.5) / n);
        const y2 = ctx.terrain.heightAt(x2, z2);
        for (const hh of [0.55, 1.1]) ctx.root.add(m(G.box(0.1, 0.16, len / n + 0.1), wood, { p: [x2, y2 + hh, z2], r: [0, yaw, 0] }));
      }
    }
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const cy = ctx.terrain.heightAt(cx, cz);
    ctx.physics.box({ x: cx, z: cz, yaw, hx: 0.2, hz: len / 2, y0: cy - 1, y1: cy + 1.5 });
  }
}

export function flowerPatch(root: Group, terrain: Terrain, cx: number, cz: number, radius: number, count: number, seed: number) {
  const r = rng(seed);
  const cols = [0xd2402f, 0xf2b83b, 0xfffaf0, 0xf08fa6, 0x8a6bb0];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius;
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const y = terrain.heightAt(x, z);
    const c = cols[Math.floor(r() * cols.length)];
    root.add(m(G.cyl(0.03, 0.03, 0.5, 4), T(0x4f7f35), { p: [x, y + 0.25, z], shadow: false }));
    root.add(m(G.sphere(0.16, 8, 6), T(c), { p: [x, y + 0.52, z], s: [1, 0.6, 1], shadow: false }));
  }
}
