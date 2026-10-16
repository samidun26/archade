import { Group, Vector3 } from 'three';
import type { Physics } from '../core/Physics';
import type { Terrain } from './Terrain';
import { Lantern, Reel, Tokens } from './Collectibles';
import type { NPC } from '../npc/NPC';
import { bakeDeep, bakeStatic, updateLiving } from './kit';
import type { Particles } from '../fx/Particles';
import { buildTown } from './zones/town';
import { buildDocks } from './zones/docks';
import { buildCarnival } from './zones/carnival';
import { buildForest } from './zones/forest';
import { buildBluff } from './zones/bluff';
import { buildScenery } from './zones/scenery';

export interface Interactable {
  id: string;
  pos: Vector3;
  radius: number;
  label: () => string;
  enabled: () => boolean;
  act: () => void;
  /** Optional vertical window relative to pos.y */
  yRange?: [number, number];
}

export type WorldEvent =
  | { type: 'lamp-lit' }
  | { type: 'lantern-lit'; id: string; count: number }
  | { type: 'kid-found'; id: string; count: number }
  | { type: 'bell-rung'; first: boolean }
  | { type: 'balloon-ride' }
  | { type: 'sfx'; name: string; pos?: Vector3 };

export type Updater = (dt: number, t: number, beat: number, player: Vector3) => void;

export interface KernelKidRef {
  id: string;
  npc: NPC;
  found: boolean;
  home: Vector3;
  hopT: number;
  from: Vector3;
}

export class World {
  readonly root = new Group();
  readonly tokens = new Tokens();
  readonly reels = new Map<string, Reel>();
  readonly lanterns: Lantern[] = [];
  readonly npcs = new Map<string, NPC>();
  readonly kids: KernelKidRef[] = [];
  readonly updaters: Updater[] = [];
  readonly interactables: Interactable[] = [];
  readonly listeners: Array<(e: WorldEvent) => void> = [];
  /** Named points of interest (for the map and quest markers). */
  readonly pois = new Map<string, Vector3>();
  lighthouseLit = false;
  /** Set by zones so saved progress can re-apply visual state. */
  restoreLamp: () => void = () => {};
  restoreBell: () => void = () => {};
  openBigTop: () => void = () => {};
  carouselSeat: Group | null = null;
  bellRung = false;
  /** 0..1 how deep inside the forest the player is (drives darkness + glow). */
  forestness = 0;

  constructor(
    readonly physics: Physics,
    readonly terrain: Terrain,
    readonly fx: Particles,
  ) {
    buildTown(this);
    buildDocks(this);
    buildCarnival(this);
    buildForest(this);
    buildBluff(this);
    buildScenery(this);
    bakeStatic(this.root);
    for (const c of this.root.children) if (c.userData.dynamic) bakeDeep(c);
    this.tokens.build();
    this.root.add(this.tokens);
    for (const r of this.reels.values()) this.root.add(r);
  }

  emit(e: WorldEvent) {
    for (const l of this.listeners) l(e);
  }
  on(fn: (e: WorldEvent) => void) {
    this.listeners.push(fn);
  }

  get ctx() {
    return { physics: this.physics, terrain: this.terrain, root: this.root };
  }

  heightAt(x: number, z: number) {
    return this.terrain.heightAt(x, z);
  }

  update(dt: number, t: number, beat: number, player: Vector3) {
    updateLiving(beat);
    for (const u of this.updaters) u(dt, t, beat, player);
    for (const r of this.reels.values()) r.update(dt, t);
    for (const l of this.lanterns) l.update(dt, t);
    for (const n of this.npcs.values()) if (n.visible) n.update(dt, t, beat, player);
    const fd = Math.hypot(player.x + 86, player.z + 12);
    this.forestness = 1 - Math.min(1, Math.max(0, (fd - 22) / 26));
  }
}
