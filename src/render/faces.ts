import { canvas, INK, pieEye, tex } from './textures';

export type Eyes = 'pie' | 'sleepy' | 'angry' | 'wide' | 'happy' | 'x';
export type MouthK = 'smile' | 'grin' | 'o' | 'frown' | 'flat' | 'teeth' | 'none';

export interface FaceSpec {
  eyes: Eyes;
  mouth: MouthK;
  brows?: 'angry' | 'up' | 'worried';
  cheeks?: boolean;
  mustache?: boolean;
  nose?: boolean;
  look?: number;
  eyeGap?: number;
}

/** Draw a cartoon face centered at (cx,cy). `s` = overall scale (1 ~ 200px wide face). */
export function drawFace(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, f: FaceSpec, blink = 0) {
  const gap = (f.eyeGap ?? 1) * 52 * s;
  const ew = 50 * s;
  const eh = 72 * s;
  const ey = cy - 30 * s;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const look = f.look ?? 0;
  for (const sx of [-1, 1]) {
    const x = cx + sx * gap;
    switch (f.eyes) {
      case 'pie':
        pieEye(g, x, ey, ew, eh, look, 0.1, blink);
        break;
      case 'wide':
        pieEye(g, x, ey, ew * 1.2, eh * 1.15, look, 0, blink);
        break;
      case 'sleepy':
        pieEye(g, x, ey + 8 * s, ew, eh * 0.8, look, 0.4, Math.max(0.55, blink));
        break;
      case 'angry':
        pieEye(g, x, ey, ew, eh * 0.9, look, 0.2, Math.max(0.25, blink));
        break;
      case 'happy':
        g.strokeStyle = INK;
        g.lineWidth = 10 * s;
        g.beginPath();
        g.arc(x, ey + 10 * s, 24 * s, 1.15 * Math.PI, 1.85 * Math.PI);
        g.stroke();
        break;
      case 'x':
        g.strokeStyle = INK;
        g.lineWidth = 11 * s;
        g.beginPath();
        g.moveTo(x - 20 * s, ey - 20 * s);
        g.lineTo(x + 20 * s, ey + 20 * s);
        g.moveTo(x + 20 * s, ey - 20 * s);
        g.lineTo(x - 20 * s, ey + 20 * s);
        g.stroke();
        break;
    }
    if (f.brows) {
      g.strokeStyle = INK;
      g.lineWidth = 11 * s;
      g.beginPath();
      const by = ey - eh * 0.75;
      if (f.brows === 'angry') {
        g.moveTo(x - sx * 30 * s, by - 10 * s);
        g.lineTo(x + sx * 26 * s, by + 14 * s);
      } else if (f.brows === 'worried') {
        g.moveTo(x - sx * 28 * s, by + 10 * s);
        g.lineTo(x + sx * 24 * s, by - 8 * s);
      } else {
        g.arc(x, by + 14 * s, 30 * s, 1.2 * Math.PI, 1.8 * Math.PI);
      }
      g.stroke();
    }
  }
  if (f.cheeks) {
    g.fillStyle = 'rgba(240,120,100,0.5)';
    g.beginPath();
    g.ellipse(cx - gap * 1.75, cy + 22 * s, 22 * s, 13 * s, 0, 0, Math.PI * 2);
    g.ellipse(cx + gap * 1.75, cy + 22 * s, 22 * s, 13 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  if (f.nose) {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(cx, cy + 6 * s, 16 * s, 12 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  // mouth
  const my = cy + 40 * s;
  g.strokeStyle = INK;
  g.fillStyle = '#7a2016';
  g.lineWidth = 9 * s;
  g.beginPath();
  switch (f.mouth) {
    case 'smile':
      g.moveTo(cx - 56 * s, my - 8 * s);
      g.quadraticCurveTo(cx, my + 44 * s, cx + 56 * s, my - 8 * s);
      g.stroke();
      break;
    case 'grin':
      g.moveTo(cx - 64 * s, my - 10 * s);
      g.quadraticCurveTo(cx, my + 72 * s, cx + 64 * s, my - 10 * s);
      g.quadraticCurveTo(cx, my + 8 * s, cx - 64 * s, my - 10 * s);
      g.fill();
      g.stroke();
      g.fillStyle = '#e8706a';
      g.beginPath();
      g.ellipse(cx, my + 30 * s, 22 * s, 10 * s, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'teeth':
      g.fillStyle = '#fffaf0';
      g.moveTo(cx - 60 * s, my - 6 * s);
      g.quadraticCurveTo(cx, my + 50 * s, cx + 60 * s, my - 6 * s);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      for (let i = -2; i <= 2; i++) {
        g.moveTo(cx + i * 20 * s, my - 4 * s);
        g.lineTo(cx + i * 20 * s, my + 18 * s);
      }
      g.lineWidth = 5 * s;
      g.stroke();
      break;
    case 'o':
      g.ellipse(cx, my + 10 * s, 18 * s, 24 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    case 'frown':
      g.moveTo(cx - 46 * s, my + 18 * s);
      g.quadraticCurveTo(cx, my - 16 * s, cx + 46 * s, my + 18 * s);
      g.stroke();
      break;
    case 'flat':
      g.moveTo(cx - 34 * s, my + 6 * s);
      g.lineTo(cx + 34 * s, my + 6 * s);
      g.stroke();
      break;
    case 'none':
      break;
  }
  if (f.mustache) {
    g.fillStyle = INK;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx, my - 12 * s);
      g.bezierCurveTo(cx + sx * 30 * s, my - 34 * s, cx + sx * 70 * s, my - 10 * s, cx + sx * 86 * s, my - 30 * s);
      g.bezierCurveTo(cx + sx * 80 * s, my + 4 * s, cx + sx * 40 * s, my + 6 * s, cx, my - 2 * s);
      g.fill();
    }
  }
  g.restore();
}

/** A face on a solid background, wrapped for a sphere (face centered at u=0.25 => +z). */
export function sphereFaceTexture(bg: string, f: FaceSpec, scale = 1) {
  const { c, g } = canvas(1024, 512);
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 512);
  drawFace(g, 256, 250, 0.9 * scale, f);
  return { canvas: c, ctx: g, texture: tex(c) };
}

/** A flat decal face (transparent background). */
export function decalFace(f: FaceSpec, w = 512, h = 512, scale = 1.6) {
  const { c, g } = canvas(w, h);
  drawFace(g, w / 2, h / 2, scale, f);
  return tex(c);
}

/** House front: window eyes with shutters, door mouth, flower box. Transparent background. */
export function houseFacade(seed: number, mood: 'happy' | 'sleepy' | 'surprised' = 'happy', shutter = '#3d8f94') {
  const { c, g } = canvas(512, 512);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const winY = 170;
  for (const sx of [-1, 1]) {
    const x = 256 + sx * 120;
    // window frame
    g.fillStyle = '#fbf0d4';
    g.strokeStyle = INK;
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(x - 56, winY - 70, 112, 140, 40);
    g.fill();
    g.stroke();
    // pupil-ish curtains
    g.fillStyle = INK;
    const look = ((seed % 3) - 1) * 10;
    g.beginPath();
    if (mood === 'sleepy') g.ellipse(x + look, winY + 30, 30, 22, 0, 0, Math.PI * 2);
    else g.ellipse(x + look, winY + 10, 32, mood === 'surprised' ? 52 : 44, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fbf0d4';
    g.beginPath();
    g.ellipse(x + look - 10, winY - 10, 9, 13, -0.4, 0, Math.PI * 2);
    g.fill();
    // shutters / eyelids
    g.fillStyle = shutter;
    g.beginPath();
    const lid = mood === 'sleepy' ? 70 : mood === 'surprised' ? 8 : 26;
    g.roundRect(x - 62, winY - 78, 124, lid + 14, 30);
    g.fill();
    g.stroke();
    // flower box
    g.fillStyle = '#a86b3c';
    g.fillRect(x - 64, winY + 70, 128, 26);
    g.strokeRect(x - 64, winY + 70, 128, 26);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = ['#d2402f', '#f2b83b', '#f08fa6', '#fffaf0'][(i + seed) % 4];
      g.beginPath();
      g.arc(x - 44 + i * 30, winY + 64, 13, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 5;
      g.stroke();
    }
    g.lineWidth = 10;
  }
  // door mouth (arched, smiling sill)
  g.fillStyle = '#7a4a29';
  g.strokeStyle = INK;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(196, 512);
  g.lineTo(196, 360);
  g.quadraticCurveTo(256, 290, 316, 360);
  g.lineTo(316, 512);
  g.fill();
  g.stroke();
  g.fillStyle = '#f2b83b';
  g.beginPath();
  g.arc(296, 440, 9, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // smile over the door
  g.beginPath();
  g.moveTo(150, 300);
  g.quadraticCurveTo(256, 360, 362, 300);
  g.stroke();
  return tex(c);
}

/** A redrawable face (for NPCs): blinks and flaps its mouth while talking. */
export class FaceRig {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: ReturnType<typeof tex>;
  private key = '';
  constructor(
    readonly mode: 'sphere' | 'decal',
    public spec: FaceSpec,
    readonly bg: string | ((g: CanvasRenderingContext2D, w: number, h: number) => void) | null = null,
    readonly scale = 1,
    readonly cy = 250,
  ) {
    const { c, g } = mode === 'sphere' ? canvas(1024, 512) : canvas(512, 512);
    this.canvas = c;
    this.ctx = g;
    this.texture = tex(c);
    this.draw(0, false);
  }
  draw(blink: number, talking: boolean, mouthOverride?: MouthK) {
    const mouth: MouthK = mouthOverride ?? (talking ? 'grin' : this.spec.mouth);
    const key = `${blink > 0.8 ? 1 : 0}|${mouth}|${this.spec.eyes}|${this.spec.brows}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    if (typeof this.bg === 'function') this.bg(g, W, H);
    else if (this.bg) {
      g.fillStyle = this.bg;
      g.fillRect(0, 0, W, H);
    }
    const cx = this.mode === 'sphere' ? 256 : W / 2;
    const cy = this.mode === 'sphere' ? this.cy : H / 2;
    drawFace(g, cx, cy, (this.mode === 'sphere' ? 0.9 : 1.6) * this.scale, { ...this.spec, mouth }, blink);
    this.texture.needsUpdate = true;
  }
}
