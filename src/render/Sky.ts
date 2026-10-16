import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { cloudCanvas, sunCanvas, tex } from './textures';
import { rng } from '../core/math';
import { GNORMAL_DECL, GNORMAL_WRITE_NONE, patchUnlit } from './gbuffer';

export interface SkyPreset {
  top: number;
  mid: number;
  horizon: number;
  haze: number;
  sun: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunIntensity: number;
  night: number;
  stormy: number;
}

export const SKY_PRESETS: Record<'day' | 'dusk' | 'storm' | 'night', SkyPreset> = {
  day: {
    top: 0x5fa8c4,
    mid: 0x9fd0d2,
    horizon: 0xf6e7c4,
    haze: 0xf1e2bd,
    sun: 0xfff1cf,
    hemiSky: 0xfff0d2,
    hemiGround: 0x7d6a8f,
    hemiIntensity: 1.15,
    sunIntensity: 2.0,
    night: 0,
    stormy: 0,
  },
  dusk: {
    top: 0x5a6fa8,
    mid: 0xd99a86,
    horizon: 0xf7cf94,
    haze: 0xeec79a,
    sun: 0xffc98a,
    hemiSky: 0xffd9b0,
    hemiGround: 0x6a4f7a,
    hemiIntensity: 1.0,
    sunIntensity: 1.7,
    night: 0.1,
    stormy: 0,
  },
  storm: {
    top: 0x2e2a40,
    mid: 0x5b5470,
    horizon: 0x9c8f96,
    haze: 0x7c7186,
    sun: 0xc8c0d8,
    hemiSky: 0xbfb6d6,
    hemiGround: 0x3a3048,
    hemiIntensity: 1.05,
    sunIntensity: 1.1,
    night: 0.3,
    stormy: 1,
  },
  night: {
    top: 0x101a38,
    mid: 0x24305a,
    horizon: 0x5a5a82,
    haze: 0x3c4068,
    sun: 0xc9d4ff,
    hemiSky: 0x9fb0e8,
    hemiGround: 0x2b2440,
    hemiIntensity: 0.85,
    sunIntensity: 0.65,
    night: 1,
    stormy: 0,
  },
};

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pin to the far plane
}
`;

const FRAG = /* glsl */ `
${GNORMAL_DECL}
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uTime;
uniform float uNight;
uniform float uStorm;
varying vec3 vDir;

float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=n2(p)*a; p*=2.03; a*=.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, y));
  col = mix(col, uTop, smoothstep(0.18, 0.75, y));
  col = mix(col, uHorizon * 0.97, smoothstep(0.0, -0.08, y));
  // watercolor blooms
  vec2 sp = d.xz / (abs(y) + 0.35);
  float w = fbm(sp * 1.6 + vec2(uTime * 0.004, 0.0));
  col *= 0.95 + 0.1 * w;
  // soft painted sun halo + rays
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col = mix(col, uSunCol, pow(s, 10.0) * 0.45 * (1.0 - uStorm));
  float ang = atan(d.z - uSunDir.z, d.x - uSunDir.x);
  float rays = smoothstep(0.55, 1.0, sin(ang * 18.0 + uTime * 0.05)) * pow(s, 3.0) * 0.08 * (1.0 - uNight) * (1.0 - uStorm);
  col += rays * uSunCol;
  // stars
  if (uNight > 0.01) {
    vec2 g = floor(vec2(atan(d.z, d.x) * 120.0, d.y * 160.0));
    float st = h(g);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 40.0);
    col += vec3(1.0, 0.95, 0.8) * step(0.9965, st) * smoothstep(0.05, 0.3, y) * uNight * tw;
  }
  // storm churn
  if (uStorm > 0.01) {
    float c = fbm(sp * 2.5 + vec2(uTime * 0.03, uTime * 0.01));
    col = mix(col, col * 0.55, smoothstep(0.45, 0.8, c) * uStorm);
  }
  gl_FragColor = vec4(col, 1.0);
  ${GNORMAL_WRITE_NONE}
  #include <colorspace_fragment>
}
`;

interface CloudSprite {
  s: Sprite;
  angle: number;
  dist: number;
  height: number;
  speed: number;
}

export class Sky extends Group {
  readonly material: ShaderMaterial;
  readonly sunDir = new Vector3(0.45, 0.55, -0.7).normalize();
  private sun: Sprite;
  private moonTex = tex(sunCanvas('moon'));
  private sunTex = tex(sunCanvas('happy'));
  private clouds: CloudSprite[] = [];
  private dome: Mesh;
  preset: SkyPreset = SKY_PRESETS.day;

  constructor() {
    super();
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new Color() },
        uMid: { value: new Color() },
        uHorizon: { value: new Color() },
        uSunDir: { value: this.sunDir },
        uSunCol: { value: new Color() },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uStorm: { value: 0 },
      },
    });
    this.dome = new Mesh(new SphereGeometry(500, 32, 16), this.material);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.add(this.dome);

    this.sun = new Sprite(
      patchUnlit(new SpriteMaterial({ map: this.sunTex, depthWrite: false, transparent: true, fog: false }), 'keep'),
    );
    this.sun.scale.setScalar(78);
    this.sun.renderOrder = -9;
    this.add(this.sun);

    const r = rng(7);
    for (let i = 0; i < 18; i++) {
      const face = i % 5 === 0;
      const m = patchUnlit(
        new SpriteMaterial({
          map: tex(cloudCanvas(1000 + i * 37, face)),
          depthWrite: false,
          transparent: true,
          fog: false,
        }),
        'keep',
      );
      const s = new Sprite(m);
      const size = 70 + r() * 90;
      s.scale.set(size, size * 0.5, 1);
      s.renderOrder = -8;
      this.add(s);
      this.clouds.push({
        s,
        angle: r() * Math.PI * 2,
        dist: 330 + r() * 120,
        height: 40 + r() * 110,
        speed: (0.004 + r() * 0.006) * (r() > 0.5 ? 1 : -1),
      });
    }
    this.apply(SKY_PRESETS.day);
  }

  apply(p: SkyPreset) {
    this.preset = p;
    const u = this.material.uniforms;
    (u.uTop.value as Color).set(p.top);
    (u.uMid.value as Color).set(p.mid);
    (u.uHorizon.value as Color).set(p.horizon);
    (u.uSunCol.value as Color).set(p.sun);
    u.uNight.value = p.night;
    u.uStorm.value = p.stormy;
    const mat = this.sun.material as SpriteMaterial;
    mat.map = p.night > 0.5 ? this.moonTex : this.sunTex;
    mat.opacity = p.stormy > 0.5 ? 0 : 1;
    mat.needsUpdate = true;
    for (const c of this.clouds) {
      const cm = c.s.material as SpriteMaterial;
      cm.color.set(p.night > 0.5 ? 0x8c93c0 : p.stormy > 0.5 ? 0x6b6378 : 0xffffff);
    }
  }

  /** Lerp sky colors between two presets (for the finale's sunset into night). */
  blend(a: SkyPreset, b: SkyPreset, t: number) {
    const u = this.material.uniforms;
    const mix = (key: 'top' | 'mid' | 'horizon' | 'sun', uni: string) =>
      (u[uni].value as Color).set(a[key]).lerp(new Color(b[key]), t);
    mix('top', 'uTop');
    mix('mid', 'uMid');
    mix('horizon', 'uHorizon');
    mix('sun', 'uSunCol');
    u.uNight.value = a.night + (b.night - a.night) * t;
  }

  update(t: number, camPos: Vector3) {
    this.position.copy(camPos);
    this.material.uniforms.uTime.value = t;
    this.sun.position.copy(this.sunDir).multiplyScalar(420);
    this.sun.material.rotation = Math.sin(t * 0.6) * 0.06;
    for (const c of this.clouds) {
      c.angle += c.speed * 0.016;
      c.s.position.set(Math.cos(c.angle) * c.dist, c.height + Math.sin(t * 0.2 + c.angle * 5) * 2, Math.sin(c.angle) * c.dist);
    }
  }
}

export function makeGlowSprite(color: number, size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const s = new Sprite(
    patchUnlit(
      new SpriteMaterial({ map: tex(c), color, blending: AdditiveBlending, depthWrite: false, transparent: true }),
      'keep',
    ),
  );
  s.scale.setScalar(size);
  return s;
}
