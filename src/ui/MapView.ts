import type { Terrain } from '../world/Terrain';
import { pathDistance } from '../world/Terrain';
import { ZONES } from '../world/layout';

const SIZE = 640;
const HALF = 175; // world units shown from the center

export interface MapMarker {
  x: number;
  z: number;
  kind: 'reel' | 'reel-got' | 'npc' | 'player';
  yaw?: number;
}

/** A hand-inked parchment map of the island, drawn once from the terrain. */
export class MapView {
  private base: HTMLCanvasElement | null = null;

  constructor(private terrain: Terrain) {}

  private toPx(x: number, z: number) {
    return { x: ((x + HALF) / (HALF * 2)) * SIZE, y: ((z + HALF) / (HALF * 2)) * SIZE };
  }

  private drawBase() {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d')!;
    const img = g.createImageData(SIZE, SIZE);
    const d = img.data;
    for (let py = 0; py < SIZE; py++)
      for (let px = 0; px < SIZE; px++) {
        const x = (px / SIZE) * HALF * 2 - HALF;
        const z = (py / SIZE) * HALF * 2 - HALF;
        const h = this.terrain.heightAt(x, z);
        const i = (py * SIZE + px) * 4;
        let r: number;
        let gg: number;
        let b: number;
        if (h < 0) {
          // sea: pale teal with hatched ripples
          const hatch = (px + py * 0.5) % 9 < 1 && h < -1.5 ? -18 : 0;
          r = 168 + hatch;
          gg = 204 + hatch;
          b = 196 + hatch;
          if (h > -0.9) {
            r = 222;
            gg = 228;
            b = 206;
          }
        } else if (h < 1.8) {
          r = 236;
          gg = 214;
          b = 158;
        } else {
          const t = Math.min(1, h / 22);
          r = 178 + t * 40;
          gg = 196 + t * 18;
          b = 128 + t * 30;
          const fd = Math.hypot(x + 86, z + 12);
          if (fd < 46) {
            r -= 30;
            gg -= 12;
            b -= 30;
          }
          // contour lines
          if (Math.abs((h % 3) - 1.5) > 1.42) {
            r -= 35;
            gg -= 35;
            b -= 30;
          }
        }
        if (h > 0 && pathDistance(x, z) < 2.2) {
          r = 168;
          gg = 120;
          b = 74;
        }
        // paper tooth
        const n = (Math.sin(px * 12.9898 + py * 78.233) * 43758.5453) % 1;
        const k = 0.94 + Math.abs(n) * 0.08;
        d[i] = r * k;
        d[i + 1] = gg * k;
        d[i + 2] = b * k;
        d[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    // inked coastline
    g.fillStyle = '#1d140f';
    for (let py = 1; py < SIZE - 1; py++)
      for (let px = 1; px < SIZE - 1; px++) {
        const x = (px / SIZE) * HALF * 2 - HALF;
        const z = (py / SIZE) * HALF * 2 - HALF;
        const s = Math.sign(this.terrain.heightAt(x, z));
        const s2 = Math.sign(this.terrain.heightAt(x + (HALF * 2) / SIZE, z));
        const s3 = Math.sign(this.terrain.heightAt(x, z + (HALF * 2) / SIZE));
        if (s !== s2 || s !== s3) g.fillRect(px - 1, py - 1, 2.4, 2.4);
      }
    // vignette + border
    const v = g.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.72);
    v.addColorStop(0, 'rgba(120,80,40,0)');
    v.addColorStop(1, 'rgba(120,80,40,0.35)');
    g.fillStyle = v;
    g.fillRect(0, 0, SIZE, SIZE);
    // labels
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const zone of Object.values(ZONES)) {
      const p = this.toPx(zone.x, zone.z);
      g.font = '20px "Rye", Georgia, serif';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(244,231,197,0.9)';
      g.strokeText(zone.name, p.x, p.y + 26);
      g.fillStyle = '#1d140f';
      g.fillText(zone.name, p.x, p.y + 26);
    }
    // compass rose
    g.save();
    g.translate(SIZE - 62, SIZE - 70);
    g.fillStyle = '#c8352b';
    g.strokeStyle = '#1d140f';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -34);
    g.lineTo(10, 0);
    g.lineTo(0, 34);
    g.lineTo(-10, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#1d140f';
    g.font = '18px "Rye", Georgia, serif';
    g.fillText('N', 0, -48);
    g.restore();
    this.base = c;
  }

  render(markers: MapMarker[]) {
    if (!this.base) this.drawBase();
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'Map of Ballyhoo Island');
    const g = c.getContext('2d')!;
    g.drawImage(this.base!, 0, 0);
    for (const m of markers) {
      const p = this.toPx(m.x, m.z);
      g.lineWidth = 3;
      g.strokeStyle = '#1d140f';
      if (m.kind === 'player') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(-(m.yaw ?? 0) + Math.PI);
        g.fillStyle = '#2f7f86';
        g.beginPath();
        g.moveTo(0, -14);
        g.lineTo(10, 11);
        g.lineTo(0, 5);
        g.lineTo(-10, 11);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
        continue;
      }
      g.fillStyle = m.kind === 'reel' ? '#f2b83b' : m.kind === 'reel-got' ? '#9fd38a' : '#c8352b';
      g.beginPath();
      g.arc(p.x, p.y, m.kind === 'npc' ? 8 : 11, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#1d140f';
      g.font = '14px "Luckiest Guy", Impact, sans-serif';
      g.fillText(m.kind === 'npc' ? '!' : m.kind === 'reel-got' ? '✓' : '?', p.x, p.y + 1);
    }
    return c;
  }
}
