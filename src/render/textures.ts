import { CanvasTexture, LinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

export const INK = '#1d140f';

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return { c, g };
}

export function tex(c: HTMLCanvasElement, repeat = false) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearFilter;
  t.generateMipmaps = true;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Classic "pie-cut" cartoon eye. */
export function pieEye(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lookX = 0,
  lookY = 0,
  closed = 0,
) {
  g.save();
  g.translate(x, y);
  if (closed > 0.85) {
    g.strokeStyle = INK;
    g.lineWidth = Math.max(3, w * 0.22);
    g.lineCap = 'round';
    g.beginPath();
    g.arc(0, -h * 0.1, w * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.restore();
    return;
  }
  const sy = 1 - closed;
  g.scale(1, sy);
  // white of the eye
  g.fillStyle = '#fffaf0';
  g.strokeStyle = INK;
  g.lineWidth = Math.max(2, w * 0.12);
  g.beginPath();
  g.ellipse(0, 0, w * 0.62, h * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // pupil with pie wedge
  const px = lookX * w * 0.18;
  const py = lookY * h * 0.14;
  g.fillStyle = INK;
  g.beginPath();
  g.ellipse(px, py + h * 0.05, w * 0.42, h * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fffaf0';
  g.beginPath();
  g.moveTo(px + w * 0.06, py - h * 0.05);
  g.arc(px + w * 0.06, py - h * 0.05, w * 0.36, -Math.PI * 0.58, -Math.PI * 0.32);
  g.closePath();
  g.fill();
  g.restore();
}

/** Painted cumulus cloud with an ink outline, optional sleepy face. */
export function cloudCanvas(seed: number, face = false) {
  const { c, g } = canvas(512, 256);
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const puffs: Array<[number, number, number]> = [];
  const n = 6 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = 70 + t * 372 + (r() - 0.5) * 30;
    const rad = 38 + Math.sin(t * Math.PI) * 52 + r() * 18;
    const y = 190 - rad * 0.55 - Math.sin(t * Math.PI) * 30;
    puffs.push([x, y, rad]);
  }
  puffs.push([256, 178, 62], [160, 186, 46], [352, 186, 46]);
  const base = 214; // flat cloud bottom
  const clipBottom = () => {
    g.beginPath();
    g.rect(0, 0, 512, base);
    g.clip();
  };
  // ink outline: the union of slightly bigger circles, cut flat at the base
  g.save();
  g.beginPath();
  g.rect(0, 0, 512, base + 6);
  g.clip();
  g.fillStyle = INK;
  for (const [x, y, rad] of puffs) {
    g.beginPath();
    g.arc(x, y, rad + 6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  // body
  g.save();
  clipBottom();
  for (const [x, y, rad] of puffs) {
    const grd = g.createRadialGradient(x - rad * 0.3, y - rad * 0.4, rad * 0.1, x, y, rad);
    grd.addColorStop(0, '#fffdf4');
    grd.addColorStop(0.6, '#fbf1da');
    grd.addColorStop(1, '#ead9bb');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // soft shading toward the base
  const sh = g.createLinearGradient(0, base - 50, 0, base);
  sh.addColorStop(0, 'rgba(190,160,130,0)');
  sh.addColorStop(1, 'rgba(190,160,130,0.45)');
  g.fillStyle = sh;
  g.fillRect(0, base - 50, 512, 50);
  g.restore();
  if (face) {
    pieEye(g, 220, 150, 28, 30, 0, 0.3, 0.9);
    pieEye(g, 292, 150, 28, 30, 0, 0.3, 0.9);
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(256, 168, 20, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
    g.fillStyle = 'rgba(240,143,166,0.5)';
    g.beginPath();
    g.ellipse(196, 176, 14, 8, 0, 0, Math.PI * 2);
    g.ellipse(316, 176, 14, 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** A grinning sun with wavy rays. */
export function sunCanvas(mood: 'happy' | 'sleepy' | 'moon' = 'happy') {
  const { c, g } = canvas(512, 512);
  const cx = 256;
  const cy = 256;
  if (mood !== 'moon') {
    // rays
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      g.fillStyle = i % 2 ? '#f6c64f' : '#f2a93b';
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(-26, -150);
      g.quadraticCurveTo(-8, -205, 0, -240);
      g.quadraticCurveTo(8, -205, 26, -150);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
  const body = mood === 'moon' ? '#f6efd2' : '#ffd75e';
  g.fillStyle = body;
  g.strokeStyle = INK;
  g.lineWidth = 9;
  g.beginPath();
  g.arc(cx, cy, 158, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (mood === 'moon') {
    g.fillStyle = 'rgba(200,190,150,0.6)';
    for (const [x, y, r] of [
      [190, 180, 26],
      [320, 330, 20],
      [300, 170, 14],
      [180, 340, 16],
    ])
      g.beginPath(), g.arc(x, y, r, 0, Math.PI * 2), g.fill();
  }
  // cheeks
  g.fillStyle = 'rgba(240,120,90,0.45)';
  g.beginPath();
  g.ellipse(170, 300, 30, 18, 0, 0, Math.PI * 2);
  g.ellipse(342, 300, 30, 18, 0, 0, Math.PI * 2);
  g.fill();
  const closed = mood === 'happy' ? 0 : 1;
  pieEye(g, 200, 220, 52, 64, 0.2, 0.2, closed);
  pieEye(g, 312, 220, 52, 64, 0.2, 0.2, closed);
  // grin
  g.fillStyle = '#7a2016';
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.beginPath();
  if (mood === 'happy') {
    g.moveTo(170, 300);
    g.quadraticCurveTo(256, 410, 342, 300);
    g.quadraticCurveTo(256, 340, 170, 300);
    g.fill();
    g.stroke();
  } else {
    g.arc(256, 300, 40, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  }
  return c;
}

/** Repeating candy stripes, used for tents and the Big Top. */
export function stripeTex(a: string, b: string, n = 8, vertical = true) {
  const { c, g } = canvas(256, 256);
  const step = 256 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    if (vertical) g.fillRect(i * step, 0, step, 256);
    else g.fillRect(0, i * step, 256, step);
  }
  const t = tex(c, true);
  return t;
}

/** Hand-lettered sign texture. */
export function signCanvas(text: string, w = 512, h = 160, bg = '#f4e7c5', fg = INK, font = 'Rye') {
  const { c, g } = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = h * 0.48;
  g.font = `${size}px "${font}", "Rye", Georgia, serif`;
  while (g.measureText(text).width > w - 60 && size > 10) {
    size -= 2;
    g.font = `${size}px "${font}", "Rye", Georgia, serif`;
  }
  g.fillText(text, w / 2, h / 2 + 4);
  return c;
}
