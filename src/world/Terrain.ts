import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  RedFormat,
  ClampToEdgeWrapping,
} from 'three';
import { clamp, fbm, lerp, smoothstep } from '../core/math';
import { FLATS, LAND, PATHS, WORLD, type V2 } from './layout';
import { toonGradient } from '../render/materials';
import { MeshToonMaterial } from 'three';
import { patchTerrain } from './terrainShader';

const SEG = 240;
const N = SEG + 1;
const HALF = WORLD.half;
const STEP = (HALF * 2) / SEG;

function smax(a: number, b: number, k: number) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(a, b, h) + k * h * (1 - h);
}

function distToSeg(px: number, pz: number, a: V2, b: V2) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const t = clamp(((px - a.x) * abx + (pz - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
  const dx = px - (a.x + abx * t);
  const dz = pz - (a.z + abz * t);
  return Math.hypot(dx, dz);
}

export function pathDistance(x: number, z: number) {
  let d = Infinity;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, distToSeg(x, z, p[i], p[i + 1]));
  return d;
}

export function landValue(x: number, z: number) {
  let L = -1;
  for (const b of LAND) {
    const v = 1 - Math.hypot(x - b.x, z - b.z) / b.r;
    L = smax(L, v, 0.18);
  }
  L += (fbm(x * 0.028 + 11, z * 0.028 - 4, 3) - 0.5) * 0.2;
  return L;
}

/** Analytic height. The mesh samples this on a grid; gameplay uses the grid interpolation. */
export function rawHeight(x: number, z: number) {
  const L = landValue(x, z);
  let h = -7 + 11.6 * smoothstep(-0.1, 0.24, L);
  const inland = smoothstep(0.14, 0.5, L);
  h += (fbm(x * 0.017 + 3, z * 0.017 - 7, 4) - 0.42) * 10 * inland;
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    const w = (f.w ?? 1) * (1 - smoothstep(f.r, f.r + f.fall, d));
    if (w > 0) h = lerp(h, f.h, w);
  }
  const pd = pathDistance(x, z);
  if (pd < 4) h -= 0.14 * (1 - pd / 4);
  return h;
}

export class Terrain {
  readonly heights = new Float32Array(N * N);
  readonly mesh: Mesh;
  readonly heightTex: DataTexture;

  constructor() {
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) this.heights[j * N + i] = rawHeight(-HALF + i * STEP, -HALF + j * STEP);
    this.mesh = this.buildMesh();
    this.heightTex = this.buildHeightTex();
  }

  /** Height exactly matching the rendered triangles. */
  heightAt(x: number, z: number) {
    const fx = (x + HALF) / STEP;
    const fz = (z + HALF) / STEP;
    if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return -7;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const h00 = this.heights[j * N + i];
    const h10 = this.heights[j * N + i + 1];
    const h01 = this.heights[(j + 1) * N + i];
    const h11 = this.heights[(j + 1) * N + i + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  /** Steepness as rise/run of the steepest direction. */
  slopeAt(x: number, z: number) {
    const e = 0.6;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  gradientAt(x: number, z: number) {
    const e = 0.6;
    return {
      x: (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e),
      z: (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e),
    };
  }

  private buildMesh() {
    const pos = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = -HALF + i * STEP;
        const z = -HALF + j * STEP;
        const h = this.heights[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
      }
    const idx = new Uint32Array(SEG * SEG * 6);
    let p = 0;
    for (let j = 0; j < SEG; j++)
      for (let i = 0; i < SEG; i++) {
        const v00 = j * N + i;
        const v10 = v00 + 1;
        const v01 = v00 + N;
        const v11 = v01 + 1;
        idx[p++] = v00;
        idx[p++] = v01;
        idx[p++] = v10;
        idx[p++] = v10;
        idx[p++] = v01;
        idx[p++] = v11;
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setIndex(new BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
    patchTerrain(mat);
    const m = new Mesh(g, mat);
    m.receiveShadow = true;
    m.name = 'terrain';
    return m;
  }

  private buildHeightTex() {
    const data = new Uint16Array(N * N);
    for (let k = 0; k < N * N; k++) data[k] = DataUtils.toHalfFloat(this.heights[k]);
    const t = new DataTexture(data, N, N, RedFormat, HalfFloatType);
    t.minFilter = LinearFilter;
    t.magFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  }
}

export const TERRAIN_HALF = HALF;
