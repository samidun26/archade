// Unified input: keyboard, mouse (drag or pointer-lock), touch (virtual sticks) and gamepads.
// Game code only asks "is action held / was it pressed this frame" and reads move/look vectors.

export type Action =
  | 'jump'
  | 'dash'
  | 'interact'
  | 'fire'
  | 'super'
  | 'pause'
  | 'map'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back';

export type Device = 'keyboard' | 'touch' | 'gamepad';

const KEYMAP: Record<string, Action[]> = {
  Space: ['jump', 'confirm'],
  ShiftLeft: ['dash'],
  ShiftRight: ['dash'],
  KeyK: ['dash'],
  KeyE: ['interact'],
  Enter: ['interact', 'confirm'],
  NumpadEnter: ['interact', 'confirm'],
  KeyJ: ['fire'],
  KeyF: ['fire'],
  KeyQ: ['super'],
  KeyL: ['super'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  KeyM: ['map'],
  ArrowUp: ['up'],
  ArrowDown: ['down'],
  ArrowLeft: ['left'],
  ArrowRight: ['right'],
  KeyW: ['up'],
  KeyS: ['down'],
  KeyA: ['left'],
  KeyD: ['right'],
  Backspace: ['back'],
};

export class Input {
  /** Movement intent, x = right, y = forward. Length <= 1. */
  readonly move = { x: 0, y: 0 };
  /** Camera look delta accumulated this frame (in "pixels"; camera scales it). */
  lookX = 0;
  lookY = 0;
  zoom = 0;
  device: Device = 'keyboard';
  readonly isTouchDevice: boolean;
  pointerLocked = false;
  mouseCapture = true;
  invertY = false;
  sensitivity = 1;
  /** Disabled while menus or dialogue own the keyboard focus. */
  enabled = true;

  private keys = new Set<string>();
  private held = new Set<Action>();
  private pressedThisFrame = new Set<Action>();
  private virtualHeld = new Set<Action>();
  private padHeld = new Set<Action>();
  private padPrev = new Set<Action>();
  private touchStick = { x: 0, y: 0 };
  private padStick = { x: 0, y: 0 };
  private mouseDown = false;
  private dragging = false;
  private lastMouse = { x: 0, y: 0 };
  private listeners: Array<(d: Device) => void> = [];

  constructor(private canvas: HTMLElement) {
    this.isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    if (this.isTouchDevice && matchMedia('(pointer: coarse)').matches) this.device = 'touch';

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  onDeviceChange(fn: (d: Device) => void) {
    this.listeners.push(fn);
  }

  private setDevice(d: Device) {
    if (this.device === d) return;
    this.device = d;
    this.listeners.forEach((fn) => fn(d));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const inField = target && (target.tagName === 'INPUT' || target.tagName === 'SELECT');
    if (inField && e.code !== 'Escape') return;
    // Keep the page from scrolling while playing.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.enabled) {
      if (!(target && target.tagName === 'BUTTON')) e.preventDefault();
    }
    this.setDevice('keyboard');
    if (e.repeat) return;
    this.keys.add(e.code);
    const acts = KEYMAP[e.code];
    if (acts)
      for (const a of acts) {
        if (!this.held.has(a)) this.pressedThisFrame.add(a);
        this.held.add(a);
      }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    const acts = KEYMAP[e.code];
    if (acts)
      for (const a of acts) {
        // Only release if no other key for this action is still down.
        const still = Object.entries(KEYMAP).some(([k, v]) => k !== e.code && this.keys.has(k) && v.includes(a));
        if (!still) this.held.delete(a);
      }
  };

  private onMouseDown = (e: MouseEvent) => {
    this.setDevice('keyboard');
    this.mouseDown = true;
    this.lastMouse.x = e.clientX;
    this.lastMouse.y = e.clientY;
    if (e.button === 0 && (this.pointerLocked || !this.mouseCapture)) {
      if (!this.held.has('fire')) this.pressedThisFrame.add('fire');
      this.held.add('fire');
    }
    if (this.mouseCapture && !this.pointerLocked && this.enabled && !this.isTouchDevice) {
      this.requestLock();
    }
    this.dragging = !this.pointerLocked;
  };

  requestLock() {
    try {
      const p = (this.canvas as HTMLCanvasElement).requestPointerLock?.() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch {
      /* pointer lock is optional */
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  private onMouseUp = (e: MouseEvent) => {
    this.mouseDown = false;
    this.dragging = false;
    if (e.button === 0) this.held.delete('fire');
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return;
    if (this.pointerLocked) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    } else if (this.mouseDown && this.dragging) {
      this.lookX += (e.clientX - this.lastMouse.x) * 1.4;
      this.lookY += (e.clientY - this.lastMouse.y) * 1.4;
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom += Math.sign(e.deltaY) * 0.12;
  };

  // ---- Touch / virtual controls API (driven by TouchControls UI) ----
  setVirtual(a: Action, down: boolean) {
    this.setDevice('touch');
    if (down) {
      if (!this.virtualHeld.has(a)) this.pressedThisFrame.add(a);
      this.virtualHeld.add(a);
    } else this.virtualHeld.delete(a);
  }
  setTouchStick(x: number, y: number) {
    this.setDevice('touch');
    this.touchStick.x = x;
    this.touchStick.y = y;
  }
  addLook(dx: number, dy: number) {
    this.lookX += dx;
    this.lookY += dy;
  }
  addZoom(z: number) {
    this.zoom += z;
  }

  releaseAll() {
    this.keys.clear();
    this.held.clear();
    this.virtualHeld.clear();
    this.touchStick.x = this.touchStick.y = 0;
    this.mouseDown = false;
  }

  down(a: Action) {
    return this.held.has(a) || this.virtualHeld.has(a) || this.padHeld.has(a);
  }
  pressed(a: Action) {
    return this.pressedThisFrame.has(a);
  }
  /** Mark an action as handled so later systems in the same frame don't also react to it. */
  consume(a: Action) {
    this.pressedThisFrame.delete(a);
  }

  /** Call once per frame before game logic. */
  update() {
    this.pollGamepad();
    let x = 0;
    let y = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      x += this.touchStick.x + this.padStick.x;
      y += this.touchStick.y + this.padStick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressedThisFrame.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
  }

  private pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) pad = p;
    this.padHeld.clear();
    this.padStick.x = this.padStick.y = 0;
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const lx = dz(pad.axes[0] ?? 0);
    const ly = dz(pad.axes[1] ?? 0);
    const rx = dz(pad.axes[2] ?? 0);
    const ry = dz(pad.axes[3] ?? 0);
    const b = (i: number) => !!pad!.buttons[i]?.pressed;
    const any = lx || ly || rx || ry || pad.buttons.some((x) => x.pressed);
    if (any) this.setDevice('gamepad');
    this.padStick.x = lx;
    this.padStick.y = -ly;
    this.lookX += rx * 14;
    this.lookY += ry * 10;
    const map: Array<[number, Action[]]> = [
      [0, ['jump', 'confirm']],
      [1, ['dash', 'back']],
      [2, ['interact']],
      [3, ['super']],
      [4, ['super']],
      [5, ['dash']],
      [7, ['fire']],
      [6, ['fire']],
      [9, ['pause']],
      [8, ['map']],
      [12, ['up']],
      [13, ['down']],
      [14, ['left']],
      [15, ['right']],
    ];
    for (const [i, acts] of map) if (b(i)) acts.forEach((a) => this.padHeld.add(a));
    if (ly < -0.6) this.padHeld.add('up');
    if (ly > 0.6) this.padHeld.add('down');
    for (const a of this.padHeld) if (!this.padPrev.has(a)) this.pressedThisFrame.add(a);
    this.padPrev = new Set(this.padHeld);
  }
}
