// Procedural "painted backdrop" shading for the island ground, evaluated per pixel so
// path edges, flagstone grout and grass strokes stay crisp at any distance.

import { Color, type MeshToonMaterial } from 'three';
import { PATHS } from './layout';
import { GNORMAL_DECL, GNORMAL_WRITE_LIT } from '../render/gbuffer';

const c = (hex: number) => {
  const k = new Color(hex);
  return `vec3(${k.r.toFixed(4)}, ${k.g.toFixed(4)}, ${k.b.toFixed(4)})`;
};

function pathSegments() {
  const segs: string[] = [];
  for (const p of PATHS)
    for (let i = 0; i < p.length - 1; i++)
      segs.push(`vec4(${p[i].x.toFixed(1)}, ${p[i].z.toFixed(1)}, ${p[i + 1].x.toFixed(1)}, ${p[i + 1].z.toFixed(1)})`);
  return segs;
}

export function terrainGLSL() {
  const segs = pathSegments();
  return /* glsl */ `
varying vec3 vToonWorld;
uniform float uTime;
const int NSEG = ${segs.length};
const vec4 SEGS[NSEG] = vec4[NSEG](${segs.join(',\n  ')});

float th(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(th(i),th(i+vec2(1,0)),f.x), mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x), f.y); }
float tfbm(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=tn(p)*a; p*=2.07; a*=.5; } return s/0.875; }

float segDist(vec2 p, vec4 s){
  vec2 a = s.xy, b = s.zw, ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - (a + ab * t));
}
float pathDist(vec2 p){ float d = 1e9; for (int i = 0; i < NSEG; i++) d = min(d, segDist(p, SEGS[i])); return d; }

// antialiased band helper
float aastep(float edge, float x){ float w = fwidth(x) * 0.75 + 1e-4; return smoothstep(edge - w, edge + w, x); }

vec3 paintGround(vec3 wp, vec3 wn) {
  vec2 p = wp.xz;
  float h = wp.y;
  float slope = sqrt(max(0.0, 1.0 - wn.y * wn.y)) / max(wn.y, 0.05);
  float n = tfbm(p * 0.06);
  float n2 = tfbm(p * 0.21 + 40.0);
  float dist = length(cameraPosition - wp);
  float near = 1.0 - smoothstep(25.0, 60.0, dist);

  // --- grass, with painted patches
  vec3 col = mix(${c(0x93c152)}, ${c(0x67a03c)}, smoothstep(0.38, 0.66, n));
  col = mix(col, ${c(0xa9cf62)}, smoothstep(0.62, 0.8, n2) * 0.5);

  // little grass-tuft strokes (only up close)
  if (near > 0.0) {
    vec2 gp = p * 0.9;
    vec2 cell = floor(gp);
    vec2 f = fract(gp) - 0.5 - (vec2(th(cell), th(cell + 7.1)) - 0.5) * 0.6;
    float pick = step(0.55, th(cell + 3.3));
    float stroke = (1.0 - aastep(0.035, abs(f.x - f.y * 0.35))) * (1.0 - aastep(0.16, length(f + vec2(0.0, 0.05))));
    stroke += (1.0 - aastep(0.035, abs(f.x + 0.12 + f.y * 0.5))) * (1.0 - aastep(0.12, length(f + vec2(0.12, 0.04))));
    col = mix(col, ${c(0x3f7a2a)}, clamp(stroke, 0.0, 1.0) * pick * near * 0.75);
  }

  // --- forest floor
  float fd = length(p - vec2(-86.0, -12.0));
  float forest = 1.0 - smoothstep(36.0, 60.0, fd + (n - 0.5) * 12.0);
  col = mix(col, mix(${c(0x4f7f35)}, ${c(0x6b8a3a)}, n2), forest * 0.85);
  // leaf litter dots
  vec2 lc = floor(p * 1.3);
  vec2 lf = fract(p * 1.3) - 0.5;
  float leaf = (1.0 - aastep(0.12, length(lf - (vec2(th(lc), th(lc + 2.0)) - 0.5) * 0.5))) * step(0.82, th(lc + 9.0));
  col = mix(col, mix(${c(0xc9803a)}, ${c(0xa85a2f)}, th(lc)), leaf * forest * near);

  // --- lookout bluff: pale sunny grass
  float bd = length(p - vec2(-12.0, -102.0));
  col = mix(col, ${c(0xb2cc66)}, (1.0 - smoothstep(14.0, 32.0, bd)) * 0.55);

  // --- carnival midway sawdust, inked rim
  float cd = length(p - vec2(86.0, 4.0)) + (n2 - 0.5) * 3.0;
  float carn = 1.0 - aastep(35.0, cd);
  vec3 saw = mix(${c(0xe0bd82)}, ${c(0xcfa66a)}, n2);
  vec2 sc = floor(p * 3.0);
  saw = mix(saw, ${c(0xa77b45)}, step(0.93, th(sc)) * near * 0.6);
  col = mix(col, saw, carn);
  col = mix(col, ${c(0x8a6038)}, (1.0 - aastep(0.22, abs(cd - 35.0))) * 0.7);

  // --- big top plateau
  float bt = length(p - vec2(84.0, -72.0)) + (n2 - 0.5) * 2.0;
  col = mix(col, saw, 1.0 - aastep(19.0, bt));
  col = mix(col, ${c(0x8a6038)}, (1.0 - aastep(0.2, abs(bt - 19.0))) * 0.7);

  // --- town square flagstones with ink grout
  float td = length(p);
  if (td < 21.5) {
    float a = 0.7853981;
    vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * p / 1.7;
    vec2 qi = floor(q + vec2(step(1.0, mod(floor(q.y), 2.0)) * 0.5, 0.0));
    vec2 qf = fract(q + vec2(step(1.0, mod(floor(q.y), 2.0)) * 0.5, 0.0));
    float grout = 1.0 - aastep(0.05, min(min(qf.x, 1.0 - qf.x), min(qf.y, 1.0 - qf.y)));
    vec3 stone = mix(${c(0xe6d6b2)}, ${c(0xcbb48a)}, th(qi) * 0.8);
    // a ring of darker stones and a compass inlay
    float ring = 1.0 - aastep(1.1, abs(td - 13.0));
    stone = mix(stone, ${c(0xb69a70)}, ring * 0.8);
    stone = mix(stone, ${c(0x7a5536)}, grout * 0.75);
    float town = 1.0 - aastep(20.0, td);
    col = mix(col, stone, town);
    col = mix(col, ${c(0x5a3d26)}, (1.0 - aastep(0.25, abs(td - 20.0))) * 0.8);
  }

  // --- dirt paths with wobbly inked borders
  float pd = pathDist(p) + (tn(p * 0.35) - 0.5) * 1.1;
  vec3 dirt = mix(${c(0xc99c63)}, ${c(0xb5854f)}, n2);
  vec2 pc = floor(p * 2.2);
  dirt = mix(dirt, ${c(0x8c6440)}, step(0.9, th(pc)) * near * 0.7);
  col = mix(col, dirt, 1.0 - aastep(2.6, pd));
  col = mix(col, ${c(0x7d5634)}, (1.0 - aastep(0.16, abs(pd - 2.6))) * 0.65);

  // --- beach sand + wet edge
  float sandLine = 1.75 + n * 1.1;
  vec3 sand = mix(${c(0xf2da9e)}, ${c(0xe8c784)}, n2 * 0.7);
  vec2 sp = floor(p * 2.5);
  sand = mix(sand, ${c(0xc9a466)}, step(0.94, th(sp)) * near * 0.5);
  col = mix(col, sand, 1.0 - aastep(sandLine, h));
  col = mix(col, ${c(0x9c7a46)}, (1.0 - aastep(0.06, abs(h - sandLine))) * 0.45);
  col = mix(col, ${c(0xcfae72)}, 1.0 - aastep(0.35, h));

  // --- rock on steep slopes, with strata lines
  float rock = aastep(0.95, slope + (n2 - 0.5) * 0.25);
  vec3 stone2 = mix(${c(0xbcae96)}, ${c(0x908572)}, n2);
  float strata = 1.0 - aastep(0.06, abs(fract(h * 0.55 + n * 0.8) - 0.5));
  stone2 = mix(stone2, ${c(0x6e6252)}, strata * 0.5);
  col = mix(col, stone2, rock);
  return col;
}
`;
}

export function patchTerrain(mat: MeshToonMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vToonWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvToonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GNORMAL_DECL + terrainGLSL())
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          diffuseColor.rgb = paintGround(vToonWorld, wn);
        }`,
      )
      .replace('#include <opaque_fragment>', GNORMAL_WRITE_LIT + '#include <opaque_fragment>');
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => 'terrain-v1';
}
