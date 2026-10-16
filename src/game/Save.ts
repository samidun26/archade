import type { Quality } from '../render/Renderer';

export interface Settings {
  music: number;
  sfx: number;
  quality: Quality;
  reduceFx: boolean;
  invertY: boolean;
  sensitivity: number;
  autoCam: boolean;
  mouseCapture: boolean;
}

export interface Progress {
  version: 1;
  started: boolean;
  tokens: string[];
  reels: string[];
  revealed: string[];
  lanterns: string[];
  kids: string[];
  kidsDelivered: boolean;
  lighthouseLit: boolean;
  bellRung: boolean;
  talked: string[];
  shop: { heart: boolean; twin: boolean; bowtie: boolean };
  spent: number;
  bossBeaten: boolean;
  bossAttempts: number;
  stats: { time: number; deaths: number; falls: number; hits: number; bossTime: number };
  player?: { x: number; y: number; z: number; yaw: number };
}

const SAVE_KEY = 'flick-lost-reels-save-v1';
const SETTINGS_KEY = 'flick-lost-reels-settings-v1';

export function defaultProgress(): Progress {
  return {
    version: 1,
    started: false,
    tokens: [],
    reels: [],
    revealed: [],
    lanterns: [],
    kids: [],
    kidsDelivered: false,
    lighthouseLit: false,
    bellRung: false,
    talked: [],
    shop: { heart: false, twin: false, bowtie: false },
    spent: 0,
    bossBeaten: false,
    bossAttempts: 0,
    stats: { time: 0, deaths: 0, falls: 0, hits: 0, bossTime: 0 },
  };
}

export function defaultSettings(touch: boolean): Settings {
  let reduce = false;
  try {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* ignore */
  }
  return {
    music: 0.7,
    sfx: 0.85,
    quality: touch ? 'medium' : 'high',
    reduceFx: reduce,
    invertY: false,
    sensitivity: 1,
    autoCam: true,
    mouseCapture: !touch,
  };
}

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage may be unavailable (private mode, sandbox) — the game still runs */
  }
}

export function loadProgress(): Progress | null {
  const p = read<Progress>(SAVE_KEY);
  if (!p || p.version !== 1) return null;
  return { ...defaultProgress(), ...p, shop: { ...defaultProgress().shop, ...p.shop }, stats: { ...defaultProgress().stats, ...p.stats } };
}
export function saveProgress(p: Progress) {
  write(SAVE_KEY, p);
}
export function clearProgress() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
export function loadSettings(touch: boolean): Settings {
  return { ...defaultSettings(touch), ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}
export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}
