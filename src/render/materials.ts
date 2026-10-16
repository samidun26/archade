import {
  Color,
  type ColorRepresentation,
  DataTexture,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type Side,
  type Texture,
} from 'three';
import { GNORMAL_DECL, GNORMAL_WRITE_KEEP, GNORMAL_WRITE_LIT, patchUnlit } from './gbuffer';

// Palette pulled from 1930s cel animation: warm, slightly desaturated, inked.
export const PAL = {
  ink: 0x1d140f,
  paper: 0xf4e7c5,
  cream: 0xfbf0d4,
  red: 0xd2402f,
  redDark: 0x9e2a22,
  gold: 0xf2b83b,
  goldDark: 0xc98a1f,
  teal: 0x3d8f94,
  blue: 0x4f86b5,
  sky: 0x8cc4cf,
  grass: 0x8fbd4f,
  grassDark: 0x5f9a3a,
  leaf: 0x6fa83f,
  dirt: 0xc79a62,
  sand: 0xf0d79a,
  wood: 0xa86b3c,
  woodDark: 0x7a4a29,
  stone: 0xb9ae9a,
  stoneDark: 0x8f8573,
  white: 0xfffaf0,
  pink: 0xf08fa6,
  purple: 0x8a6bb0,
  mushroom: 0xe04a3c,
  brass: 0xd9a441,
  night: 0x24304f,
} as const;

let gradient: DataTexture | null = null;
export function toonGradient() {
  if (gradient) return gradient;
  // dotNL in [-1,1] maps across these texels: deep shadow, shadow, mid, lit, lit
  const data = new Uint8Array([110, 120, 190, 255, 255]);
  gradient = new DataTexture(data, data.length, 1, RedFormat);
  gradient.minFilter = NearestFilter;
  gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export interface ToonOpts {
  gloss?: boolean;
  emissive?: ColorRepresentation;
  emissiveIntensity?: number;
  /** 0..1 strength of the painted "mottle" texture. */
  mottle?: number;
  map?: Texture | null;
  vertexColors?: boolean;
  side?: Side;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  /** Explicit cache key (for unique materials). */
  key?: string;
}

const cache = new Map<string, MeshToonMaterial>();

const VERT_PARS = /* glsl */ `
varying vec3 vToonWorld;
`;
const VERT_MAIN = /* glsl */ `
{
  vec4 twp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    twp = instanceMatrix * twp;
  #endif
  vToonWorld = (modelMatrix * twp).xyz;
}
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vToonWorld;
uniform float uMottle;
float tHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(tHash(i+vec3(0,0,0)), tHash(i+vec3(1,0,0)), f.x),
                 mix(tHash(i+vec3(0,1,0)), tHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(tHash(i+vec3(0,0,1)), tHash(i+vec3(1,0,1)), f.x),
                 mix(tHash(i+vec3(0,1,1)), tHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  float m = tNoise(vToonWorld * 0.45) * 0.6 + tNoise(vToonWorld * 1.7) * 0.4;
  diffuseColor.rgb *= 1.0 + (m - 0.5) * 0.22 * uMottle;
}
`;

const FRAG_END = /* glsl */ `
#ifdef TOON_GLOSS
  #if NUM_DIR_LIGHTS > 0
  {
    vec3 Lg = directionalLights[0].direction;
    vec3 Vg = normalize(vViewPosition);
    vec3 Hg = normalize(Lg + Vg);
    float sg = pow(max(dot(normal, Hg), 0.0), 36.0);
    outgoingLight = mix(outgoingLight, vec3(1.0, 0.99, 0.95) * 1.15, smoothstep(0.5, 0.56, sg) * 0.85);
  }
  #endif
#endif
#include <opaque_fragment>
`;

function patch(mat: MeshToonMaterial, mottle: number, gloss: boolean) {
  const transparent = mat.transparent;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMottle = { value: mottle };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GNORMAL_DECL + FRAG_PARS)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <opaque_fragment>', (transparent ? GNORMAL_WRITE_KEEP : GNORMAL_WRITE_LIT) + FRAG_END);
    if (gloss) shader.defines = { ...(shader.defines ?? {}), TOON_GLOSS: '' };
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => `toon-${gloss ? 'g' : 'm'}-${mottle.toFixed(2)}-${transparent ? 't' : 'o'}`;
}

/** Cached toon material. Same color + options => same material instance. */
export function toon(color: ColorRepresentation, o: ToonOpts = {}): MeshToonMaterial {
  const c = new Color(color);
  const key =
    o.key ??
    [
      c.getHexString(),
      o.gloss ? 1 : 0,
      o.emissive !== undefined ? new Color(o.emissive).getHexString() : '-',
      o.emissiveIntensity ?? 1,
      o.mottle ?? 0.6,
      o.map ? o.map.uuid : '-',
      o.vertexColors ? 1 : 0,
      o.side ?? FrontSide,
      o.transparent ? 1 : 0,
      o.opacity ?? 1,
      o.alphaTest ?? 0,
    ].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new MeshToonMaterial({
    color: c,
    gradientMap: toonGradient(),
    map: o.map ?? null,
    vertexColors: !!o.vertexColors,
    side: o.side ?? FrontSide,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    alphaTest: o.alphaTest ?? 0,
  });
  if (o.emissive !== undefined) {
    mat.emissive = new Color(o.emissive);
    mat.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  patch(mat, o.mottle ?? 0.6, !!o.gloss);
  // plain colored toon materials can be batched together via vertex colors
  if (!o.map && !o.transparent && !o.vertexColors && !o.alphaTest && !o.key) {
    const { gloss, emissive, emissiveIntensity, mottle, side } = o;
    const batchOpts: ToonOpts = { gloss, emissive, emissiveIntensity, mottle, side };
    mat.userData.batch = {
      key: [gloss ? 1 : 0, emissive !== undefined ? new Color(emissive).getHexString() : '-', emissiveIntensity ?? 1, mottle ?? 0.6, side ?? FrontSide].join('|'),
      opts: batchOpts,
    };
  }
  cache.set(key, mat);
  return mat;
}

/** Unique (uncached) toon material, for things whose color animates. */
export function toonUnique(color: ColorRepresentation, o: ToonOpts = {}) {
  return toon(color, { ...o, key: 'u' + Math.random() });
}

const basicCache = new Map<string, MeshBasicMaterial>();
export function flat(color: ColorRepresentation, opts: { side?: Side; transparent?: boolean; opacity?: number } = {}) {
  const c = new Color(color);
  const key = c.getHexString() + (opts.side ?? 0) + (opts.transparent ? 't' : '') + (opts.opacity ?? 1);
  let m = basicCache.get(key);
  if (!m) {
    m = new MeshBasicMaterial({
      color: c,
      side: opts.side ?? FrontSide,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
    });
    patchUnlit(m, opts.transparent ? 'keep' : 'none');
    basicCache.set(key, m);
  }
  return m;
}

export const inkMat = () => flat(PAL.ink);
export const inkDouble = () => flat(PAL.ink, { side: DoubleSide });
