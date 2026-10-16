import { COIN_SVG, REEL_SVG } from './icons';
import type { Device } from '../core/Input';

export const REEL_ORDER = ['lighthouse', 'popcorn', 'oak', 'ferris', 'sky'] as const;

export function keyLabel(action: 'interact' | 'jump' | 'dash' | 'fire' | 'super' | 'pause', device: Device) {
  if (device === 'gamepad') return { interact: 'X', jump: 'A', dash: 'B', fire: 'RT', super: 'Y', pause: '☰' }[action];
  if (device === 'touch') return { interact: 'ACT', jump: 'JUMP', dash: 'DASH', fire: 'FIRE', super: 'SUPER', pause: 'II' }[action];
  return { interact: 'E', jump: 'Space', dash: 'Shift', fire: 'Click', super: 'Q', pause: 'Esc' }[action];
}

export class HUD {
  readonly root: HTMLElement;
  private reelSlots: HTMLElement[] = [];
  private coinEl: HTMLElement;
  private coinNum: HTMLElement;
  private objective: HTMLElement;
  private promptEl: HTMLElement | null = null;
  private promptKey = '';
  private toasts: HTMLElement;
  private lastCoins = -1;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="reelstrip" role="img" aria-label="Film reels found"></div>
        <div class="coins" aria-live="polite">${COIN_SVG}<span class="num">0</span></div>
      </div>
      <section class="objective card" aria-live="polite"><h3>Objective</h3><p></p><p class="sub"></p></section>
      <div class="toasts" aria-live="polite"></div>`;
    parent.appendChild(this.root);
    const strip = this.root.querySelector('.reelstrip') as HTMLElement;
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('div');
      s.className = 'reelslot';
      s.innerHTML = REEL_SVG;
      strip.appendChild(s);
      this.reelSlots.push(s);
    }
    this.coinEl = this.root.querySelector('.coins') as HTMLElement;
    this.coinNum = this.root.querySelector('.coins .num') as HTMLElement;
    this.objective = this.root.querySelector('.objective') as HTMLElement;
    this.toasts = this.root.querySelector('.toasts') as HTMLElement;
  }

  setVisible(v: boolean) {
    this.root.classList.toggle('dim', !v);
  }

  setTouchMode(on: boolean) {
    this.root.classList.toggle('touchmode', on);
  }

  setReels(collected: Set<string>) {
    REEL_ORDER.forEach((id, i) => this.reelSlots[i].classList.toggle('got', collected.has(id)));
    const n = REEL_ORDER.filter((id) => collected.has(id)).length;
    this.root.querySelector('.reelstrip')!.setAttribute('aria-label', `Film reels found: ${n} of 5`);
  }

  setCoins(n: number) {
    if (n === this.lastCoins) return;
    const up = n > this.lastCoins && this.lastCoins >= 0;
    this.lastCoins = n;
    this.coinNum.textContent = String(n);
    if (up) {
      this.coinEl.classList.remove('bump');
      void this.coinEl.offsetWidth;
      this.coinEl.classList.add('bump');
    }
  }

  setObjective(title: string, text: string, sub = '') {
    (this.objective.querySelector('h3') as HTMLElement).textContent = title;
    (this.objective.querySelector('p') as HTMLElement).textContent = text;
    const s = this.objective.querySelector('.sub') as HTMLElement;
    s.textContent = sub;
    s.hidden = !sub;
  }

  setObjectiveVisible(v: boolean) {
    this.objective.hidden = !v;
  }

  setPrompt(label: string | null, who = '', key = 'E') {
    const k = label ? `${label}|${who}|${key}` : '';
    if (k === this.promptKey) return;
    this.promptKey = k;
    this.promptEl?.remove();
    this.promptEl = null;
    if (!label) return;
    const el = document.createElement('div');
    el.className = 'prompt';
    el.innerHTML = `<span class="kbd"></span><span class="lbl"></span>${who ? '<span class="who"></span>' : ''}`;
    (el.querySelector('.kbd') as HTMLElement).textContent = key;
    (el.querySelector('.lbl') as HTMLElement).textContent = label;
    if (who) (el.querySelector('.who') as HTMLElement).textContent = who;
    this.root.appendChild(el);
    this.promptEl = el;
  }

  zoneCard(name: string, eyebrow = 'Now entering') {
    this.root.querySelectorAll('.zonecard').forEach((e) => e.remove());
    const el = document.createElement('div');
    el.className = 'zonecard';
    el.innerHTML = `<div class="eyebrow"></div><div class="name"></div><div class="rule"></div>`;
    (el.querySelector('.eyebrow') as HTMLElement).textContent = eyebrow.toUpperCase();
    (el.querySelector('.name') as HTMLElement).textContent = name;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  toast(html: string) {
    const el = document.createElement('div');
    el.className = 'toast card';
    el.innerHTML = html;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.remove(), 3300);
  }
}

/** Big slammed word card ("REEL GET!", "KNOCKOUT!"). Resolves when it leaves. */
export function bigCard(parent: HTMLElement, word: string, sub = '', color: '' | 'red' | 'cream' = '', ms = 1800) {
  return new Promise<void>((resolve) => {
    const el = document.createElement('div');
    el.className = 'bigcard';
    el.innerHTML = `<div><div class="word ${color}"></div>${sub ? '<div class="subword"></div>' : ''}</div>`;
    (el.querySelector('.word') as HTMLElement).textContent = word;
    if (sub) (el.querySelector('.subword') as HTMLElement).textContent = sub;
    parent.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        resolve();
      }, 260);
    }, ms);
  });
}
