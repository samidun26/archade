import type { Input } from '../core/Input';

export interface Choice {
  label: string;
  note?: string;
  disabled?: boolean;
}

export interface DialogueOpts {
  voice?: (ch: string) => void;
  choices?: Choice[];
  onAdvance?: () => void;
}

/** Parse *highlight* markup into segments. */
function segments(text: string) {
  const out: Array<{ t: string; em: boolean }> = [];
  const parts = text.split('*');
  parts.forEach((p, i) => p && out.push({ t: p, em: i % 2 === 1 }));
  return out;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export class Dialogue {
  private el: HTMLElement | null = null;
  private textEl!: HTMLElement;
  private moreEl!: HTMLElement;
  private choicesEl!: HTMLElement;
  private lines: string[] = [];
  private idx = 0;
  private shown = 0;
  private total = 0;
  private segs: Array<{ t: string; em: boolean }> = [];
  private acc = 0;
  private opts: DialogueOpts = {};
  private resolve: ((choice: number) => void) | null = null;
  private choiceIdx = 0;
  private choiceBtns: HTMLButtonElement[] = [];
  private inChoices = false;
  private openedAt = 0;
  cps = 46;

  constructor(private parent: HTMLElement) {}

  get isOpen() {
    return !!this.el;
  }

  /** Show lines one after another; resolves with the chosen index (or -1). */
  open(name: string, lines: string[], opts: DialogueOpts = {}): Promise<number> {
    this.close(-1);
    this.lines = lines;
    this.opts = opts;
    this.idx = 0;
    const el = document.createElement('div');
    el.className = 'dialogue card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `${name} says`);
    el.innerHTML = `<div class="nameplate"></div><div class="text" aria-live="polite"></div><div class="choices" role="listbox"></div><div class="more" aria-hidden="true">&#9660;</div>`;
    (el.querySelector('.nameplate') as HTMLElement).textContent = name;
    this.textEl = el.querySelector('.text') as HTMLElement;
    this.moreEl = el.querySelector('.more') as HTMLElement;
    this.choicesEl = el.querySelector('.choices') as HTMLElement;
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.choice')) return;
      e.preventDefault();
      this.advance();
    });
    this.parent.appendChild(el);
    this.el = el;
    this.openedAt = performance.now();
    this.startLine();
    return new Promise((res) => (this.resolve = res));
  }

  private startLine() {
    this.segs = segments(this.lines[this.idx]);
    this.total = this.segs.reduce((n, s) => n + s.t.length, 0);
    this.shown = 0;
    this.acc = 0;
    this.inChoices = false;
    this.choicesEl.innerHTML = '';
    this.choicesEl.hidden = true;
    this.moreEl.hidden = true;
    this.render();
  }

  private render() {
    let left = this.shown;
    let html = '';
    for (const s of this.segs) {
      if (left <= 0) break;
      const part = s.t.slice(0, left);
      left -= part.length;
      html += s.em ? `<em>${esc(part)}</em>` : esc(part);
    }
    this.textEl.innerHTML = html;
  }

  private get typing() {
    return this.shown < this.total;
  }

  advance() {
    if (!this.el || this.inChoices) return;
    if (performance.now() - this.openedAt < 180) return;
    if (this.typing) {
      this.shown = this.total;
      this.render();
      this.lineDone();
      return;
    }
    this.opts.onAdvance?.();
    if (this.idx < this.lines.length - 1) {
      this.idx++;
      this.startLine();
    } else if (!this.opts.choices?.length) this.close(-1);
  }

  private lineDone() {
    const last = this.idx === this.lines.length - 1;
    if (last && this.opts.choices?.length) this.showChoices();
    else this.moreEl.hidden = false;
  }

  private showChoices() {
    this.inChoices = true;
    this.moreEl.hidden = true;
    this.choicesEl.hidden = false;
    this.choicesEl.innerHTML = '';
    this.choiceBtns = [];
    this.opts.choices!.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.setAttribute('role', 'option');
      b.disabled = !!c.disabled;
      b.innerHTML = `${esc(c.label)}${c.note ? `<small>${esc(c.note)}</small>` : ''}`;
      b.addEventListener('click', () => !c.disabled && this.close(i));
      b.addEventListener('pointerenter', () => this.select(i));
      this.choicesEl.appendChild(b);
      this.choiceBtns.push(b);
    });
    const first = this.opts.choices!.findIndex((c) => !c.disabled);
    this.select(first < 0 ? 0 : first);
  }

  private select(i: number) {
    this.choiceIdx = i;
    this.choiceBtns.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    this.choiceBtns[i]?.focus({ preventScroll: true });
  }

  update(dt: number, input: Input) {
    if (!this.el) return;
    if (this.typing) {
      this.acc += dt * this.cps;
      while (this.acc >= 1 && this.typing) {
        this.acc -= 1;
        this.shown++;
        const ch = this.charAt(this.shown - 1);
        if (ch && /[a-z0-9]/i.test(ch) && this.shown % 2 === 0) this.opts.voice?.(ch);
        if (ch === '.' || ch === '!' || ch === '?') this.acc -= 6;
        if (ch === ',') this.acc -= 3;
      }
      this.render();
      if (!this.typing) this.lineDone();
    }
    if (this.inChoices) {
      const n = this.choiceBtns.length;
      const step = (d: number) => {
        let k = this.choiceIdx;
        for (let i = 0; i < n; i++) {
          k = (k + d + n) % n;
          if (!this.choiceBtns[k].disabled) break;
        }
        this.select(k);
      };
      if (input.pressed('down') || input.pressed('right')) step(1);
      if (input.pressed('up') || input.pressed('left')) step(-1);
      if (input.pressed('interact') || input.pressed('confirm')) {
        input.consume('interact');
        input.consume('confirm');
        input.consume('jump');
        if (!this.choiceBtns[this.choiceIdx]?.disabled) this.close(this.choiceIdx);
      }
      if (input.pressed('back')) {
        input.consume('back');
        input.consume('pause');
        this.close(this.choiceBtns.length - 1);
      }
      return;
    }
    if (input.pressed('interact') || input.pressed('jump') || input.pressed('confirm')) {
      input.consume('interact');
      input.consume('jump');
      input.consume('confirm');
      this.advance();
    }
  }

  private charAt(i: number) {
    let k = i;
    for (const s of this.segs) {
      if (k < s.t.length) return s.t[k];
      k -= s.t.length;
    }
    return '';
  }

  close(choice: number) {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    const r = this.resolve;
    this.resolve = null;
    r?.(choice);
  }
}
