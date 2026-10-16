import {
  Color,
  DynamicDrawUsage,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  Shape,
  Vector3,
  type BufferGeometry,
} from 'three';
import { toon } from '../render/materials';

export type PKind = 'puff' | 'spark' | 'star' | 'splash' | 'ink' | 'confetti' | 'smoke' | 'rain';

interface P {
  alive: boolean;
  pos: Vector3;
  vel: Vector3;
  life: number;
  max: number;
  size: number;
  grow: number;
  drag: number;
  grav: number;
  spin: number;
  rot: number;
  axis: Vector3;
  color: Color;
  stretch: number;
}

function starGeometry() {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 0.45 : 1;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
  g.center();
  return g;
}

class Pool {
  readonly mesh: InstancedMesh;
  readonly ps: P[] = [];
  private cursor = 0;
  constructor(geo: BufferGeometry, n: number, emissive = false) {
    this.mesh = new InstancedMesh(
      geo,
      toon(0xffffff, { mottle: 0, gloss: emissive, emissive: emissive ? 0x553311 : undefined }),
      n,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < n; i++) {
      this.ps.push({
        alive: false,
        pos: new Vector3(),
        vel: new Vector3(),
        life: 0,
        max: 1,
        size: 1,
        grow: 0,
        drag: 0,
        grav: 0,
        spin: 0,
        rot: 0,
        axis: new Vector3(0, 1, 0),
        color: new Color(),
        stretch: 0,
      });
      this.mesh.setColorAt(i, new Color(1, 1, 1));
    }
    this.mesh.count = n;
  }
  next(): P {
    for (let k = 0; k < this.ps.length; k++) {
      const i = (this.cursor + k) % this.ps.length;
      if (!this.ps[i].alive) {
        this.cursor = i + 1;
        return this.ps[i];
      }
    }
    this.cursor = (this.cursor + 1) % this.ps.length;
    return this.ps[this.cursor];
  }
}

const m4 = new Matrix4();
const q = new Quaternion();
const sc = new Vector3();
const dummy = new Object3D();

export class Particles extends Object3D {
  private spheres: Pool;
  private stars: Pool;

  constructor() {
    super();
    this.spheres = new Pool(new IcosahedronGeometry(0.5, 2), 500);
    this.stars = new Pool(starGeometry(), 120, true);
    this.add(this.spheres.mesh, this.stars.mesh);
  }

  emit(
    kind: PKind,
    pos: Vector3,
    vel: Vector3,
    o: { size?: number; life?: number; color?: number; grav?: number; drag?: number; grow?: number; stretch?: number } = {},
  ) {
    const pool = kind === 'star' || kind === 'confetti' ? this.stars : this.spheres;
    const p = pool.next();
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    const defaults: Record<PKind, [number, number, number, number, number, number]> = {
      // size, life, color, grav, drag, grow
      puff: [0.5, 0.55, 0xfbf0d4, -1.5, 3, 1.4],
      smoke: [0.8, 1.2, 0x8f8a8a, -2, 1.5, 1.2],
      spark: [0.16, 0.4, 0xffd75e, 6, 1, -0.3],
      star: [0.32, 0.9, 0xf2b83b, 9, 0.5, -0.2],
      splash: [0.3, 0.6, 0xe9f6f4, 18, 0.4, -0.4],
      ink: [0.3, 0.7, 0x1d140f, 14, 0.5, -0.2],
      confetti: [0.2, 2.2, 0xd2402f, 3, 1.4, 0],
      rain: [0.12, 0.6, 0x9fb4d8, 0, 0, 0],
    };
    const d = defaults[kind];
    p.size = o.size ?? d[0];
    p.max = p.life = o.life ?? d[1];
    p.color.set(o.color ?? d[2]);
    p.grav = o.grav ?? d[3];
    p.drag = o.drag ?? d[4];
    p.grow = o.grow ?? d[5];
    p.stretch = o.stretch ?? 0;
    p.spin = (Math.random() - 0.5) * 12;
    p.rot = Math.random() * 6;
    p.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    return p;
  }

  burst(kind: PKind, pos: Vector3, count: number, speed: number, o: Parameters<Particles['emit']>[3] & { up?: number; spread?: number } = {}) {
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random() * 0.7);
      const up = o.up ?? 0.5;
      v.set(Math.cos(a) * s, (Math.random() * 0.6 + up) * s, Math.sin(a) * s);
      if (o.spread !== undefined) v.y *= o.spread;
      this.emit(kind, pos, v, o);
    }
  }

  /** Ring of dust puffs on the ground (landing, stomps). */
  ring(pos: Vector3, count: number, speed: number, size = 0.45) {
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      v.set(Math.cos(a) * speed, 0.6, Math.sin(a) * speed);
      this.emit('puff', pos, v, { size: size * (0.8 + Math.random() * 0.4) });
    }
  }

  update(dt: number) {
    for (const pool of [this.spheres, this.stars]) {
      const mesh = pool.mesh;
      for (let i = 0; i < pool.ps.length; i++) {
        const p = pool.ps[i];
        if (!p.alive) {
          m4.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, m4);
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          m4.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, m4);
          continue;
        }
        p.vel.y -= p.grav * dt;
        p.vel.multiplyScalar(Math.exp(-p.drag * dt));
        p.pos.addScaledVector(p.vel, dt);
        p.rot += p.spin * dt;
        const t = 1 - p.life / p.max;
        // pop in, then shrink away (opaque cel look: no alpha fades)
        const env = Math.min(1, t * 6) * (1 - Math.pow(t, 3));
        const s = Math.max(0.0001, p.size * env * (1 + p.grow * t));
        q.setFromAxisAngle(p.axis, p.rot);
        if (p.stretch > 0) {
          dummy.position.copy(p.pos);
          dummy.lookAt(p.pos.clone().add(p.vel));
          dummy.scale.set(s, s, s * (1 + p.stretch));
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        } else {
          sc.set(s, s, s);
          m4.compose(p.pos, q, sc);
          mesh.setMatrixAt(i, m4);
        }
        mesh.setColorAt(i, p.color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
