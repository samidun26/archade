import type { Action, Input } from '../core/Input';
import { MAP_SVG, PAUSE_SVG } from './icons';

/** On-screen controls for phones and tablets. */
export class TouchControls {
  readonly root: HTMLElement;
  private stick: HTMLElement;
  private nub: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private pinch: Map<number, { x: number; y: number }> = new Map();
  private actBtn: HTMLElement;
  private superBtn: HTMLElement;
  onPause: () => void = () => {};
  onMap: () => void = () => {};

  constructor(parent: HTMLElement, private input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'touch';
    this.root.innerHTML = `
      <div class="lookzone"></div>
      <div class="stickzone"></div>
      <div class="stick" hidden><div class="nub"></div></div>
      <div class="tbtns">
        <div class="tbtn act" data-a="interact" aria-label="Action">ACT</div>
        <div class="tbtn super" data-a="super" aria-label="Super" hidden>SUPER</div>
        <div class="tbtn dash" data-a="dash" aria-label="Dash">DASH</div>
        <div class="tbtn jump" data-a="jump" aria-label="Jump">JUMP</div>
      </div>
      <div class="topbtns">
        <button class="iconbtn" data-k="map" aria-label="Map">${MAP_SVG}</button>
        <button class="iconbtn" data-k="pause" aria-label="Pause">${PAUSE_SVG}</button>
      </div>`;
    parent.appendChild(this.root);
    this.stick = this.root.querySelector('.stick') as HTMLElement;
    this.nub = this.root.querySelector('.nub') as HTMLElement;
    this.actBtn = this.root.querySelector('.act') as HTMLElement;
    this.superBtn = this.root.querySelector('.super') as HTMLElement;

    const sz = this.root.querySelector('.stickzone') as HTMLElement;
    sz.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      sz.setPointerCapture(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stick.hidden = false;
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.nub.style.transform = '';
    });
    sz.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const max = 52;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        // drag the base along so the stick never "runs out"
        this.stickOrigin.x += (dx / len) * (len - max);
        this.stickOrigin.y += (dy / len) * (len - max);
        this.stick.style.left = `${this.stickOrigin.x}px`;
        this.stick.style.top = `${this.stickOrigin.y}px`;
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.nub.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / max;
      const ny = -dy / max;
      const m = Math.hypot(nx, ny);
      const k = m < 0.12 ? 0 : Math.min(1, (m - 0.12) / 0.8) / (m || 1);
      input.setTouchStick(nx * k, ny * k);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.stick.hidden = true;
      input.setTouchStick(0, 0);
    };
    sz.addEventListener('pointerup', endStick);
    sz.addEventListener('pointercancel', endStick);

    const lz = this.root.querySelector('.lookzone') as HTMLElement;
    lz.addEventListener('pointerdown', (e) => {
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      lz.setPointerCapture(e.pointerId);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    lz.addEventListener('pointermove', (e) => {
      if (this.pinch.size === 2 && this.pinch.has(e.pointerId)) {
        const pts = [...this.pinch.values()];
        const before = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p2 = [...this.pinch.values()];
        const after = Math.hypot(p2[0].x - p2[1].x, p2[0].y - p2[1].y);
        input.addZoom((before - after) * 0.01);
        return;
      }
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.pointerId !== this.lookId) return;
      input.addLook((e.clientX - this.lookLast.x) * 1.6, (e.clientY - this.lookLast.y) * 1.3);
      this.lookLast = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => {
      this.pinch.delete(e.pointerId);
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    lz.addEventListener('pointerup', endLook);
    lz.addEventListener('pointercancel', endLook);

    this.root.querySelectorAll<HTMLElement>('.tbtn').forEach((b) => {
      const a = b.dataset.a as Action;
      const down = (e: PointerEvent) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add('down');
        input.setVirtual(a, true);
        if (a === 'interact') input.setVirtual('fire', true);
        if (a === 'jump') input.setVirtual('confirm', true);
      };
      const up = () => {
        b.classList.remove('down');
        input.setVirtual(a, false);
        if (a === 'interact') input.setVirtual('fire', false);
        if (a === 'jump') input.setVirtual('confirm', false);
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    this.root.querySelector('[data-k="pause"]')!.addEventListener('click', () => this.onPause());
    this.root.querySelector('[data-k="map"]')!.addEventListener('click', () => this.onMap());
  }

  setVisible(v: boolean) {
    this.root.hidden = !v;
    if (!v) {
      this.stickId = null;
      this.stick.hidden = true;
      this.input.setTouchStick(0, 0);
    }
  }

  setActLabel(label: string) {
    if (this.actBtn.textContent !== label) this.actBtn.textContent = label;
  }

  setSuper(visible: boolean, ready: boolean) {
    this.superBtn.hidden = !visible;
    this.superBtn.style.opacity = ready ? '1' : '0.5';
  }
}
