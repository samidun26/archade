import { BufferAttribute, BufferGeometry, Material, Mesh, Vector3 } from 'three';

// A "rubber hose" limb: a tube along a quadratic bezier from root to tip that bows
// outward when the limb is shorter than its rest length, like a noodle.

const RAD = 8;

export class HoseLimb extends Mesh {
  private segs: number;
  private pos: Float32Array;
  private nor: Float32Array;
  readonly root = new Vector3();
  readonly tip = new Vector3();
  /** Preferred bend direction (in the limb's parent space). */
  readonly bendDir = new Vector3(0, 0, 1);
  restLength: number;
  radius: number;

  constructor(material: Material, restLength: number, radius: number, segs = 12) {
    const g = new BufferGeometry();
    const vcount = (segs + 1) * RAD;
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const idx: number[] = [];
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < RAD; j++) {
        const a = i * RAD + j;
        const b = i * RAD + ((j + 1) % RAD);
        const c = (i + 1) * RAD + j;
        const d = (i + 1) * RAD + ((j + 1) % RAD);
        idx.push(a, b, c, b, d, c);
      }
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.setIndex(idx);
    super(g, material);
    this.segs = segs;
    this.pos = pos;
    this.nor = nor;
    this.restLength = restLength;
    this.radius = radius;
    this.frustumCulled = false;
    this.castShadow = true;
    this.userData.dynamic = true;
  }

  private static _p = new Vector3();
  private static _t = new Vector3();
  private static _n = new Vector3();
  private static _b = new Vector3();
  private static _c = new Vector3();
  private static _ref = new Vector3();
  private static _d1 = new Vector3();
  private static _d2 = new Vector3();

  update() {
    const { root, tip } = this;
    const L = root.distanceTo(tip);
    const slack = Math.max(0, this.restLength - L);
    const ctrl = HoseLimb._c.copy(root).add(tip).multiplyScalar(0.5);
    // bow outward by an amount that keeps the curve length close to rest length
    const bow = Math.sqrt(Math.max(0, this.restLength * this.restLength - L * L)) * 0.5 + slack * 0.15;
    ctrl.addScaledVector(this.bendDir, bow);

    const p = HoseLimb._p;
    const t = HoseLimb._t;
    const n = HoseLimb._n;
    const b = HoseLimb._b;
    const ref = HoseLimb._ref;
    const d1 = HoseLimb._d1.copy(ctrl).sub(root);
    const d2 = HoseLimb._d2.copy(tip).sub(ctrl);
    for (let i = 0; i <= this.segs; i++) {
      const s = i / this.segs;
      const u = 1 - s;
      // bezier point & tangent
      p.set(0, 0, 0)
        .addScaledVector(root, u * u)
        .addScaledVector(ctrl, 2 * u * s)
        .addScaledVector(tip, s * s);
      t.set(0, 0, 0).addScaledVector(d1, 2 * u).addScaledVector(d2, 2 * s).normalize();
      if (i === 0) {
        ref.set(0, 1, 0);
        if (Math.abs(t.dot(ref)) > 0.9) ref.set(1, 0, 0);
        n.crossVectors(t, ref).normalize();
      } else {
        // parallel transport of the previous normal to avoid twisting
        n.addScaledVector(t, -n.dot(t)).normalize();
      }
      b.crossVectors(t, n).normalize();
      // slight taper toward the tip, a touch fatter at the middle
      const r = this.radius * (1 + Math.sin(s * Math.PI) * 0.12 - s * 0.1);
      for (let j = 0; j < RAD; j++) {
        const a = (j / RAD) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = n.x * ca + b.x * sa;
        const ny = n.y * ca + b.y * sa;
        const nz = n.z * ca + b.z * sa;
        const k = (i * RAD + j) * 3;
        this.pos[k] = p.x + nx * r;
        this.pos[k + 1] = p.y + ny * r;
        this.pos[k + 2] = p.z + nz * r;
        this.nor[k] = nx;
        this.nor[k + 1] = ny;
        this.nor[k + 2] = nz;
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
  }
}
