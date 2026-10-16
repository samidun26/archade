import { Color, Vector3 } from 'three';
import { Renderer, FILM_DEFAULT, FILM_REDUCED } from '../render/Renderer';
import { Input } from '../core/Input';
import { AudioEngine, MIXES, type SfxName } from '../core/Audio';
import { Overworld } from './Overworld';
import { HUD, REEL_ORDER, bigCard, keyLabel } from '../ui/HUD';
import { Dialogue } from '../ui/Dialogue';
import { Screens } from '../ui/Screens';
import { TouchControls } from '../ui/Touch';
import { MapView, type MapMarker } from '../ui/MapView';
import { BossHUD } from '../ui/BossHUD';
import { BossArena, PHASE_MARKS, bossTips } from '../boss/BossArena';
import {
  clearProgress,
  defaultProgress,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  type Progress,
  type Settings,
} from './Save';
import { KID_LINES, REEL_NAMES, SHOP, indicatorFor, objective, reelCount, talkFor, type QuestCtx } from './Quests';
import { SKY_PRESETS } from '../render/Sky';
import { SPAWN, ZONES } from '../world/layout';
import type { PlayerHooks } from '../player/Player';
import { clamp, damp } from '../core/math';
import type { NPC } from '../npc/NPC';
import { PAL } from '../render/materials';

type Mode = 'loading' | 'title' | 'play' | 'boss' | 'cutscene';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Game {
  readonly renderer: Renderer;
  readonly input: Input;
  readonly audio = new AudioEngine();
  settings: Settings;
  progress: Progress;
  private ui: HTMLElement;
  private hud!: HUD;
  private dialogue!: Dialogue;
  private screens!: Screens;
  private touch: TouchControls | null = null;
  private bossHud!: BossHUD;
  private mapView!: MapView;
  ow!: Overworld;
  boss: BossArena | null = null;
  mode: Mode = 'loading';
  private t = 0;
  private last = performance.now();
  private saveT = 0;
  private zone = '';
  private celebrateT = 0;
  private worldDirty = false;
  private iris: HTMLElement;
  private blackout: HTMLElement;
  private busy = false; // a scripted sequence owns the player
  private lockedByUs = false;
  private fireworksT = 0;
  private titleT = 0;
  private baseHemi = 1.15;
  private baseSun = 2.0;
  private forestHaze = new Color(0x7f9070);
  private dayHaze = new Color(0xf1e2bd);
  private nightHaze = new Color(0x3c4068);
  private kidHome = new Map<string, Vector3>();

  constructor(app: HTMLElement) {
    const canvas = app.querySelector('#gl') as HTMLCanvasElement;
    this.ui = app.querySelector('#ui') as HTMLElement;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.settings = loadSettings(this.input.isTouchDevice);
    this.progress = loadProgress() ?? defaultProgress();
    this.iris = document.createElement('div');
    this.iris.className = 'iris';
    this.iris.style.width = this.iris.style.height = '0px';
    this.blackout = document.createElement('div');
    this.blackout.className = 'blackout';
    this.ui.append(this.blackout, this.iris);
  }

  // ------------------------------------------------------------------ boot
  async boot() {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = `<div><svg class="reel" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#f2b83b" stroke="#fbf0d4" stroke-width="3"/><circle cx="20" cy="20" r="4" fill="#1d140f"/>${[0, 1, 2, 3, 4, 5]
      .map((i) => `<circle cx="${20 + Math.cos((i / 6) * 6.283) * 9.5}" cy="${20 + Math.sin((i / 6) * 6.283) * 9.5}" r="4" fill="#3a2e28"/>`)
      .join('')}</svg><p>THREADING THE PROJECTOR&hellip;</p></div>`;
    this.ui.appendChild(loading);
    await nextFrame();
    try {
      await Promise.race([document.fonts.ready, wait(2500)]);
    } catch {
      /* fonts are optional */
    }
    await nextFrame();

    this.hud = new HUD(this.ui);
    this.dialogue = new Dialogue(this.ui);
    this.bossHud = new BossHUD(this.ui);
    this.screens = new Screens(this.ui);
    this.screens.onSound = (s) => this.audio.sfx(s);
    this.screens.settingsHook = () => this.openSettings();
    if (this.input.isTouchDevice) {
      this.touch = new TouchControls(this.ui, this.input);
      this.touch.onPause = () => this.openPause();
      this.touch.onMap = () => this.openMap();
    }
    this.input.onDeviceChange((d) => {
      this.screens.device = d;
      this.refreshUI();
    });
    this.screens.device = this.input.device;

    this.ow = new Overworld(this.renderer, this.playerHooks());
    this.mapView = new MapView(this.ow.terrain);
    this.baseHemi = this.ow.hemi.intensity;
    this.baseSun = this.ow.sun.intensity;
    this.ow.world.on((e) => this.onWorldEvent(e));
    for (const k of this.ow.world.kids) this.kidHome.set(k.id, k.home.clone());
    this.applySettings();
    this.applyProgressToWorld();

    // audio needs a user gesture
    const unlock = () => {
      this.audio.unlock();
      this.audio.setVolumes(this.settings.music, this.settings.sfx);
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement != null;
      if (!locked && !this.lockedByUs && (this.mode === 'play' || this.mode === 'boss') && !this.screens.active && !this.dialogue.isOpen) this.openPause();
      this.lockedByUs = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'play' || this.mode === 'boss') && !this.screens.active) this.openPause();
      if (document.hidden) this.save();
    });
    window.addEventListener('beforeunload', () => this.save());

    loading.remove();
    this.blackout.hidden = true;
    requestAnimationFrame((n) => this.frame(n));
    this.title();
  }

  private playerHooks(): PlayerHooks & { sfx: (n: SfxName, o?: { pitch?: number; vol?: number }) => void } {
    const fxAt = () => (this.boss ? this.boss.fx : this.ow.fx);
    const pl = () => (this.boss ? this.boss.player : this.ow.player);
    return {
      jump: (dbl) => {
        this.audio.sfx(dbl ? 'doublejump' : 'jump');
        const p = pl();
        if (dbl) fxAt().burst('star', p.pos.clone().setY(p.pos.y + 0.4), 5, 3, { up: -0.2 });
        fxAt().ring(p.pos.clone().setY(p.pos.y + 0.1), dbl ? 6 : 5, dbl ? 2.6 : 2.0, 0.32);
      },
      land: (impact) => {
        const p = pl();
        if (impact > 0.15) {
          this.audio.sfx('land', { vol: 0.5 + impact });
          fxAt().ring(p.pos.clone().setY(p.pos.y + 0.1), 6 + Math.round(impact * 6), 2 + impact * 4, 0.35 + impact * 0.3);
        }
      },
      dash: () => {
        this.audio.sfx('dash');
        const p = pl();
        const back = p.forward.multiplyScalar(-6);
        for (let i = 0; i < 6; i++) fxAt().emit('puff', p.pos.clone().setY(p.pos.y + 0.6 + Math.random()), back, { size: 0.3, life: 0.35, stretch: 2 });
        (this.boss ? this.boss.rig : this.ow.rig).fovKick = 7;
      },
      bounce: () => {
        this.audio.sfx('bounce');
        const p = pl();
        fxAt().ring(p.pos.clone(), 10, 4, 0.4);
        fxAt().burst('star', p.pos.clone(), 5, 6);
      },
      footstep: () => this.audio.sfx('step'),
      fellInWater: () => this.onFall(),
      sfx: (n, o) => this.audio.sfx(n, o),
    };
  }

  // ------------------------------------------------------------------ settings & progress
  private applySettings() {
    const s = this.settings;
    this.renderer.setQuality(s.quality);
    this.renderer.film = { ...(s.reduceFx ? FILM_REDUCED : FILM_DEFAULT) };
    const shadow = s.quality === 'high' ? 2048 : 1024;
    for (const light of [this.ow?.sun, this.boss?.sun]) {
      if (!light || light.shadow.mapSize.x === shadow) continue;
      light.shadow.mapSize.set(shadow, shadow);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
    this.input.invertY = s.invertY;
    this.input.sensitivity = s.sensitivity;
    this.input.mouseCapture = s.mouseCapture;
    if (this.ow) this.ow.rig.autoFollow = s.autoCam;
    this.audio.setVolumes(s.music, s.sfx);
    saveSettings(s);
  }

  get wallet() {
    return this.progress.tokens.length - this.progress.spent;
  }

  private ctx(): QuestCtx {
    const w = this.ow.world;
    const dev = this.input.device;
    return {
      p: this.progress,
      key: (a) => keyLabel(a, dev),
      mapKey: dev === 'gamepad' ? 'View' : dev === 'touch' ? 'the map button' : 'M',
      lanternsLit: () => w.lanterns.filter((l) => l.lit).map((l) => l.key),
      kidsFound: () => w.kids.filter((k) => k.found).map((k) => k.id),
      reelTaken: (id) => this.progress.reels.includes(id),
      wallet: () => this.wallet,
    };
  }

  /** Make the world match the save (used at boot and on new game). */
  private applyProgressToWorld() {
    const p = this.progress;
    const w = this.ow.world;
    const taken = new Set(p.tokens);
    for (const k of w.tokens.list) {
      k.taken = taken.has(k.id);
      k.pop = 0;
    }
    if (p.bellRung) w.restoreBell();
    w.bellRung = p.bellRung;
    for (const l of w.lanterns) {
      if (p.lanterns.includes(l.key)) l.light(true);
      else l.unlight();
    }
    w.lighthouseLit = p.lighthouseLit;
    if (p.lighthouseLit) w.restoreLamp();
    for (const kid of w.kids) {
      kid.found = p.kids.includes(kid.id);
      if (kid.found) this.sendKidHome(kid.id, true);
    }
    for (const [id, reel] of w.reels) {
      const taken = p.reels.includes(id);
      if (taken) {
        reel.taken = true;
        reel.visible = false;
        continue;
      }
      const shouldShow =
        id === 'ferris' || id === 'sky' || (id === 'lighthouse' && p.lighthouseLit) || (id === 'popcorn' && p.kidsDelivered) || (id === 'oak' && p.lanterns.length >= 5) || p.revealed.includes(id);
      if (shouldShow) reel.reveal(true);
    }
    this.ow.player.model.setBowTie(p.shop.bowtie);
    if (p.bossBeaten) this.setNight(true);
    this.worldDirty = true;
  }

  private save() {
    if (!this.progress.started) return;
    const pl = this.ow?.player;
    if (pl && this.mode === 'play') this.progress.player = { x: pl.lastSafe.x, y: pl.lastSafe.y, z: pl.lastSafe.z, yaw: pl.yaw };
    saveProgress(this.progress);
  }

  // ------------------------------------------------------------------ title & intro
  private async title() {
    this.mode = 'title';
    this.hud.setVisible(false);
    this.touch?.setVisible(false);
    this.bossHud.show(false);
    this.audio.play('waltz');
    this.titleT = 0;
    await this.irisTo(true, 900);
    const hasSave = !!loadProgress()?.started;
    const choice = this.autostart() ? 'new' : await this.screens.title(hasSave);
    this.audio.unlock();
    this.audio.sfx('card');
    if (choice === 'new') {
      clearProgress();
      if (this.worldDirty && hasSave) {
        try {
          sessionStorage.setItem('flick-autostart', '1');
        } catch {
          /* ignore */
        }
        location.reload();
        return;
      }
      this.progress = defaultProgress();
      this.applyProgressToWorld();
      await this.irisTo(false, 600);
      await this.screens.story(
        'Ballyhoo Island, 1933',
        [
          'Tonight was supposed to be the Grand Picture Show under the Big Top. The whole island has been humming about it for weeks.',
          'Then a sour storm cloud in a top hat, the dastardly Baron Von Blackout, howled into town, scattered all five film reels across the island, and padlocked the show.',
          'Luckily, one little light bulb just stepped off the morning ferry.',
        ],
        'Roll film!',
      );
      this.startPlay(true);
    } else {
      await this.irisTo(false, 500);
      this.startPlay(false);
    }
  }

  private autostart() {
    try {
      if (sessionStorage.getItem('flick-autostart') === '1') {
        sessionStorage.removeItem('flick-autostart');
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  private startPlay(fresh: boolean) {
    const pl = this.ow.player;
    const sp = this.progress.player;
    if (!fresh && sp) pl.place(sp.x, sp.y + 0.2, sp.z, sp.yaw);
    else pl.place(SPAWN.x, this.ow.terrain.heightAt(SPAWN.x, SPAWN.z), SPAWN.z, SPAWN.yaw);
    this.ow.rig.snap(pl.pos, pl.yaw + Math.PI);
    this.ow.rig.yaw = pl.yaw + Math.PI;
    this.mode = 'play';
    this.progress.started = true;
    this.zone = '';
    this.hud.setVisible(true);
    this.refreshUI();
    this.audio.play(this.progress.bossBeaten ? 'waltz' : 'rag');
    this.irisTo(true, 800);
    this.save();
  }

  // ------------------------------------------------------------------ frame loop
  private frame(now: number) {
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.t += dt;
    this.input.update();
    try {
      switch (this.mode) {
        case 'title':
          this.updateTitle(dt);
          break;
        case 'play':
        case 'cutscene':
          this.updatePlay(dt);
          break;
        case 'boss':
          this.updateBoss(dt);
          break;
      }
    } catch (err) {
      console.error(err);
    }
    this.input.endFrame();
    requestAnimationFrame((n) => this.frame(n));
  }

  private renderOverworld(dt: number) {
    const ow = this.ow;
    ow.updateLights();
    ow.sky.update(this.t, ow.rig.camera.position);
    ow.water.update(this.t);
    this.renderer.render(ow.scene, ow.rig.camera, this.t, dt);
  }

  private updateTitle(dt: number) {
    this.titleT += dt;
    const ow = this.ow;
    const beat = this.audio.beat;
    ow.physics.beginFrame();
    ow.world.update(dt, this.t, beat, ow.player.pos);
    ow.world.tokens.update(dt, this.t, new Vector3(0, -999, 0));
    ow.fx.update(dt);
    const a = this.titleT * 0.045 + 0.6;
    const cam = ow.rig.camera;
    cam.position.set(Math.sin(a) * 66, 36 + Math.sin(this.titleT * 0.2) * 3, Math.cos(a) * 66);
    cam.lookAt(0, 6, 0);
    if (this.screens.active) this.screens.handleInput(this.input);
    this.renderOverworld(dt);
  }

  private updatePlay(dt: number) {
    const ow = this.ow;
    const pl = ow.player;
    const input = this.input;
    const w = ow.world;
    const beat = this.audio.beat;
    const modal = this.screens.active;
    if (modal) {
      this.screens.handleInput(input);
      this.renderOverworld(0);
      return;
    }
    const talking = this.dialogue.isOpen;
    if (talking) this.dialogue.update(dt, input);
    if (this.mode === 'play' && !talking && !this.busy) {
      if (input.pressed('pause')) return void this.openPause();
      if (input.pressed('map')) return void this.openMap();
    }
    input.enabled = !talking;
    pl.frozen = talking || this.busy || this.mode === 'cutscene';

    // world + player
    ow.physics.beginFrame();
    w.update(dt, this.t, beat, pl.pos);
    pl.update(dt, input, ow.rig.yaw, beat);
    this.progress.stats.time += dt;

    // tokens
    const got = w.tokens.update(dt, this.t, pl.pos);
    for (const k of got) {
      this.progress.tokens.push(k.id);
      this.audio.sfx('coin', { pitch: 1 + Math.random() * 0.05 });
      ow.fx.burst('spark', k.pos, 6, 4);
    }
    if (got.length) this.hud.setCoins(this.wallet);

    // reels
    if (!this.busy && this.mode === 'play') {
      const c = pl.pos.clone().setY(pl.pos.y + 1);
      for (const [id, reel] of w.reels) if (reel.visible && !reel.taken && reel.center.distanceTo(c) < 2.3) this.collectReel(id);
      this.checkKids();
      this.interactions(talking);
    }
    this.updateKids(dt);

    // celebration pose after a reel
    if (this.celebrateT > 0) {
      this.celebrateT -= dt;
      pl.celebrate = this.celebrateT > 0;
    }

    // camera
    ow.rig.update(dt, input, pl.pos, pl.vel, pl.grounded, ow.physics, pl.yaw);

    // forest gloom + bulb glow
    const f = w.forestness;
    const night = this.progress.bossBeaten ? 1 : 0;
    ow.hemi.intensity = damp(ow.hemi.intensity, this.baseHemi * (1 - 0.42 * f), 3, dt);
    ow.sun.intensity = damp(ow.sun.intensity, this.baseSun * (1 - 0.55 * f), 3, dt);
    const haze = (night ? this.nightHaze : this.dayHaze).clone().lerp(this.forestHaze, f * (night ? 0.3 : 0.8));
    this.renderer.haze.lerp(haze, 1 - Math.exp(-dt * 3));
    pl.glow = damp(pl.glow, Math.max(f * 0.9, night * 0.8), 3, dt);

    this.updateZone();
    if (night) this.fireworks(dt);
    ow.fx.update(dt);

    this.saveT += dt;
    if (this.saveT > 8) {
      this.saveT = 0;
      this.save();
    }
    this.renderOverworld(dt);
  }

  // ------------------------------------------------------------------ interactions
  private interactions(talking: boolean) {
    if (talking) {
      this.hud.setPrompt(null);
      return;
    }
    const w = this.ow.world;
    const pl = this.ow.player;
    let best: { d: number; label: string; who: string; run: () => void } | null = null;
    for (const npc of w.npcs.values()) {
      if (!npc.visible || npc.talkRadius <= 0) continue;
      const wp = npc.worldPos;
      const d = Math.hypot(wp.x - pl.pos.x, wp.z - pl.pos.z);
      if (d < npc.talkRadius && Math.abs(wp.y - pl.pos.y) < 4 && (!best || d < best.d)) best = { d, label: 'Talk', who: npc.displayName, run: () => this.talk(npc) };
    }
    for (const it of w.interactables) {
      if (!it.enabled()) continue;
      const d = Math.hypot(it.pos.x - pl.pos.x, it.pos.z - pl.pos.z);
      const dy = pl.pos.y - it.pos.y;
      if (d < it.radius && (!it.yRange || (dy > it.yRange[0] && dy < it.yRange[1])) && (!best || d < best.d)) best = { d, label: it.label(), who: '', run: it.act };
    }
    const key = keyLabel('interact', this.input.device);
    this.hud.setPrompt(best ? best.label : null, best?.who ?? '', key);
    this.touch?.setActLabel(best ? (best.label === 'Talk' ? 'TALK' : 'USE') : 'ACT');
    if (best && this.input.pressed('interact')) {
      this.input.consume('interact');
      best.run();
    }
  }

  private async talk(npc: NPC) {
    const pl = this.ow.player;
    const id = npc.npcId;
    const ctx = this.ctx();
    const talk = talkFor(id, ctx, {
      deliverKids: () => this.deliverKids(),
      enterBigTop: () => this.startBoss(),
      buy: (item) => this.buy(item),
    });
    npc.talking = true;
    pl.talking = true;
    const wp = npc.worldPos;
    pl.yaw = Math.atan2(wp.x - pl.pos.x, wp.z - pl.pos.z);
    this.ow.rig.focus = wp.clone().setY(wp.y + npc.top * 0.6);
    this.ow.rig.focusWeight = 0.8;
    this.hud.setPrompt(null);
    this.exitLock();
    this.touch?.setVisible(false);
    const choice = await this.dialogue.open(npc.displayName, talk.lines.filter(Boolean), {
      voice: () => this.audio.voice(npc.voice),
      choices: talk.choices,
    });
    npc.talking = false;
    pl.talking = false;
    this.ow.rig.focus = null;
    this.ow.rig.focusWeight = 0;
    talk.after?.(choice);
    this.refreshUI();
    this.save();
  }

  private buy(item: string) {
    const it = SHOP.find((s) => s.id === item);
    if (!it) return false;
    const p = this.progress;
    if (p.shop[it.id] || this.wallet < it.price) {
      this.audio.sfx('back');
      return false;
    }
    p.shop[it.id] = true;
    p.spent += it.price;
    this.audio.sfx('buy');
    this.hud.toast(`<b>Bought!</b> ${it.label}`);
    if (it.id === 'bowtie') this.ow.player.model.setBowTie(true);
    this.hud.setCoins(this.wallet);
    return true;
  }

  // ------------------------------------------------------------------ reels, kids, events
  private async collectReel(id: string) {
    const w = this.ow.world;
    const reel = w.reels.get(id)!;
    reel.collect();
    if (!this.progress.reels.includes(id)) this.progress.reels.push(id);
    this.audio.sfx('reel');
    const c = reel.center;
    this.ow.fx.burst('star', c, 18, 10);
    this.ow.fx.burst('confetti', c, 30, 9, { up: 1 });
    this.celebrateT = 2.0;
    this.busy = true;
    const n = reelCount(this.ctx());
    this.refreshUI();
    this.save();
    await bigCard(this.ui, 'REEL GET!', `${REEL_NAMES[id] ?? 'Film'} Reel · ${n} of 5`, '', 1700);
    this.busy = false;
    if (n === 5) {
      this.audio.sfx('jingle');
      this.hud.toast('<b>All five reels!</b> Take them to Tess at the Big Top.');
    }
  }

  private checkKids() {
    const pl = this.ow.player;
    const w = this.ow.world;
    for (const kid of w.kids) {
      if (kid.found) continue;
      const wp = kid.npc.worldPos;
      if (wp.distanceTo(pl.pos) < 2.0) {
        kid.found = true;
        if (!this.progress.kids.includes(kid.id)) this.progress.kids.push(kid.id);
        const n = w.kids.filter((k) => k.found).length;
        this.audio.sfx('pop');
        this.audio.sfx('jingle');
        this.ow.fx.burst('star', wp.clone().setY(wp.y + 1), 10, 6);
        this.hud.toast(`<b>${KID_LINES[(n - 1) % KID_LINES.length]}</b> Kernel Kid found (${n}/3)`);
        this.sendKidHome(kid.id, false);
        this.refreshUI();
        this.save();
      }
    }
  }

  private sendKidHome(id: string, instant: boolean) {
    const kid = this.ow.world.kids.find((k) => k.id === id);
    if (!kid) return;
    const npc = kid.npc;
    const wp = npc.worldPos;
    if (npc.parent !== this.ow.world.root) {
      npc.parent?.remove(npc);
      this.ow.world.root.add(npc);
    }
    npc.position.copy(wp);
    kid.from.copy(wp);
    kid.hopT = instant ? 1 : 0;
    if (instant) npc.position.copy(kid.home);
  }

  private updateKids(dt: number) {
    for (const kid of this.ow.world.kids) {
      if (kid.hopT < 0 || kid.hopT >= 1) continue;
      kid.hopT = Math.min(1, kid.hopT + dt / 2.2);
      const t = kid.hopT;
      const p = kid.from.clone().lerp(kid.home, t);
      p.y += Math.sin(t * Math.PI) * 9 + Math.abs(Math.sin(t * Math.PI * 6)) * 0.6;
      kid.npc.position.copy(p);
      if (t >= 1) {
        kid.npc.position.copy(kid.home);
        this.ow.fx.ring(kid.home.clone(), 6, 2, 0.25);
      }
    }
  }

  private deliverKids() {
    if (this.progress.kidsDelivered) return;
    this.progress.kidsDelivered = true;
    const reel = this.ow.world.reels.get('popcorn')!;
    reel.reveal();
    if (!this.progress.revealed.includes('popcorn')) this.progress.revealed.push('popcorn');
    this.audio.sfx('jingle');
    this.ow.fx.burst('confetti', reel.center, 24, 8);
    this.refreshUI();
  }

  private onWorldEvent(e: import('../world/World').WorldEvent) {
    const w = this.ow.world;
    switch (e.type) {
      case 'lantern-lit': {
        if (!this.progress.lanterns.includes(e.id)) this.progress.lanterns.push(e.id);
        this.audio.sfx('lantern');
        this.hud.toast(`<b>Lantern lit!</b> ${e.count} of 5 burning in Gloomwood`);
        if (e.count >= 5) {
          w.reels.get('oak')?.reveal();
          this.audio.sfx('jingle');
          this.hud.toast("<b>Old Man Oak can see again!</b> Something gleams in his crown.");
        }
        this.refreshUI();
        this.save();
        break;
      }
      case 'lamp-lit':
        this.progress.lighthouseLit = true;
        w.reels.get('lighthouse')?.reveal();
        this.audio.sfx('lantern');
        this.audio.sfx('jingle');
        this.hud.toast('<b>Old Blinky shines again!</b> A reel glints on the balcony.');
        this.refreshUI();
        this.save();
        break;
      case 'bell-rung':
        this.audio.sfx('bell');
        if (e.first) {
          this.progress.bellRung = true;
          this.hud.toast('<b>DING!</b> Five tokens tumble out of the strongman bell.');
          this.save();
        }
        break;
      case 'balloon-ride':
        this.balloonRide();
        break;
    }
  }

  private async balloonRide() {
    if (this.busy) return;
    this.busy = true;
    this.audio.sfx('slidedown');
    await this.irisTo(false, 600);
    const x = -12;
    const z = -106;
    this.ow.player.place(x, this.ow.terrain.heightAt(x, z), z, 0);
    this.ow.rig.snap(this.ow.player.pos, Math.PI);
    this.ow.rig.yaw = Math.PI;
    await wait(200);
    await this.irisTo(true, 700);
    this.busy = false;
  }

  private async onFall() {
    if (this.busy) return;
    const pl = this.boss ? this.boss.player : this.ow.player;
    if (this.boss) return;
    this.busy = true;
    this.progress.stats.falls++;
    this.audio.sfx('splash');
    this.ow.fx.burst('splash', pl.pos.clone().setY(0.2), 16, 8);
    pl.vel.set(0, 0, 0);
    await wait(250);
    await this.irisTo(false, 420);
    pl.respawn();
    this.ow.rig.snap(pl.pos, this.ow.rig.yaw);
    await wait(120);
    this.busy = false;
    await this.irisTo(true, 500);
  }

  // ------------------------------------------------------------------ zones & UI
  private updateZone() {
    const p = this.ow.player.pos;
    const d = (x: number, z: number) => Math.hypot(p.x - x, p.z - z);
    let zone = '';
    let mix = 'town';
    if (p.y > 24 && p.z < -118) {
      zone = 'skyIsles';
      mix = 'sky';
    } else if (this.ow.world.forestness > 0.45) {
      zone = 'forest';
      mix = 'forest';
    } else if (d(84, -72) < 28) {
      zone = 'bigTop';
      mix = 'carnival';
    } else if (d(86, 4) < 44) {
      zone = 'carnival';
      mix = 'carnival';
    } else if (d(-64, 108) < 24) {
      zone = 'lighthouse';
      mix = 'docks';
    } else if (p.z > 72) {
      zone = 'docks';
      mix = 'docks';
    } else if (d(-12, -102) < 30) {
      zone = 'bluff';
      mix = 'bluff';
    } else if (d(0, 0) < 30) {
      zone = 'town';
      mix = 'town';
    }
    if (!zone) return;
    if (zone !== this.zone) {
      this.zone = zone;
      const name = ZONES[zone as keyof typeof ZONES]?.name;
      if (name && this.mode === 'play') this.hud.zoneCard(name);
      if (!this.progress.bossBeaten) this.audio.setMix(MIXES[mix] ?? {});
    }
  }

  private refreshUI() {
    if (!this.ow || !this.hud) return;
    const ctx = this.ctx();
    const o = objective(ctx);
    this.hud.setObjective(o.title, o.text, o.sub);
    this.hud.setReels(new Set(this.progress.reels));
    this.hud.setCoins(this.wallet);
    const touchMode = this.input.device === 'touch' || (this.input.isTouchDevice && this.input.device !== 'keyboard' && this.input.device !== 'gamepad');
    this.hud.setTouchMode(!!this.touch && touchMode);
    this.touch?.setVisible((this.mode === 'play' || this.mode === 'boss') && touchMode);
    for (const [id, npc] of this.ow.world.npcs) if (!id.startsWith('kid')) npc.setIndicator(indicatorFor(id, ctx));
  }

  private exitLock() {
    if (document.pointerLockElement) {
      this.lockedByUs = true;
      this.input.exitLock();
    }
  }

  private async openPause(): Promise<void> {
    if (this.screens.active || this.busy) return;
    this.exitLock();
    this.input.releaseAll();
    this.touch?.setVisible(false);
    this.save();
    const inBoss = this.mode === 'boss';
    const choice = await this.screens.pause();
    if (choice === 'map') await this.openMap();
    else if (choice === 'settings') await this.openSettings();
    else if (choice === 'controls') await this.screens.controls();
    else if (choice === 'town') {
      if (inBoss) await this.leaveBoss();
      else await this.returnToTown();
    } else if (choice === 'title') {
      if (inBoss) await this.leaveBoss(true);
      this.save();
      await this.irisTo(false, 500);
      this.hud.setPrompt(null);
      this.title();
      return;
    }
    if (choice !== 'resume' && choice !== 'town') return this.openPause();
    this.refreshUI();
  }

  private async openSettings() {
    await this.screens.settings({ ...this.settings }, (s) => {
      this.settings = s;
      this.applySettings();
    }, this.input.isTouchDevice);
  }

  private async openMap() {
    if (!this.ow || this.mode === 'boss') return;
    this.exitLock();
    const w = this.ow.world;
    const markers: MapMarker[] = [];
    for (const id of REEL_ORDER) {
      const r = w.reels.get(id);
      if (!r) continue;
      const pos = r.getWorldPosition(new Vector3());
      markers.push({ x: pos.x, z: pos.z, kind: this.progress.reels.includes(id) ? 'reel-got' : 'reel' });
    }
    const ctx = this.ctx();
    for (const [id, npc] of w.npcs) {
      if (id.startsWith('kid')) continue;
      const ind = indicatorFor(id, ctx);
      if (ind === '!') {
        const p = npc.worldPos;
        markers.push({ x: p.x, z: p.z, kind: 'npc' });
      }
    }
    const pl = this.ow.player;
    markers.push({ x: pl.pos.x, z: pl.pos.z, kind: 'player', yaw: pl.yaw });
    const canvas = this.mapView.render(markers);
    this.touch?.setVisible(false);
    await this.screens.map(canvas, REEL_ORDER.map((id) => ({ name: REEL_NAMES[id], got: this.progress.reels.includes(id) })));
    this.refreshUI();
  }

  private async returnToTown() {
    this.busy = true;
    await this.irisTo(false, 500);
    const pl = this.ow.player;
    pl.place(SPAWN.x, this.ow.terrain.heightAt(SPAWN.x, SPAWN.z), SPAWN.z, SPAWN.yaw);
    this.ow.rig.snap(pl.pos, 0);
    this.ow.rig.yaw = 0;
    await wait(150);
    this.busy = false;
    await this.irisTo(true, 600);
  }

  // ------------------------------------------------------------------ boss
  private async startBoss() {
    if (this.boss) return;
    this.busy = true;
    this.mode = 'cutscene';
    this.hud.setPrompt(null);
    this.audio.sfx('slide');
    await this.irisTo(false, 700);
    this.busy = false;
    this.beginBossFight();
    await this.irisTo(true, 700);
    await bigCard(this.ui, 'HERE COMES TROUBLE!', 'Baron Von Blackout', 'cream', 1500);
  }

  private beginBossFight() {
    this.boss?.dispose();
    const hooks = this.playerHooks();
    this.boss = new BossArena(this.renderer, {
      ...hooks,
      card: (word, sub = '', color = '', ms = 1200) => bigCard(this.ui, word, sub, color, ms),
      phase: (n) => {
        this.audio.setTempoScale(n === 2 ? 1.08 : 1);
        this.hud.toast(n === 1 ? '<b>The Baron is fuming!</b> Watch for lightning.' : '<b>Thunderhead!</b> Mind his hat and the slams.');
      },
    }, { extraHeart: this.progress.shop.heart, twin: this.progress.shop.twin });
    this.boss.player.model.setBowTie(this.progress.shop.bowtie);
    this.boss.rig.setAspect(this.renderer.aspect);
    this.renderer.onResize((w, h) => this.boss?.rig.setAspect(w / h));
    this.boss.setHaze();
    this.applySettings();
    this.progress.bossAttempts++;
    this.audio.setTempoScale(1);
    this.audio.play('hot');
    this.hud.setVisible(false);
    this.bossHud.show(true);
    this.mode = 'boss';
    this.refreshUI();
    this.touch?.setSuper(true, false);
  }

  private updateBoss(dt: number) {
    const b = this.boss!;
    const input = this.input;
    if (this.screens.active) {
      this.screens.handleInput(input);
      this.renderer.render(b.scene, b.rig.camera, this.t, 0);
      return;
    }
    if (input.pressed('pause') && !this.busy) return void this.openPause();
    const res = b.update(dt, this.t, input);
    this.bossHud.update(b.hearts, b.hpFrac, b.superCharge);
    this.touch?.setSuper(true, b.superCharge >= 5);
    this.renderer.render(b.scene, b.rig.camera, this.t, dt);
    if (res === 'lose') this.bossLost();
    if (res === 'win') this.bossWon();
  }

  private async bossLost() {
    const b = this.boss!;
    this.progress.stats.deaths++;
    this.progress.stats.hits += b.hitsTaken;
    this.audio.sfx('hurt');
    this.exitLock();
    this.touch?.setVisible(false);
    await bigCard(this.ui, 'WIPED OUT!', '', 'red', 1200);
    const tip = bossTips[Math.floor(Math.random() * bossTips.length)];
    const choice = await this.screens.death(b.progress, PHASE_MARKS, tip);
    if (choice === 'retry') {
      await this.irisTo(false, 400);
      this.beginBossFight();
      await this.irisTo(true, 500);
      bigCard(this.ui, 'ROUND TWO!', '', 'cream', 1000);
    } else await this.leaveBoss();
  }

  private async leaveBoss(silent = false) {
    if (!this.boss) return;
    if (!silent) await this.irisTo(false, 500);
    this.boss.dispose();
    this.boss = null;
    this.bossHud.show(false);
    this.audio.setTempoScale(1);
    this.audio.play('rag');
    this.mode = 'play';
    const pl = this.ow.player;
    pl.place(76, this.ow.terrain.heightAt(76, -50), -50, Math.PI);
    this.ow.rig.snap(pl.pos, 0);
    this.ow.rig.yaw = 0;
    this.hud.setVisible(true);
    this.zone = '';
    this.refreshUI();
    if (!silent) await this.irisTo(true, 600);
  }

  private async bossWon() {
    const b = this.boss!;
    const p = this.progress;
    p.bossBeaten = true;
    p.stats.bossTime = b.time;
    p.stats.hits += b.hitsTaken;
    this.save();
    this.exitLock();
    this.mode = 'cutscene';
    await this.irisTo(false, 900);
    b.dispose();
    this.boss = null;
    this.bossHud.show(false);
    this.audio.setTempoScale(1);
    this.audio.play('waltz');
    this.setNight(true);
    this.ow.world.openBigTop();
    const pl = this.ow.player;
    pl.place(84, this.ow.terrain.heightAt(84, -52), -52, Math.PI);
    pl.celebrate = true;
    this.ow.rig.snap(pl.pos, 0);
    this.ow.rig.yaw = 0.2;
    this.ow.rig.pitch = 0.18;
    this.ow.rig.targetDistance = this.ow.rig.distance = 14;
    this.mode = 'cutscene';
    for (let i = 0; i < 6; i++) this.launchFirework();
    await this.irisTo(true, 1200);
    await wait(1800);
    await bigCard(this.ui, 'THE END', 'or is it just the intermission?', 'cream', 2400);
    pl.celebrate = false;
    await this.screens.story(
      'The Show Goes On!',
      [
        'With the Baron blown clear out to sea, the Big Top curtains swung open and the Grand Picture Show finally rolled, all five reels of it.',
        'The islanders laughed, the projector purred, and somewhere far off a small, damp cloud learned a lesson about sharing the spotlight.',
      ],
      'See my results',
    );
    const s = p.stats;
    const total = this.ow.world.tokens.total;
    const mins = Math.floor(s.time / 60);
    const grade = this.grade();
    const choice = await this.screens.results(
      [
        ['Play time', `${mins}m ${Math.floor(s.time % 60)}s`],
        ['Boss time', `${Math.floor(s.bossTime / 60)}m ${Math.floor(s.bossTime % 60)}s`],
        ['Tokens found', `${p.tokens.length} / ${total}`],
        ['Hits taken', String(s.hits)],
        ['Boss attempts', String(p.bossAttempts)],
        ['Splashdowns', String(s.falls)],
      ],
      grade,
      'Your Picture Show',
    );
    this.ow.rig.targetDistance = 7.8;
    if (choice === 'title') {
      await this.irisTo(false, 500);
      this.title();
    } else {
      this.mode = 'play';
      this.hud.setVisible(true);
      this.refreshUI();
    }
  }

  private grade() {
    const p = this.progress;
    let score = 0;
    score += Math.min(40, (p.tokens.length / Math.max(1, this.ow.world.tokens.total)) * 40);
    score += Math.max(0, 30 - p.stats.hits * 4);
    score += Math.max(0, 20 - (p.bossAttempts - 1) * 5);
    score += p.stats.bossTime < 150 ? 10 : p.stats.bossTime < 240 ? 5 : 0;
    return score >= 88 ? 'S' : score >= 75 ? 'A+' : score >= 62 ? 'A' : score >= 48 ? 'B' : score >= 35 ? 'C' : 'D';
  }

  // ------------------------------------------------------------------ night & fireworks
  private setNight(on: boolean) {
    const ow = this.ow;
    if (on) {
      ow.applySky(SKY_PRESETS.night);
      this.baseHemi = SKY_PRESETS.night.hemiIntensity;
      this.baseSun = SKY_PRESETS.night.sunIntensity;
      this.renderer.haze.copy(this.nightHaze);
      ow.world.openBigTop();
      for (const l of ow.world.lanterns) l.light(true);
    }
  }

  private fireworks(dt: number) {
    this.fireworksT -= dt;
    if (this.fireworksT <= 0) {
      this.fireworksT = 0.6 + Math.random() * 1.4;
      this.launchFirework();
    }
  }

  private launchFirework() {
    const p = this.ow.player.pos;
    const a = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * 40;
    const pos = new Vector3(p.x + Math.cos(a) * d, 28 + Math.random() * 22, p.z + Math.sin(a) * d);
    const cols = [PAL.red, PAL.gold, PAL.teal, PAL.pink, 0xffffff, PAL.purple];
    const c = cols[Math.floor(Math.random() * cols.length)];
    setTimeout(() => {
      this.ow.fx.burst('star', pos, 22, 14, { color: c, up: 0, grav: 4, drag: 1.2, life: 1.4 });
      this.ow.fx.burst('spark', pos, 30, 18, { color: c, up: 0, grav: 3, drag: 1.5, life: 1.2 });
      this.audio.sfx('pop', { pitch: 0.5, vol: 0.5 });
      if (Math.random() < 0.5) this.audio.sfx('thunder', { vol: 0.15, pitch: 1.6 });
    }, 500);
    for (let i = 0; i < 6; i++) {
      const tpos = pos.clone().setY(pos.y - (6 - i) * 4);
      setTimeout(() => this.ow.fx.emit('spark', tpos, new Vector3(0, 6, 0), { color: 0xffe08a, size: 0.25, life: 0.4 }), i * 70);
    }
  }

  /** Testing helper: jump the player somewhere and frame the camera. */
  debugTp(x: number, z: number, yaw = 0, pitch = 0.3, dist = 9, y?: number) {
    const pl = this.ow.player;
    const h = y ?? this.ow.terrain.heightAt(x, z);
    pl.place(x, h + 0.1, z, yaw + Math.PI);
    this.ow.rig.pitch = pitch;
    this.ow.rig.distance = this.ow.rig.targetDistance = dist;
    this.ow.rig.snap(pl.pos, yaw);
  }

  // ------------------------------------------------------------------ iris
  private irisTo(open: boolean, ms: number) {
    const el = this.iris;
    const big = Math.hypot(window.innerWidth, window.innerHeight) * 1.1;
    return new Promise<void>((resolve) => {
      if (open) this.blackout.hidden = true;
      const from = open ? 0 : big;
      const to = open ? big : 0;
      const t0 = performance.now();
      if (!open) this.audio.sfx('slidedown', { vol: 0.25 });
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        const e = open ? 1 - Math.pow(1 - k, 3) : k * k;
        const r = from + (to - from) * e;
        el.style.width = el.style.height = `${r}px`;
        if (k < 1) requestAnimationFrame(step);
        else {
          if (open) el.style.width = el.style.height = `${big * 2}px`;
          else this.blackout.hidden = false;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }
}
