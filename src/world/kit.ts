import {
  BufferAttribute,
  BoxGeometry,
  BufferGeometry,
  Matrix4,
  CylinderGeometry,
  ConeGeometry,
  Group,
  Material,
  Mesh,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { toon, type ToonOpts } from '../render/materials';
import type { MeshToonMaterial } from 'three';

// ---------- geometry cache (shared primitives) ----------
const geoCache = new Map<string, BufferGeometry>();
function cached<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g as T;
}
export const G = {
  box: (w = 1, h = 1, d = 1) => cached(`b${w},${h},${d}`, () => new BoxGeometry(w, h, d)),
  cyl: (rt = 0.5, rb = 0.5, h = 1, seg = 20) => cached(`c${rt},${rb},${h},${seg}`, () => new CylinderGeometry(rt, rb, h, seg)),
  cone: (r = 0.5, h = 1, seg = 20) => cached(`k${r},${h},${seg}`, () => new ConeGeometry(r, h, seg)),
  sphere: (r = 0.5, w = 20, h = 14) => cached(`s${r},${w},${h}`, () => new SphereGeometry(r, w, h)),
  torus: (r = 1, t = 0.2, rs = 10, ts = 28, arc = Math.PI * 2) =>
    cached(`t${r},${t},${rs},${ts},${arc}`, () => new TorusGeometry(r, t, rs, ts, arc)),
};

export interface MOpts {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: number | [number, number, number];
  shadow?: boolean;
  dynamic?: boolean; // keep out of static batching
}

export function m(geo: BufferGeometry, mat: Material, o: MOpts = {}) {
  const mesh = new Mesh(geo, mat);
  if (o.p) mesh.position.set(...o.p);
  if (o.r) mesh.rotation.set(...o.r);
  if (o.s !== undefined) {
    if (typeof o.s === 'number') mesh.scale.setScalar(o.s);
    else mesh.scale.set(...o.s);
  }
  mesh.castShadow = o.shadow ?? true;
  mesh.receiveShadow = true;
  if (o.dynamic) mesh.userData.dynamic = true;
  return mesh;
}

export const T = (c: ColorRepresentation, o?: ToonOpts) => toon(c, o);

/** Group helper positioned in the world. */
export function grp(x = 0, y = 0, z = 0, yaw = 0) {
  const g = new Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  return g;
}

// ---------- music-reactive "living" props ----------
export interface Living {
  obj: Object3D;
  base: Vector3;
  amount: number;
  offset: number;
  sway: number;
}
export const living: Living[] = [];
/** Make an object bounce on the beat, rubber-hose style. Pivot should be at its base. */
export function alive(obj: Object3D, amount = 0.05, offset = Math.random(), sway = 0.04) {
  obj.userData.dynamic = true;
  living.push({ obj, base: obj.scale.clone(), amount, offset, sway });
  return obj;
}
export function updateLiving(beat: number) {
  for (const l of living) {
    const ph = (beat + l.offset) % 1;
    // quick squash on the beat, then stretch back
    const b = Math.sin(ph * Math.PI * 2);
    const sy = 1 + b * l.amount;
    const sx = 1 / Math.sqrt(sy);
    l.obj.scale.set(l.base.x * sx, l.base.y * sy, l.base.z * sx);
    l.obj.rotation.z = Math.sin((beat + l.offset) * Math.PI) * l.sway;
  }
}

// ---------- static batching ----------
/** Concatenate non-indexed geometries that all carry position/normal/uv. */
function mergeGeometries(geos: BufferGeometry[]): BufferGeometry {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const withColor = geos.every((g) => g.attributes.color);
  const col = withColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    if (col) col.set(g.attributes.color.array as Float32Array, o * 3);
    o += n;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new BufferAttribute(col, 3));
  return out;
}

interface BatchInfo {
  key: string;
  opts: ToonOpts;
}
/** Prepare a mesh's geometry for merging: strip extras, add uv/normal, bake transform and color. */
function prepGeo(mesh: Mesh, m4: Matrix4, batch: BatchInfo | undefined) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(m4);
  if (batch) {
    const c = (mesh.material as MeshToonMaterial).color;
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new BufferAttribute(arr, 3));
  }
  return g;
}
function bucketKey(mesh: Mesh, extra: string) {
  const mat = mesh.material as Material;
  const batch = mat.userData.batch as BatchInfo | undefined;
  return { key: (batch ? 'vc:' + batch.key : mat.uuid) + '|' + extra + '|' + (mesh.castShadow ? 1 : 0), batch };
}
function bucketMaterial(b: { mat: Material; batch?: BatchInfo }) {
  return b.batch ? toon(0xffffff, { ...b.batch.opts, vertexColors: true }) : b.mat;
}

/**
 * Merge every static mesh under `root` into one mesh per material per spatial cell.
 * Anything flagged userData.dynamic (or under such a node) is left alone.
 */
export function bakeStatic(root: Object3D, cell = 64) {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const local = new Matrix4();
  const buckets = new Map<string, { mat: Material; batch?: BatchInfo; geos: BufferGeometry[]; cast: boolean }>();
  const remove: Mesh[] = [];
  const visit = (o: Object3D, dyn: boolean) => {
    const isDyn = dyn || !!o.userData.dynamic;
    if ((o as Mesh).isMesh && !isDyn && !(o as Mesh).userData.noBake && !(o as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) {
      const mesh = o as Mesh;
      if (Array.isArray(mesh.material)) return;
      const wp = new Vector3();
      mesh.getWorldPosition(wp);
      const { key, batch } = bucketKey(mesh, `${Math.floor(wp.x / cell)},${Math.floor(wp.z / cell)}`);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: mesh.material as Material, batch, geos: [], cast: mesh.castShadow }));
      b.geos.push(prepGeo(mesh, local.multiplyMatrices(inv, mesh.matrixWorld), batch));
      remove.push(mesh);
    }
    for (const c of o.children) visit(c, isDyn);
  };
  visit(root, false);
  for (const mesh of remove) mesh.parent?.remove(mesh);
  const out = new Group();
  out.name = 'baked';
  for (const b of buckets.values()) {
    const ok = b.geos.filter((g) => g.attributes.uv && g.attributes.normal);
    if (!ok.length) continue;
    const merged = mergeGeometries(ok);
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, bucketMaterial(b));
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  root.add(out);
  return out;
}

/**
 * Merge the static parts *inside* a moving group (in the group's own space), recursing into
 * sub-groups that move on their own. Meshes flagged userData.dynamic keep their own transform.
 */
export function bakeDeep(node: Object3D) {
  node.updateMatrixWorld(true);
  const inv = new Matrix4().copy(node.matrixWorld).invert();
  const local = new Matrix4();
  const buckets = new Map<string, { mat: Material; batch?: BatchInfo; geos: BufferGeometry[]; meshes: Mesh[]; cast: boolean }>();
  const visit = (o: Object3D) => {
    for (const c of [...o.children]) {
      if (c.userData.dynamic) {
        bakeDeep(c);
        continue;
      }
      const mesh = c as Mesh;
      if (mesh.isMesh && !(mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh && !Array.isArray(mesh.material) && !mesh.userData.baked) {
        const { key, batch } = bucketKey(mesh, '');
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = { mat: mesh.material as Material, batch, geos: [], meshes: [], cast: mesh.castShadow }));
        b.geos.push(prepGeo(mesh, local.multiplyMatrices(inv, mesh.matrixWorld), batch));
        b.meshes.push(mesh);
      }
      if (c.children.length) visit(c);
    }
  };
  visit(node);
  for (const b of buckets.values()) {
    if (b.geos.length < 2) continue;
    for (const old of b.meshes) old.parent?.remove(old);
    const mesh = new Mesh(mergeGeometries(b.geos), bucketMaterial(b));
    mesh.geometry.computeBoundingSphere();
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    mesh.userData.baked = true;
    node.add(mesh);
  }
}

export { CylinderGeometry, ConeGeometry, SphereGeometry, BoxGeometry, TorusGeometry };
