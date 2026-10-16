import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
  BoxGeometry,
  Sprite,
} from 'three';
import { PAL, toon } from '../render/materials';
import { canvas, INK, tex } from '../render/textures';
import { makeGlowSprite } from '../render/Sky';
import { patchUnlit } from '../render/gbuffer';
import { G, m } from './kit';

// ------------------------------------------------------------------ tokens
function tokenTexture() {
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#f2b83b';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#a8701a';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(128, 128, 96, 0, Math.PI * 2);
  g.stroke();
  // a little star with a smile
  g.fillStyle = '#ffd75e';
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 30 : 66;
    const x = 128 + Math.cos(a) * r;
    const y = 132 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.ellipse(116, 124, 5, 9, 0, 0, Math.PI * 2);
  g.ellipse(140, 124, 5, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(128, 140, 12, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  return tex(c);
}

export interface Token {
  id: string;
  pos: Vector3;
  taken: boolean;
  hidden: boolean;
  pop: number; // collect animation timer
  phase: number;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _up = new Vector3(0, 1, 0);

const _c = new Vector3();

export class Tokens extends Group {
  readonly list: Token[] = [];
  private mesh!: InstancedMesh;

  place(id: string, x: number, y: number, z: number, hidden = false) {
    this.list.push({ id, pos: new Vector3(x, y, z), taken: false, hidden, pop: 0, phase: this.list.length * 0.37 });
  }

  /** Unhide tokens whose id starts with `prefix` (rewards that pop out of things). */
  reveal(prefix: string) {
    for (const k of this.list) if (k.id.startsWith(prefix)) k.hidden = false;
  }

  build() {
    const geo = new CylinderGeometry(0.45, 0.45, 0.12, 24);
    geo.rotateX(Math.PI / 2);
    this.mesh = new InstancedMesh(geo, toon(0xffffff, { map: tokenTexture(), gloss: true, mottle: 0, key: 'token' }), Math.max(1, this.list.length));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.add(this.mesh);
  }

  get total() {
    return this.list.length;
  }

  /** Returns tokens collected this frame. Tokens within `magnet` drift toward the player. */
  update(dt: number, t: number, player: Vector3, magnet = 2.6): Token[] {
    const got: Token[] = [];
    _c.copy(player);
    _c.y += 1.0;
    for (let i = 0; i < this.list.length; i++) {
      const k = this.list[i];
      if (k.hidden) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      if (k.taken) {
        if (k.pop > 0) {
          k.pop = Math.max(0, k.pop - dt);
          const s = (k.pop / 0.25) * 1.6;
          _q.setFromAxisAngle(_up, t * 20);
          _s.set(s, s, s);
          _p.set(k.pos.x, k.pos.y + (0.25 - k.pop) * 6, k.pos.z);
          _m.compose(_p, _q, _s);
        } else _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      const d = k.pos.distanceTo(_c);
      if (d < magnet) k.pos.lerp(_c, Math.min(1, dt * (magnet - d) * 5));
      if (k.pos.distanceTo(_c) < 1.1) {
        k.taken = true;
        k.pop = 0.25;
        got.push(k);
      }
      _q.setFromAxisAngle(_up, t * 2.6 + k.phase);
      _s.set(1, 1, 1);
      _p.set(k.pos.x, k.pos.y + Math.sin(t * 3 + k.phase) * 0.15, k.pos.z);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }

  restore(taken: Set<string>) {
    for (const k of this.list) if (taken.has(k.id)) k.taken = true;
  }
}

/** Lay `n` token ids along a straight line (inclusive), sitting `hover` above the ground. */
export function tokenLine(
  tokens: Tokens,
  idPrefix: string,
  a: [number, number],
  b: [number, number],
  n: number,
  heightAt: (x: number, z: number) => number,
  hover = 1.2,
) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    tokens.place(`${idPrefix}${i}`, x, heightAt(x, z) + hover, z);
  }
}
/** Arc of tokens between two 3D points (for jump/bounce trajectories). */
export function tokenArc(tokens: Tokens, idPrefix: string, a: Vector3, b: Vector3, n: number, lift: number) {
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const p = a.clone().lerp(b, t);
    p.y += Math.sin(t * Math.PI) * lift;
    tokens.place(`${idPrefix}${i}`, p.x, p.y, p.z);
  }
}
/** Ring of tokens. */
export function tokenRing(tokens: Tokens, idPrefix: string, cx: number, y: number, cz: number, r: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    tokens.place(`${idPrefix}${i}`, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  }
}

// ------------------------------------------------------------------ film reels
export class Reel extends Group {
  visibleInWorld = false;
  taken = false;
  private spinner = new Group();
  private beam: Mesh;
  private glow: Sprite;
  private appearT = 0;

  constructor(readonly key: string, readonly title: string) {
    super();
    const gold = toon(PAL.gold, { gloss: true, mottle: 0.1 });
    const dark = toon(0x3a2e28, { mottle: 0.1 });
    this.spinner.add(m(new TorusGeometry(1.0, 0.16, 12, 36), gold));
    this.spinner.add(m(new CylinderGeometry(0.96, 0.96, 0.12, 36).rotateX(Math.PI / 2), dark));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      // holes as golden spokes between dark discs
      const spoke = m(new BoxGeometry(0.16, 0.9, 0.2), gold, { p: [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0], r: [0, 0, a + Math.PI / 2] });
      this.spinner.add(spoke);
      this.spinner.add(m(G.sphere(0.2, 12, 10), toon(0xf6e2a6, { mottle: 0 }), { p: [Math.cos(a + 0.52) * 0.6, Math.sin(a + 0.52) * 0.6, 0.08], s: [1, 1, 0.3] }));
    }
    this.spinner.add(m(new CylinderGeometry(0.22, 0.22, 0.35, 16).rotateX(Math.PI / 2), gold));
    // a loose curl of film
    const film = m(new TorusGeometry(0.55, 0.06, 6, 20, Math.PI * 1.2), dark, { p: [0.9, -0.7, 0], r: [0, 0, -0.6] });
    this.spinner.add(film);
    this.spinner.position.y = 1.4;
    this.spinner.scale.setScalar(0.95);
    this.spinner.userData.dynamic = true;
    this.add(this.spinner);

    const beamMat = patchUnlit(
      new MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.22, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
      'keep',
    );
    this.beam = new Mesh(new CylinderGeometry(0.9, 1.4, 70, 16, 1, true), beamMat);
    this.beam.position.y = 35;
    this.beam.renderOrder = 5;
    this.add(this.beam);
    this.glow = makeGlowSprite(0xffd66b, 5);
    this.glow.position.y = 1.4;
    this.add(this.glow);
    this.visible = false;
    this.userData.dynamic = true;
  }

  get center() {
    return this.getWorldPosition(new Vector3()).add(new Vector3(0, 1.4, 0));
  }

  reveal(instant = false) {
    if (this.taken) return;
    this.visibleInWorld = true;
    this.visible = true;
    this.appearT = instant ? 1 : 0;
  }

  collect() {
    this.taken = true;
    this.visibleInWorld = false;
    this.visible = false;
  }

  update(dt: number, t: number) {
    if (!this.visible) return;
    this.appearT = Math.min(1, this.appearT + dt * 1.5);
    const s = this.appearT < 1 ? Math.sin(this.appearT * Math.PI * 0.5) * (1 + Math.sin(this.appearT * Math.PI) * 0.4) : 1;
    this.spinner.scale.setScalar(0.95 * s);
    this.spinner.rotation.y = t * 1.6;
    this.spinner.position.y = 1.4 + Math.sin(t * 2) * 0.2;
    this.glow.position.y = this.spinner.position.y;
    (this.beam.material as MeshBasicMaterial).opacity = 0.16 + Math.sin(t * 3) * 0.05;
  }
}

// ------------------------------------------------------------------ lanterns
export class Lantern extends Group {
  lit = false;
  private glass: Mesh;
  private flame: Mesh;
  private glow: Sprite;
  private litT = 0;

  constructor(readonly key: string, postHeight = 2.4) {
    super();
    const iron = toon(0x2e2622, { gloss: true, mottle: 0.2 });
    this.add(m(G.cyl(0.12, 0.16, postHeight, 8), iron, { p: [0, postHeight / 2, 0] }));
    this.add(m(G.box(0.8, 0.12, 0.8), iron, { p: [0, postHeight + 0.06, 0] }));
    this.glass = m(G.cyl(0.32, 0.26, 0.75, 6), toon(0x6c6a5c, { mottle: 0.1, key: 'lantern-off-' + key }), { p: [0, postHeight + 0.5, 0] });
    this.add(this.glass);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.add(m(G.box(0.05, 0.8, 0.05), iron, { p: [Math.cos(a) * 0.3, postHeight + 0.5, Math.sin(a) * 0.3] }));
    }
    this.add(m(G.cone(0.48, 0.45, 6), iron, { p: [0, postHeight + 1.1, 0] }));
    this.add(m(G.torus(0.14, 0.04, 6, 12), iron, { p: [0, postHeight + 1.42, 0] }));
    this.flame = m(G.sphere(0.14, 10, 8), toon(0xffd75e, { emissive: 0xffa53b, emissiveIntensity: 1.4, mottle: 0 }), { p: [0, postHeight + 0.5, 0], s: [1, 1.6, 1] });
    this.flame.visible = false;
    this.flame.userData.dynamic = true;
    this.add(this.flame);
    this.glow = makeGlowSprite(0xffc46b, 4.5);
    this.glow.position.y = postHeight + 0.5;
    this.glow.visible = false;
    this.add(this.glow);
    this.userData.dynamic = true;
    this.userData.postHeight = postHeight;
  }

  get top() {
    return this.getWorldPosition(new Vector3()).add(new Vector3(0, (this.userData.postHeight as number) + 0.5, 0));
  }

  light(instant = false) {
    if (this.lit) return;
    this.lit = true;
    this.litT = instant ? 1 : 0;
    const mat = this.glass.material as ReturnType<typeof toon>;
    mat.color.set(0xfff0b0);
    mat.emissive.set(0xffc35a);
    mat.emissiveIntensity = 0.9;
    this.flame.visible = true;
    this.glow.visible = true;
  }

  unlight() {
    this.lit = false;
    const mat = this.glass.material as ReturnType<typeof toon>;
    mat.color.set(0x6c6a5c);
    mat.emissive.set(0x000000);
    this.flame.visible = false;
    this.glow.visible = false;
  }

  update(dt: number, t: number) {
    if (!this.lit) return;
    this.litT = Math.min(1, this.litT + dt * 3);
    const f = 1 + Math.sin(t * 17 + this.key.length) * 0.08 + Math.sin(t * 29) * 0.05;
    this.flame.scale.set(f, 1.6 * f, f);
    this.glow.scale.setScalar(4.5 * f * this.litT);
  }
}
