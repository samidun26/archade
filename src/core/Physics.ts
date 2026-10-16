// Lightweight character-vs-world collision. The world is a heightfield plus a set of
// vertical boxes (yaw-rotated) and cylinders. Moving colliders carry whoever stands on them.

import { Object3D, Vector3 } from 'three';

export type Shape = 'box' | 'cyl';

export interface Collider {
  shape: Shape;
  x: number;
  z: number;
  y0: number; // bottom
  y1: number; // top
  yaw: number;
  hx: number; // box half extents
  hz: number;
  r: number; // cylinder radius
  oneWay?: boolean; // only solid from above
  bounce?: number; // launch velocity when landed on
  tag?: string;
  enabled: boolean;
  dynamic: boolean;
  // previous transform for carrying riders
  px: number;
  pz: number;
  py1: number;
  pyaw: number;
  /** Optional: follow this object's world transform each frame. */
  follow?: Object3D;
  followOffsetY?: number;
  onLand?: () => void;
}

export interface ColliderInit {
  x: number;
  z: number;
  y0: number;
  y1: number;
  yaw?: number;
  hx?: number;
  hz?: number;
  r?: number;
  oneWay?: boolean;
  bounce?: number;
  tag?: string;
  dynamic?: boolean;
  onLand?: () => void;
}

export interface GroundProvider {
  heightAt(x: number, z: number): number;
}

const CELL = 16;
const tmp = new Vector3();

export class Physics {
  readonly statics: Collider[] = [];
  readonly dynamics: Collider[] = [];
  private grid = new Map<string, Collider[]>();

  constructor(public ground: GroundProvider) {}

  private make(shape: Shape, o: ColliderInit): Collider {
    return {
      shape,
      x: o.x,
      z: o.z,
      y0: o.y0,
      y1: o.y1,
      yaw: o.yaw ?? 0,
      hx: o.hx ?? 0.5,
      hz: o.hz ?? 0.5,
      r: o.r ?? 0.5,
      oneWay: o.oneWay,
      bounce: o.bounce,
      tag: o.tag,
      enabled: true,
      dynamic: !!o.dynamic,
      px: o.x,
      pz: o.z,
      py1: o.y1,
      pyaw: o.yaw ?? 0,
      onLand: o.onLand,
    };
  }

  box(o: ColliderInit) {
    const c = this.make('box', o);
    this.insert(c);
    return c;
  }

  cyl(o: ColliderInit) {
    const c = this.make('cyl', o);
    this.insert(c);
    return c;
  }

  private insert(c: Collider) {
    if (c.dynamic) {
      this.dynamics.push(c);
      return;
    }
    this.statics.push(c);
    const ext = c.shape === 'box' ? Math.hypot(c.hx, c.hz) : c.r;
    const x0 = Math.floor((c.x - ext) / CELL);
    const x1 = Math.floor((c.x + ext) / CELL);
    const z0 = Math.floor((c.z - ext) / CELL);
    const z1 = Math.floor((c.z + ext) / CELL);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const k = i + ',' + j;
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
  }

  remove(c: Collider) {
    c.enabled = false;
  }

  /** Begin a physics frame: remember transforms so riders can be carried. */
  beginFrame() {
    for (const c of this.dynamics) {
      c.px = c.x;
      c.pz = c.z;
      c.py1 = c.y1;
      c.pyaw = c.yaw;
    }
  }

  /** Sync dynamic colliders that follow scene objects. */
  syncFollowers() {
    for (const c of this.dynamics) {
      if (!c.follow) continue;
      c.follow.getWorldPosition(tmp);
      const h = c.y1 - c.y0;
      c.x = tmp.x;
      c.z = tmp.z;
      c.y1 = tmp.y + (c.followOffsetY ?? 0);
      c.y0 = c.y1 - h;
    }
  }

  private seen = new Set<Collider>();
  private out: Collider[] = [];
  nearby(x: number, z: number, r: number): Collider[] {
    this.out.length = 0;
    this.seen.clear();
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const arr = this.grid.get(i + ',' + j);
        if (!arr) continue;
        for (const c of arr)
          if (c.enabled && !this.seen.has(c)) {
            this.seen.add(c);
            this.out.push(c);
          }
      }
    for (const c of this.dynamics) if (c.enabled) this.out.push(c);
    return this.out;
  }

  /** Where would a point standing on collider c be after c moved this frame? */
  carry(c: Collider, p: Vector3): number {
    const dyaw = c.yaw - c.pyaw;
    let dx = p.x - c.px;
    let dz = p.z - c.pz;
    if (dyaw !== 0) {
      const cs = Math.cos(dyaw);
      const sn = Math.sin(dyaw);
      const rx = dx * cs + dz * sn;
      const rz = -dx * sn + dz * cs;
      dx = rx;
      dz = rz;
    }
    p.x = c.x + dx;
    p.z = c.z + dz;
    p.y += c.y1 - c.py1;
    return dyaw;
  }

  /** Point-in-footprint test with a margin (positive grows the shape). */
  inside(c: Collider, x: number, z: number, margin: number) {
    if (c.shape === 'cyl') return Math.hypot(x - c.x, z - c.z) <= c.r + margin;
    const cs = Math.cos(-c.yaw);
    const sn = Math.sin(-c.yaw);
    const dx = x - c.x;
    const dz = z - c.z;
    const lx = dx * cs + dz * sn;
    const lz = -dx * sn + dz * cs;
    return Math.abs(lx) <= c.hx + margin && Math.abs(lz) <= c.hz + margin;
  }

  /**
   * Push a vertical cylinder body (feet at p.y, given radius/height) out of collider c horizontally.
   * Returns the push normal (xz) via out param when a push happened.
   */
  pushOut(c: Collider, p: Vector3, radius: number, n: { x: number; z: number }): boolean {
    if (c.shape === 'cyl') {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d >= min) return false;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      p.x = c.x + nx * min;
      p.z = c.z + nz * min;
      n.x = nx;
      n.z = nz;
      return true;
    }
    const cs = Math.cos(-c.yaw);
    const sn = Math.sin(-c.yaw);
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    let lx = dx * cs + dz * sn;
    let lz = -dx * sn + dz * cs;
    const cx = Math.max(-c.hx, Math.min(c.hx, lx));
    const cz = Math.max(-c.hz, Math.min(c.hz, lz));
    let ex = lx - cx;
    let ez = lz - cz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= radius * radius) return false;
    let nlx: number;
    let nlz: number;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      nlx = ex / d;
      nlz = ez / d;
      lx = cx + nlx * radius;
      lz = cz + nlz * radius;
    } else {
      // center inside the box: leave along the shallowest axis
      const penX = c.hx - Math.abs(lx);
      const penZ = c.hz - Math.abs(lz);
      if (penX < penZ) {
        nlx = Math.sign(lx) || 1;
        nlz = 0;
        lx = nlx * (c.hx + radius);
      } else {
        nlx = 0;
        nlz = Math.sign(lz) || 1;
        lz = nlz * (c.hz + radius);
      }
    }
    // back to world (rotate by +yaw)
    const cs2 = Math.cos(c.yaw);
    const sn2 = Math.sin(c.yaw);
    p.x = c.x + lx * cs2 + lz * sn2;
    p.z = c.z - lx * sn2 + lz * cs2;
    n.x = nlx * cs2 + nlz * sn2;
    n.z = -nlx * sn2 + nlz * cs2;
    return true;
  }

  /** Highest walkable surface under (x,z) at or below `maxY`. */
  supportAt(x: number, z: number, maxY: number, margin: number): { y: number; c: Collider | null } {
    let best = this.ground.heightAt(x, z);
    let bc: Collider | null = null;
    for (const c of this.nearby(x, z, 2)) {
      if (c.y1 > maxY || c.y1 <= best) continue;
      if (this.inside(c, x, z, margin)) {
        best = c.y1;
        bc = c;
      }
    }
    return { y: best, c: bc };
  }

  /** Ray vs world (for camera collision). Returns hit distance or Infinity. */
  raycast(o: Vector3, d: Vector3, maxDist: number, skipOneWay = true): number {
    let best = maxDist;
    // terrain: march
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * best;
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      if (y < this.ground.heightAt(x, z) + 0.35) {
        best = Math.max(0, t - best / steps);
        break;
      }
    }
    const cx = o.x + d.x * best * 0.5;
    const cz = o.z + d.z * best * 0.5;
    for (const c of this.nearby(cx, cz, best * 0.5 + 2)) {
      if ((skipOneWay && c.oneWay) || c.tag === 'rail') continue;
      const t = this.rayCollider(c, o, d, best);
      if (t < best) best = t;
    }
    return best;
  }

  private rayCollider(c: Collider, o: Vector3, d: Vector3, maxT: number): number {
    if (c.shape === 'cyl') {
      const ox = o.x - c.x;
      const oz = o.z - c.z;
      const a = d.x * d.x + d.z * d.z;
      if (a < 1e-8) return Infinity;
      const b = 2 * (ox * d.x + oz * d.z);
      const cc = ox * ox + oz * oz - c.r * c.r;
      if (cc < 0) return Infinity; // starting inside: ignore
      const disc = b * b - 4 * a * cc;
      if (disc < 0) return Infinity;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > maxT) return Infinity;
      const y = o.y + d.y * t;
      if (y < c.y0 || y > c.y1) return Infinity;
      return t;
    }
    // box in local space (slab test)
    const cs = Math.cos(-c.yaw);
    const sn = Math.sin(-c.yaw);
    const ox = o.x - c.x;
    const oz = o.z - c.z;
    const lox = ox * cs + oz * sn;
    const loz = -ox * sn + oz * cs;
    const ldx = d.x * cs + d.z * sn;
    const ldz = -d.x * sn + d.z * cs;
    let tmin = 0;
    let tmax = maxT;
    const slab = (oo: number, dd: number, lo: number, hi: number) => {
      if (Math.abs(dd) < 1e-8) return oo >= lo && oo <= hi;
      let t1 = (lo - oo) / dd;
      let t2 = (hi - oo) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };
    if (!slab(lox, ldx, -c.hx, c.hx)) return Infinity;
    if (!slab(loz, ldz, -c.hz, c.hz)) return Infinity;
    if (!slab(o.y, d.y, c.y0, c.y1)) return Infinity;
    if (tmin <= 0) return Infinity; // inside
    return tmin;
  }
}
