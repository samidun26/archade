import {
  Camera,
  Color,
  DepthTexture,
  FloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  WebGLRenderTarget,
  WebGLRenderer,
  LinearFilter,
  NoColorSpace,
} from 'three';
import { InkFilmShader } from './InkFilmShader';
import { PAL } from './materials';

export type Quality = 'low' | 'medium' | 'high';

export interface FilmSettings {
  grain: number;
  flicker: number;
  scratch: number;
  vignette: number;
  sepia: number;
  sat: number;
  boil: number;
}

export const FILM_DEFAULT: FilmSettings = {
  grain: 0.07,
  flicker: 0.045,
  scratch: 1,
  vignette: 0.75,
  sepia: 0.16,
  sat: 0.95,
  boil: 1,
};

export const FILM_REDUCED: FilmSettings = {
  grain: 0.03,
  flicker: 0,
  scratch: 0,
  vignette: 0.6,
  sepia: 0.12,
  sat: 0.95,
  boil: 0,
};

export class Renderer {
  readonly gl: WebGLRenderer;
  private rt: WebGLRenderTarget;
  private postScene = new Scene();
  private postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private post: ShaderMaterial;
  quality: Quality = 'high';
  film: FilmSettings = { ...FILM_DEFAULT };
  /** 0..1 screen flash, decays automatically. */
  flash = 0;
  flashColor = new Color(0xffffff);
  haze = new Color(0xf3e3c0);
  hazeStart = 45;
  hazeDist = 190;
  hazeMax = 0.62;
  private w = 1;
  private h = 1;
  dpr = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.shadowMap.type = PCFShadowMap;
    this.gl.shadowMap.enabled = true;
    this.gl.setClearColor(0x000000, 1);

    this.rt = this.makeTarget(2, 2);
    this.post = new ShaderMaterial({
      vertexShader: InkFilmShader.vertexShader,
      fragmentShader: InkFilmShader.fragmentShader,
      uniforms: {
        tColor: { value: this.rt.textures[0] },
        tNormal: { value: this.rt.textures[1] },
        tDepth: { value: this.rt.depthTexture },
        uRes: { value: [1, 1] },
        uTime: { value: 0 },
        uNear: { value: 0.3 },
        uFar: { value: 900 },
        uLine: { value: 1.5 },
        uBoil: { value: 1 },
        uInk: { value: new Color(PAL.ink) },
        uHaze: { value: this.haze },
        uHazeStart: { value: 30 },
        uHazeDist: { value: 160 },
        uHazeMax: { value: 0.7 },
        uGrain: { value: 0.07 },
        uFlicker: { value: 0.04 },
        uScratch: { value: 1 },
        uVignette: { value: 0.7 },
        uSepia: { value: 0.15 },
        uSat: { value: 0.95 },
        uFlash: { value: 0 },
        uFlashColor: { value: this.flashColor },
        uEdgeOn: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private makeTarget(w: number, h: number) {
    const depth = new DepthTexture(w, h, FloatType);
    depth.minFilter = NearestFilter;
    depth.magFilter = NearestFilter;
    const rt = new WebGLRenderTarget(w, h, {
      count: 2,
      type: UnsignedByteType,
      colorSpace: SRGBColorSpace,
      depthBuffer: true,
      depthTexture: depth,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
    });
    // second attachment holds view-space normals for the ink pass
    const n = rt.textures[1];
    n.colorSpace = NoColorSpace;
    n.minFilter = NearestFilter;
    n.magFilter = NearestFilter;
    return rt;
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.gl.shadowMap.enabled = q !== 'low';
    this.resize();
  }

  get shadowsEnabled() {
    return this.quality !== 'low';
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const device = window.devicePixelRatio || 1;
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    let dpr = Math.min(device, cap);
    // keep the internal buffer within a sane pixel budget on huge displays
    const budget = this.quality === 'high' ? 3.7e6 : this.quality === 'medium' ? 2.2e6 : 1.1e6;
    while (w * h * dpr * dpr > budget && dpr > 0.6) dpr -= 0.1;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    const bw = Math.floor(w * dpr);
    const bh = Math.floor(h * dpr);
    this.rt.setSize(bw, bh);
    (this.post.uniforms.uRes.value as number[])[0] = bw;
    (this.post.uniforms.uRes.value as number[])[1] = bh;
    this.post.uniforms.uLine.value = Math.max(1.2, Math.min(3.2, bh / 430));
    this.listeners.forEach((fn) => fn(w, h));
  }

  private listeners: Array<(w: number, h: number) => void> = [];
  onResize(fn: (w: number, h: number) => void) {
    this.listeners.push(fn);
    fn(this.w, this.h);
  }

  get aspect() {
    return this.w / this.h;
  }

  render(scene: Scene, camera: Camera, time: number, dt: number) {
    const u = this.post.uniforms;
    if (camera instanceof PerspectiveCamera) {
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
    }
    u.uTime.value = time;
    u.uHazeStart.value = this.hazeStart;
    u.uHazeDist.value = this.hazeDist;
    u.uHazeMax.value = this.hazeMax;
    u.uGrain.value = this.film.grain;
    u.uFlicker.value = this.film.flicker;
    u.uScratch.value = this.film.scratch;
    u.uVignette.value = this.film.vignette;
    u.uSepia.value = this.film.sepia;
    u.uSat.value = this.film.sat;
    u.uBoil.value = this.film.boil;
    u.uFlash.value = Math.min(1, this.flash);
    this.flash = Math.max(0, this.flash - dt * 4);

    this.gl.setRenderTarget(this.rt);
    this.gl.clear();
    this.gl.render(scene, camera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCam);
  }
}
