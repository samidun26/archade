import { Color, Mesh, PlaneGeometry, ShaderMaterial, type Texture } from 'three';
import { GNORMAL_DECL } from '../render/gbuffer';

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
${GNORMAL_DECL}
uniform sampler2D uHeight;
uniform float uHalf;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uLine;
uniform vec3 uGlint;
varying vec3 vWorld;

float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }

void main() {
  vec2 huv = (vWorld.xz + uHalf) / (2.0 * uHalf);
  float th = -7.0;
  if (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) th = texture2D(uHeight, huv).r;
  float depth = clamp(-th, 0.0, 9.0);
  float far = length(vWorld.xz);

  vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 6.5, depth));

  // cartoon wavelets: little arcs that drift, like hand-drawn "~" marks
  vec2 q = vWorld.xz * 0.11 + vec2(uTime * 0.07, uTime * 0.04);
  float wn = n2(q) * 0.7 + n2(q * 2.3 - uTime * 0.05) * 0.3;
  float band = abs(fract(wn * 5.0 + uTime * 0.12) - 0.5);
  float wave = smoothstep(0.035, 0.0, band) * smoothstep(1.2, 3.5, depth) * (1.0 - smoothstep(160.0, 260.0, far));
  col = mix(col, uLine, wave * 0.55);

  // shore foam: a breathing band plus a ring that rolls in
  float breathe = sin(uTime * 1.4 + vWorld.x * 0.07 + vWorld.z * 0.09) * 0.18;
  float foam = smoothstep(0.75, 0.25, depth + breathe);
  float roll = fract(uTime * 0.22 + n2(vWorld.xz * 0.05) * 0.5);
  float ring = smoothstep(0.09, 0.0, abs(depth - (0.6 + roll * 2.2))) * (1.0 - roll);
  col = mix(col, uFoam, clamp(foam + ring * 0.85, 0.0, 1.0));

  // sun glints: sparse twinkling crosses
  vec2 gc = floor(vWorld.xz * 0.5);
  float gr = h(gc + floor(uTime * 2.0));
  vec2 gf = fract(vWorld.xz * 0.5) - 0.5;
  float cross = max(smoothstep(0.05, 0.0, abs(gf.x)) * smoothstep(0.3, 0.0, abs(gf.y)),
                    smoothstep(0.05, 0.0, abs(gf.y)) * smoothstep(0.3, 0.0, abs(gf.x)));
  col = mix(col, uGlint, cross * step(0.985, gr) * smoothstep(2.0, 4.0, depth));

  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz) * 0.5 + 0.5, 1.0);
  #include <colorspace_fragment>
}
`;

export class Water extends Mesh {
  declare material: ShaderMaterial;
  constructor(heightTex: Texture, half: number) {
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uHeight: { value: heightTex },
        uHalf: { value: half },
        uTime: { value: 0 },
        uDeep: { value: new Color(0x2f7f9a) },
        uShallow: { value: new Color(0x7cc8c0) },
        uFoam: { value: new Color(0xfbf3dc) },
        uLine: { value: new Color(0x1f5f78) },
        uGlint: { value: new Color(0xffffff) },
      },
    });
    const geo = new PlaneGeometry(1600, 1600, 1, 1);
    geo.rotateX(-Math.PI / 2);
    super(geo, mat);
    this.name = 'water';
  }

  setNight(n: number) {
    const u = this.material.uniforms;
    (u.uDeep.value as Color).set(0x2f7f9a).lerp(new Color(0x1a2f55), n);
    (u.uShallow.value as Color).set(0x7cc8c0).lerp(new Color(0x3d5f86), n);
    (u.uFoam.value as Color).set(0xfbf3dc).lerp(new Color(0xb9c4e8), n);
    (u.uLine.value as Color).set(0x1f5f78).lerp(new Color(0x101c38), n);
  }

  update(t: number) {
    this.material.uniforms.uTime.value = t;
  }
}
