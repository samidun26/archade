import type { Input, Device } from '../core/Input';
import type { Settings } from '../game/Save';
import { keyLabel } from './HUD';
import { REEL_SVG } from './icons';

const FOCUSABLE = 'button:not([disabled]), input, select, [role="switch"]';

interface ScreenEntry {
  el: HTMLElement;
  onBack?: () => void;
}

export class Screens {
  private stack: ScreenEntry[] = [];
  device: Device = 'keyboard';
  onSound: (s: 'ui' | 'confirm' | 'back') => void = () => {};

  constructor(private parent: HTMLElement) {}

  get active() {
    return this.stack.length > 0;
  }

  open(html: string, cls = '', onBack?: () => void) {
    const el = document.createElement('div');
    el.className = `screen ${cls}`;
    el.innerHTML = html;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    this.parent.appendChild(el);
    this.stack.push({ el, onBack });
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => this.onSound(b.classList.contains('secondary') ? 'back' : 'confirm')),
    );
    if (this.device !== 'touch')
      requestAnimationFrame(() => {
        const f = el.querySelector<HTMLElement>('[autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
        f?.focus({ preventScroll: true });
      });
    return el;
  }

  close(el: HTMLElement) {
    const i = this.stack.findIndex((s) => s.el === el);
    if (i >= 0) this.stack.splice(i, 1);
    el.remove();
    const top = this.stack[this.stack.length - 1];
    top?.el.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  }

  closeAll() {
    for (const s of this.stack) s.el.remove();
    this.stack = [];
  }

  /** Keyboard arrows / gamepad navigation inside the top-most screen. */
  handleInput(input: Input) {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    const items = Array.from(top.el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.offsetParent !== null);
    if (!items.length) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const move = (d: number) => {
      const n = (cur + d + items.length) % items.length;
      items[n].focus({ preventScroll: true });
      this.onSound('ui');
    };
    const onRange = (document.activeElement as HTMLInputElement)?.type === 'range';
    if (input.pressed('down')) move(1);
    if (input.pressed('up')) move(-1);
    if (onRange && input.device === 'gamepad') {
      const r = document.activeElement as HTMLInputElement;
      if (input.pressed('right')) (r.stepUp(), r.dispatchEvent(new Event('input')));
      if (input.pressed('left')) (r.stepDown(), r.dispatchEvent(new Event('input')));
    }
    // keyboard Enter/Space activate natively; gamepad needs a synthetic click
    if (input.device === 'gamepad' && input.pressed('confirm') && cur >= 0) (items[cur] as HTMLElement).click();
    if (input.pressed('back') && top.onBack) {
      input.consume('back');
      input.consume('pause');
      this.onSound('back');
      top.onBack();
    }
  }

  // ------------------------------------------------------------------ builders
  title(hasSave: boolean): Promise<'new' | 'continue'> {
    return new Promise((resolve) => {
      const el = this.open(
        `<div class="presents">ARCHADE PICTURES PRESENTS</div>
         <h1 class="logo">FLICK</h1>
         <div class="tagline">&amp; the Lost Reels of Ballyhoo</div>
         <div class="menu">
           ${hasSave ? '<button class="btn" data-act="continue" autofocus>Continue</button>' : ''}
           <button class="btn ${hasSave ? 'secondary' : ''}" data-act="new" ${hasSave ? '' : 'autofocus'}>${hasSave ? 'New Game' : 'Start the Picture'}</button>
           <div class="row">
             <button class="btn secondary" data-act="settings">Settings</button>
             <button class="btn secondary" data-act="controls">Controls</button>
           </div>
         </div>
         <p class="hint">Headphones recommended. Best with a mouse &amp; keyboard, gamepad, or touch.</p>
         <p class="credit">A 1930s rubber-hose adventure. All characters are original.<br><span class="madeby">Made by <b>samidun</b></span></p>`,
        'title clear',
      );
      el.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'new' && hasSave) {
          this.confirm('Start over? Your saved progress will be erased.', 'Erase & start', 'Keep my save').then((ok) => {
            if (ok) {
              this.close(el);
              resolve('new');
            }
          });
          return;
        }
        if (act === 'new' || act === 'continue') {
          this.close(el);
          resolve(act);
        }
        if (act === 'settings') this.settingsHook?.();
        if (act === 'controls') this.controls();
      });
    });
  }

  settingsHook: (() => void) | null = null;

  confirm(text: string, yes: string, no: string): Promise<boolean> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = (v: boolean) => {
        this.close(el);
        resolve(v);
      };
      el = this.open(
        `<div class="panel card"><h2>Hold your horses!</h2><p class="lede"></p>
         <div class="row"><button class="btn danger" data-v="1">${yes}</button><button class="btn secondary" data-v="0" autofocus>${no}</button></div></div>`,
        '',
        () => done(false),
      );
      (el.querySelector('.lede') as HTMLElement).textContent = text;
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => done(b.dataset.v === '1')));
    });
  }

  pause(): Promise<'resume' | 'map' | 'settings' | 'controls' | 'town' | 'title'> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = (v: 'resume' | 'map' | 'settings' | 'controls' | 'town' | 'title') => {
        this.close(el);
        resolve(v);
      };
      el = this.open(
        `<div class="panel card"><h2>Intermission</h2><p class="lede">The projector is paused.</p>
          <div class="menu">
            <button class="btn" data-act="resume" autofocus>Resume</button>
            <button class="btn secondary" data-act="map">Island Map</button>
            <div class="row">
              <button class="btn secondary" data-act="settings">Settings</button>
              <button class="btn secondary" data-act="controls">Controls</button>
            </div>
            <button class="btn secondary" data-act="town">Return to Town Square</button>
            <button class="btn secondary" data-act="title">Save &amp; Quit to Title</button>
          </div><p class="signoff">Made by <b>samidun</b></p></div>`,
        '',
        () => done('resume'),
      );
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => done(b.dataset.act as 'resume')));
    });
  }

  settings(s: Settings, onChange: (s: Settings) => void, isTouch: boolean): Promise<void> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = () => {
        this.close(el);
        resolve();
      };
      const sw = (id: string, on: boolean) => `<button class="toggle" role="switch" id="${id}" aria-checked="${on}" aria-labelledby="${id}-l"></button>`;
      el = this.open(
        `<div class="panel card"><h2>Settings</h2><p class="lede">Changes are saved automatically.</p>
          <div class="settings">
            <label for="set-music">Music</label><input type="range" id="set-music" min="0" max="1" step="0.05" value="${s.music}">
            <label for="set-sfx">Sound effects</label><input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${s.sfx}">
            <label for="set-quality">Picture quality<small>Lower it if the action feels sluggish.</small></label>
            <select id="set-quality">
              <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${s.quality === 'high' ? 'selected' : ''}>High</option>
            </select>
            <label id="set-reduce-l">Calm film effects<small>Turns off flicker, scratches and line wobble.</small></label>${sw('set-reduce', s.reduceFx)}
            <label id="set-auto-l">Camera follows you<small>Swings behind you while you run.</small></label>${sw('set-auto', s.autoCam)}
            <label id="set-invert-l">Invert camera up/down</label>${sw('set-invert', s.invertY)}
            <label for="set-sens">Camera speed</label><input type="range" id="set-sens" min="0.4" max="2" step="0.1" value="${s.sensitivity}">
            ${isTouch ? '' : `<label id="set-mouse-l">Capture the mouse<small>Click the game to look around; Esc releases it.</small></label>${sw('set-mouse', s.mouseCapture)}`}
          </div>
          <div class="row"><button class="btn" data-act="done">Done</button></div></div>`,
        '',
        done,
      );
      const get = <T extends HTMLElement>(id: string) => el.querySelector('#' + id) as T;
      const emit = () => onChange({ ...s });
      get<HTMLInputElement>('set-music').addEventListener('input', (e) => ((s.music = +(e.target as HTMLInputElement).value), emit()));
      get<HTMLInputElement>('set-sfx').addEventListener('input', (e) => ((s.sfx = +(e.target as HTMLInputElement).value), emit()));
      get<HTMLInputElement>('set-sens').addEventListener('input', (e) => ((s.sensitivity = +(e.target as HTMLInputElement).value), emit()));
      get<HTMLSelectElement>('set-quality').addEventListener('change', (e) => ((s.quality = (e.target as HTMLSelectElement).value as Settings['quality']), emit()));
      const toggle = (id: string, key: 'reduceFx' | 'autoCam' | 'invertY' | 'mouseCapture') => {
        const b = el.querySelector('#' + id) as HTMLButtonElement | null;
        b?.addEventListener('click', () => {
          s[key] = !s[key];
          b.setAttribute('aria-checked', String(s[key]));
          emit();
        });
      };
      toggle('set-reduce', 'reduceFx');
      toggle('set-auto', 'autoCam');
      toggle('set-invert', 'invertY');
      toggle('set-mouse', 'mouseCapture');
      el.querySelector('[data-act="done"]')!.addEventListener('click', done);
    });
  }

  controls(): Promise<void> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = () => {
        this.close(el);
        resolve();
      };
      const k = (...keys: string[]) => keys.map((x) => `<span class="kbd">${x}</span>`).join('');
      const tabs = ['Keyboard', 'Gamepad', 'Touch'];
      const start = this.device === 'gamepad' ? 1 : this.device === 'touch' ? 2 : 0;
      const tables = [
        [
          ['Move', k('W', 'A', 'S', 'D')],
          ['Look around', 'Mouse (click to capture) or drag'],
          ['Jump / double jump', k('Space')],
          ['Dash', k('Shift')],
          ['Talk / use', k('E')],
          ['Shoot (boss)', `${k('Click')} or ${k('J')}`],
          ['Super (boss)', k('Q')],
          ['Map', k('M')],
          ['Pause', k('Esc')],
        ],
        [
          ['Move', k('L-Stick')],
          ['Look around', k('R-Stick')],
          ['Jump / double jump', k('A')],
          ['Dash', `${k('B')} ${k('RB')}`],
          ['Talk / use', k('X')],
          ['Shoot (boss)', k('RT')],
          ['Super (boss)', k('Y')],
          ['Map', k('View')],
          ['Pause', k('Menu')],
        ],
        [
          ['Move', 'Drag on the left side'],
          ['Look around', 'Drag on the right side'],
          ['Jump / double jump', k('JUMP')],
          ['Dash', k('DASH')],
          ['Talk / use / shoot', k('ACT')],
          ['Super (boss)', k('SUPER')],
          ['Map & pause', 'Buttons at the top right'],
        ],
      ];
      el = this.open(
        `<div class="panel card"><h2>How to Play</h2>
          <p class="lede">Find the five lost film reels, help the islanders, then face the Baron.</p>
          <div class="tabs" role="tablist">${tabs.map((t, i) => `<button class="btn secondary" role="tab" data-tab="${i}" aria-selected="${i === start}">${t}</button>`).join('')}</div>
          <div class="controls-grid"></div>
          <div class="row"><button class="btn" data-act="done">Got it</button></div></div>`,
        '',
        done,
      );
      const grid = el.querySelector('.controls-grid') as HTMLElement;
      const show = (i: number) => {
        grid.innerHTML = tables[i].map(([a, b]) => `<span>${a}</span><span class="keys">${b}</span>`).join('');
        el.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String((t as HTMLElement).dataset.tab === String(i))));
      };
      show(start);
      el.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => show(+(t as HTMLElement).dataset.tab!)));
      el.querySelector('[data-act="done"]')!.addEventListener('click', done);
    });
  }

  story(title: string, paragraphs: string[], button: string): Promise<void> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = () => {
        this.close(el);
        resolve();
      };
      el = this.open(
        `<div class="panel card"><h2></h2>${paragraphs.map(() => '<p></p>').join('')}<div class="row"><button class="btn" autofocus>${button}</button></div></div>`,
        'story',
        done,
      );
      (el.querySelector('h2') as HTMLElement).textContent = title;
      el.querySelectorAll('p').forEach((p, i) => (p.textContent = paragraphs[i]));
      el.querySelector('button')!.addEventListener('click', done);
    });
  }

  results(rows: Array<[string, string]>, grade: string, title: string): Promise<'explore' | 'title'> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = (v: 'explore' | 'title') => {
        this.close(el);
        resolve(v);
      };
      el = this.open(
        `<div class="panel card results"><h2></h2><div class="grade" aria-label="Grade ${grade}">${grade}</div><dl>${rows.map(() => '<dt></dt><dd></dd>').join('')}</dl>
          <p class="signoff">Thanks for playing! Made by <b>samidun</b></p>
          <div class="row"><button class="btn" data-act="explore" autofocus>Keep exploring</button><button class="btn secondary" data-act="title">Back to title</button></div></div>`,
        'story',
      );
      (el.querySelector('h2') as HTMLElement).textContent = title;
      const dts = el.querySelectorAll('dt');
      const dds = el.querySelectorAll('dd');
      rows.forEach(([a, b], i) => {
        dts[i].textContent = a;
        dds[i].textContent = b;
      });
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => done(b.dataset.act as 'explore')));
    });
  }

  death(progress: number, marks: number[], tip: string): Promise<'retry' | 'leave'> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = (v: 'retry' | 'leave') => {
        this.close(el);
        resolve(v);
      };
      el = this.open(
        `<div class="panel card"><h2>You got clobbered!</h2><p class="lede"></p>
          <div class="progresstrack" aria-label="How far you got">
            <div class="fill" style="width:${(progress * 100).toFixed(1)}%"></div>
            ${marks.map((m) => `<div class="tick" style="left:${(m * 100).toFixed(1)}%"></div>`).join('')}
            <div class="marker" style="left:${(progress * 100).toFixed(1)}%"></div>
          </div>
          <div class="row"><button class="btn" data-act="retry" autofocus>Try again</button><button class="btn secondary" data-act="leave">Back to the island</button></div></div>`,
        '',
      );
      (el.querySelector('.lede') as HTMLElement).textContent = tip;
      el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => done(b.dataset.act as 'retry')));
    });
  }

  map(canvas: HTMLCanvasElement, reels: Array<{ name: string; got: boolean }>): Promise<void> {
    return new Promise((resolve) => {
      let el: HTMLElement;
      const done = () => {
        this.close(el);
        resolve();
      };
      el = this.open(
        `<div class="panel card" style="width:min(620px,100%)"><h2>Ballyhoo Island</h2>
          <div class="mapwrap"></div>
          <div class="legend">
            <span><i style="background:#f2b83b"></i>Reel to find</span>
            <span><i style="background:#9fd38a"></i>Reel found</span>
            <span><i style="background:#c8352b"></i>Someone needs you</span>
            <span><i style="background:#2f7f86"></i>You</span>
          </div>
          <div class="legend">${reels.map((r) => `<span>${REEL_SVG.replace('<svg', `<svg style="width:18px;height:18px;opacity:${r.got ? 1 : 0.35}"`)}${r.name}${r.got ? ' &#10003;' : ''}</span>`).join('')}</div>
          <div class="row"><button class="btn" autofocus>Close map</button></div></div>`,
        '',
        done,
      );
      el.querySelector('.mapwrap')!.appendChild(canvas);
      el.querySelector('button')!.addEventListener('click', done);
    });
  }

  keyHint(action: Parameters<typeof keyLabel>[0]) {
    return keyLabel(action, this.device);
  }
}
