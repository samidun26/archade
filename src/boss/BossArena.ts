import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  AdditiveBlending,
  DoubleSide,
  ConeGeometry,
} from 'three';
import { Physics } from '../core/Physics';
import { Player, type PlayerHooks } from '../player/Player';
import { CameraRig } from '../player/CameraRig';
import { Particles } from '../fx/Particles';
import { Sky, SKY_PRESETS } from '../render/Sky';
import { Baron } from './Baron';
import type { Renderer } from '../render/Renderer';
import type { Input } from '../core/Input';
import { PAL, toon } from '../render/materials';
import { canvas, tex } from '../render/textures';
import { G, m } from '../world/kit';
import { clamp, dampAngle, lerp, angleDiff } from '../core/math';
import { patchUnlit } from '../render/gbuffer';
import { FaceRig } from '../render/faces';
import type { SfxName } from '../core/Audio';

export const ARENA_R = 21;
export const BOSS_HP = 440;
export const PHASE_MARKS = [1 / 3, 2 / 3];

export interface BossHooks extends PlayerHooks {
  sfx(name: SfxName, opts?: { pitch?: number; vol?: number }): void;
  card(word: string, sub?: string, color?: '' | 'red' | 'cream', ms?: number): Promise<void>;
  phase(n: number): void;
}

interface Bolt {
  mesh: Mesh;
  vel: Vector3;
  life: number;
  dmg: number;
}
interface Drop {
  mesh: Mesh;
  marker: Mesh;
  x: number;
  z: number;
  t: number; // time until impact
  fall: number;
}
interface Wave {
  mesh: Mesh;
  x: number;
  z: number;
  r: number;
  speed: number;
  hit: boolean;
}
interface Strike {
  marker: Mesh;
  x: number;
  z: number;
  t: number;
  done: boolean;
}
interface Debris {
  obj: Object3D;
  pos: Vector3;
  vel: Vector3;
  life: number;
}
interface Puff {
  g: Group;
  pos: Vector3;
  hp: number;
  hop: number;
  vy: number;
  y: number;
  hurt: number;
}

type Attack = 'rain' | 'gust' | 'lightning' | 'puffs' | 'hat' | 'slam';

function arenaTexture() {
  const { c, g } = canvas(1024, 1024);
  const cx = 512;
  const n = 20;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#c8352b' : '#fbf0d4';
    g.beginPath();
    g.moveTo(cx, cx);
    g.arc(cx, cx, 512, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
    g.closePath();
    g.fill();
  }
  g.strokeStyle = '#1d140f';
  g.lineWidth = 10;
  for (const r of [500, 470, 140]) {
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#f2b83b';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 50 : 120;
    g.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.stroke();
  return tex(c);
}

export class BossArena {
  readonly scene = new Scene();
  readonly physics: Physics;
  readonly player: Player;
  readonly rig: CameraRig;
  readonly fx = new Particles();
  readonly sky = new Sky();
  readonly baron = new Baron();
  readonly sun: DirectionalLight;

  hp = BOSS_HP;
  hearts = 3;
  maxHearts = 3;
  superCharge = 0; // 0..5 cards
  phase = 0;
  time = 0;
  hitsTaken = 0;
  over = false;
  private intro = 2.6;
  private koT = -1;
  private iframes = 0;
  private fireCd = 0;
  private bolts: Bolt[] = [];
  private drops: Drop[] = [];
  private waves: Wave[] = [];
  private strikes: Strike[] = [];
  private debris: Debris[] = [];
  private puffs: Puff[] = [];
  private flashes: Array<{ mesh: Mesh; t: number }> = [];
  private boltGeo = new SphereGeometry(0.22, 10, 8);
  private boltMat = toon(0xfff1b3, { emissive: 0xffd36b, emissiveIntensity: 1.2, mottle: 0 });
  private attack: Attack | null = null;
  private attackT = 0;
  private attackStep = 0;
  private lastAttack: Attack | null = null;
  private gap = 2.2;
  private orbit = 0;
  private orbitDir = 1;
  private bossPos = new Vector3(0, 9, -14);
  private slamFrom = new Vector3();
  private vulnerable = 0;
  private hatPos = new Vector3();
  private hatVel = new Vector3();
  private superT = 0;
  private stormT = 0;
  private windDir = new Vector3();
  private rainAcc = 0;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private won = false;

  constructor(
    private renderer: Renderer,
    private hooks: BossHooks,
    opts: { extraHeart: boolean; twin: boolean },
  ) {
    this.twin = opts.twin;
    this.maxHearts = this.hearts = opts.extraHeart ? 4 : 3;
    this.physics = new Physics({ heightAt: (x, z) => (Math.hypot(x, z) < ARENA_R + 0.4 ? 0 : -60) });
    // invisible rail all around the edge
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      this.physics.box({ x: Math.cos(a) * (ARENA_R + 0.6), z: Math.sin(a) * (ARENA_R + 0.6), yaw: -a + Math.PI / 2, hx: 2.0, hz: 0.5, y0: -2, y1: 6, tag: 'rail' });
    }
    this.player = new Player(this.physics, hooks);
    this.player.place(0, 0, 12, Math.PI);
    this.player.glow = 0.9;
    this.rig = new CameraRig(renderer.aspect);
    this.rig.autoFollow = false;
    this.rig.distance = this.rig.targetDistance = 11;
    this.rig.pitch = 0.3;
    this.rig.snap(this.player.pos, 0);

    // lights + storm sky
    const hemi = new HemisphereLight(0xbfb6d6, 0x3a3048, 1.25);
    this.sun = new DirectionalLight(0xe8e0ff, 1.5);
    this.sun.position.set(20, 40, 18);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sky.apply(SKY_PRESETS.storm);
    this.scene.add(hemi, this.sun, this.sky, this.fx, this.player.root, this.player.shadowMesh, this.baron);

    // the arena: the Big Top's center ring hoisted into the storm
    const top = m(new CircleGeometry(ARENA_R + 0.5, 64), toon(0xffffff, { map: arenaTexture(), mottle: 0.3 }), { r: [-Math.PI / 2, 0, 0] });
    top.receiveShadow = true;
    this.scene.add(top);
    this.scene.add(m(new CylinderGeometry(ARENA_R + 0.6, ARENA_R + 0.6, 2, 64, 1, true), toon(PAL.red, { side: DoubleSide }), { p: [0, -1, 0] }));
    this.scene.add(m(new ConeGeometry(ARENA_R + 0.6, 14, 48, 1, true), toon(0x8f241d, { side: DoubleSide }), { p: [0, -9, 0], r: [Math.PI, 0, 0] }));
    this.scene.add(m(G.torus(ARENA_R + 0.6, 0.4, 10, 80), toon(PAL.gold, { gloss: true }), { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      this.scene.add(m(G.cyl(0.12, 0.12, 1.4, 6), toon(PAL.gold, { gloss: true }), { p: [Math.cos(a) * (ARENA_R + 0.6), 0.7, Math.sin(a) * (ARENA_R + 0.6)] }));
      this.scene.add(m(G.sphere(0.28, 10, 8), toon(0xfff1b3, { emissive: 0xffc35a, emissiveIntensity: 0.8 }), { p: [Math.cos(a) * (ARENA_R + 0.6), 1.5, Math.sin(a) * (ARENA_R + 0.6)], shadow: false }));
    }
    this.scene.add(m(G.torus(ARENA_R + 0.6, 0.1, 6, 80), toon(PAL.gold), { p: [0, 1.4, 0], r: [Math.PI / 2, 0, 0] }));
    // a sea of storm clouds below
    const cloudM = toon(0x4c4560, { mottle: 0.6 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const d = 34 + Math.random() * 40;
      const s = 6 + Math.random() * 8;
      this.scene.add(m(new SphereGeometry(1, 18, 12), cloudM, { p: [Math.cos(a) * d, -14 - Math.random() * 6, Math.sin(a) * d], s: [s * 1.6, s * 0.7, s * 1.3], shadow: false }));
    }
    this.baron.position.copy(this.bossPos);
  }

  private twin: boolean;

  get hpFrac() {
    return clamp(this.hp / BOSS_HP, 0, 1);
  }
  get progress() {
    return 1 - this.hpFrac;
  }

  setHaze() {
    this.renderer.haze.set(0x7c7186);
    this.renderer.hazeStart = 30;
    this.renderer.hazeDist = 120;
    this.renderer.hazeMax = 0.55;
  }

  // ------------------------------------------------------------------ player damage
  private hurt(from: Vector3) {
    if (this.iframes > 0 || this.koT >= 0 || this.superT > 0) return;
    this.hearts--;
    this.hitsTaken++;
    this.iframes = 1.7;
    const p = this.player;
    this.tmp.copy(p.pos).sub(from).setY(0).normalize();
    p.vel.x = this.tmp.x * 12;
    p.vel.z = this.tmp.z * 12;
    p.vel.y = 9;
    p.hurt = true;
    this.rig.shake = 0.9;
    this.renderer.flash = 0.4;
    this.renderer.flashColor.set(0xd2402f);
    this.hooks.sfx('hurt');
    this.fx.burst('star', this.tmp2.copy(p.pos).setY(p.pos.y + 1.5), 8, 6);
  }

  // ------------------------------------------------------------------ main update
  update(dt: number, t: number, input: Input): 'win' | 'lose' | null {
    if (this.over) return null;
    this.time += dt;
    const p = this.player;
    this.physics.beginFrame();

    // intro: the Baron swoops in
    if (this.intro > 0) {
      this.intro -= dt;
      this.bossPos.lerp(this.tmp.set(0, 9, -13), 1 - Math.exp(-dt * 2));
      if (this.intro <= 0) {
        this.hooks.card('FIGHT!', '', 'red', 900);
        this.hooks.sfx('card');
      }
    }

    // KO sequence
    if (this.koT >= 0) {
      this.koT += dt;
      this.baron.setMood('ko');
      this.baron.rotation.y += dt * 6;
      this.baron.position.y = Math.max(-6, this.baron.position.y - dt * 4);
      this.baron.scale.multiplyScalar(Math.exp(-dt * 0.9));
      if (this.koT < 2 && Math.random() < 0.4) this.fx.emit('confetti', this.tmp.copy(this.baron.position).add(new Vector3((Math.random() - 0.5) * 8, 4, (Math.random() - 0.5) * 8)), new Vector3((Math.random() - 0.5) * 6, 6, (Math.random() - 0.5) * 6), { color: [PAL.red, PAL.gold, PAL.teal, PAL.cream][Math.floor(Math.random() * 4)] });
      const k = Math.min(1, this.koT / 3);
      this.sky.blend(SKY_PRESETS.storm, SKY_PRESETS.day, k);
      this.renderer.haze.set(0x7c7186).lerp(new Color(0xf1e2bd), k);
      p.celebrate = this.koT > 1.2;
      p.faceYaw = null;
      p.shooting = false;
      p.update(dt, input, this.rig.yaw, t * 2.8);
      this.rig.lockTarget = this.baron.position;
      this.rig.update(dt, input, p.pos, p.vel, p.grounded, this.physics, p.yaw);
      this.baron.update(dt, t);
      this.fx.update(dt);
      this.sky.update(t, this.rig.camera.position);
      if (this.koT > 4.2) {
        this.over = true;
        return 'win';
      }
      return null;
    }

    // ---------------- player
    this.iframes -= dt;
    if (this.iframes < 1.2) p.hurt = false;
    p.root.visible = this.iframes > 0 ? Math.floor(this.iframes * 14) % 2 === 0 : true;
    const firing = this.intro <= 0 && input.down('fire');
    p.shooting = firing;
    const bc = this.baron.hitCenter;
    const toBoss = this.tmp.copy(bc).sub(p.pos).setY(0);
    p.faceYaw = firing ? Math.atan2(toBoss.x, toBoss.z) : null;
    // wind push
    p.externalForce.set(0, 0, 0);
    if (this.attack === 'gust' && this.attackStep === 1) p.externalForce.copy(this.windDir).multiplyScalar(26);
    p.update(dt, input, this.rig.yaw, t * 2.8);
    // the camera keeps both of you in frame
    this.rig.lockTarget = bc;
    this.rig.update(dt, input, p.pos, p.vel, p.grounded, this.physics, p.yaw);
    if (p.pos.y < -5) {
      p.place(0, 0.5, 0, p.yaw);
      this.hurt(p.pos);
    }

    // ---------------- shooting
    this.fireCd -= dt;
    if (firing && this.fireCd <= 0) {
      this.fireCd = 0.125;
      const origin = p.model.muzzle.clone();
      const aim = this.tmp2.copy(bc).add(new Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0)).sub(origin).normalize();
      // only auto-aim when the boss is roughly ahead of the camera
      const camFwd = new Vector3(-Math.sin(this.rig.yaw), 0, -Math.cos(this.rig.yaw));
      if (camFwd.dot(toBoss.clone().normalize()) < 0.2) aim.copy(p.forward).setY(0.05).normalize();
      const shots = this.twin ? [-0.25, 0.25] : [0];
      for (const off of shots) {
        const mesh = new Mesh(this.boltGeo, this.boltMat);
        const side = new Vector3(aim.z, 0, -aim.x).normalize().multiplyScalar(off);
        mesh.position.copy(origin).add(side);
        mesh.scale.set(1, 1, 2.6);
        mesh.lookAt(mesh.position.clone().add(aim));
        this.scene.add(mesh);
        this.bolts.push({ mesh, vel: aim.clone().multiplyScalar(48), life: 1.1, dmg: 1 });
      }
      this.hooks.sfx('shoot', { pitch: 0.9 + Math.random() * 0.2 });
    }
    // super: flashbulb blast
    if (this.intro <= 0 && input.pressed('super') && this.superCharge >= 5) {
      this.superCharge = 0;
      this.superT = 1.4;
      this.hooks.sfx('super');
      this.renderer.flash = 1;
      this.renderer.flashColor.set(0xfff1b3);
      this.rig.shake = 1;
      this.damage(34, true);
      this.fx.burst('star', p.pos.clone().setY(1.5), 30, 14);
      this.fx.burst('spark', bc, 40, 16);
      // clear hazards
      for (const d of this.drops) d.t = Math.min(d.t, 0.01);
      for (const pf of this.puffs) pf.hp = 0;
    }
    this.superT -= dt;
    p.glow = 0.9 + (this.superT > 0 ? 1 : 0);

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      let hit = false;
      if (b.mesh.position.distanceTo(bc) < 4.4) {
        hit = true;
        this.damage(b.dmg * (this.vulnerable > 0 ? 1.5 : 1));
      }
      for (const pf of this.puffs)
        if (!hit && pf.hp > 0 && b.mesh.position.distanceTo(pf.pos.clone().setY(pf.y + 1)) < 1.6) {
          hit = true;
          pf.hp--;
          pf.hurt = 0.1;
          this.superCharge = Math.min(5, this.superCharge + 0.05);
          this.hooks.sfx('hit');
        }
      if (hit) this.fx.burst('spark', b.mesh.position, 3, 4);
      if (hit || b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }

    // ---------------- boss brain
    if (this.intro <= 0) this.think(dt, t);
    this.baron.position.lerp(this.bossPos, 1 - Math.exp(-dt * (this.attack === 'slam' ? 9 : 3)));
    const toP = Math.atan2(p.pos.x - this.baron.position.x, p.pos.z - this.baron.position.z);
    this.baron.rotation.y = dampAngle(this.baron.rotation.y, toP, 3, dt);
    this.baron.update(dt, t);
    this.vulnerable -= dt;
    // body contact
    if (bc.distanceTo(p.pos.clone().setY(p.pos.y + 1)) < 4.3) this.hurt(bc);

    this.updateHazards(dt, t);
    this.storm(dt, t);
    this.fx.update(dt);
    this.sky.update(t, this.rig.camera.position);
    this.sun.position.set(p.pos.x + 20, 40, p.pos.z + 18);
    this.sun.target.position.copy(p.pos);
    this.sun.target.updateMatrixWorld();

    if (this.hearts <= 0) {
      this.over = true;
      p.root.visible = true;
      return 'lose';
    }
    return null;
  }

  private damage(n: number, big = false) {
    if (this.koT >= 0) return;
    this.hp -= n;
    this.baron.flash();
    this.superCharge = Math.min(5, this.superCharge + n * 0.025);
    if (big || Math.random() < 0.15) this.hooks.sfx('boss-hit');
    const newPhase = this.hp <= BOSS_HP * PHASE_MARKS[0] ? 2 : this.hp <= BOSS_HP * PHASE_MARKS[1] ? 1 : 0;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.baron.setPhase(newPhase);
      this.hooks.phase(newPhase);
      this.renderer.flash = 0.6;
      this.renderer.flashColor.set(0xffffff);
      this.rig.shake = 1;
      this.hooks.sfx('thunder');
      this.endAttack();
      this.gap = 1.8;
      this.baron.setMood('furious');
    }
    if (this.hp <= 0 && !this.won) {
      this.won = true;
      this.koT = 0;
      this.endAttack();
      this.clearHazards();
      this.hooks.sfx('knockout');
      this.hooks.card('KNOCKOUT!', 'The Baron is blown away!', '', 2600);
      this.renderer.flash = 1;
      this.renderer.flashColor.set(0xffffff);
      this.rig.shake = 1.2;
    }
  }

  private endAttack() {
    this.attack = null;
    this.attackT = 0;
    this.attackStep = 0;
    this.baron.puffAmount = 0;
    if (!this.baron.hatAttached) this.returnHat();
  }

  private pick(): Attack {
    const pools: Attack[][] = [
      ['rain', 'gust', 'rain', 'gust'],
      ['lightning', 'rain', 'puffs', 'gust', 'lightning'],
      ['hat', 'slam', 'lightning', 'puffs', 'slam', 'gust'],
    ];
    const pool = pools[this.phase].filter((a) => a !== this.lastAttack);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private think(dt: number, t: number) {
    const p = this.player;
    // glide around the ring between attacks
    if (!this.attack || this.attack === 'rain' || this.attack === 'puffs' || this.attack === 'lightning') {
      this.orbit += dt * 0.22 * this.orbitDir * (1 + this.phase * 0.3);
      const r = 15;
      this.bossPos.set(Math.sin(this.orbit) * r, 8.5 + Math.sin(t * 1.4) * 1.0, Math.cos(this.orbit) * r - 0);
      // keep the baron on the far side from the player-ish
      const pa = Math.atan2(p.pos.x, p.pos.z);
      if (Math.abs(angleDiff(this.orbit, pa)) < 1.0) this.orbitDir *= -1;
    }
    if (!this.attack) {
      this.baron.setMood(this.phase === 0 ? 'smug' : this.phase === 1 ? 'angry' : 'furious');
      this.gap -= dt;
      if (this.gap <= 0) {
        this.attack = this.pick();
        this.lastAttack = this.attack;
        this.attackT = 0;
        this.attackStep = 0;
      }
      return;
    }
    this.attackT += dt;
    const at = this.attackT;
    const sp = 1 + this.phase * 0.18; // later phases are snappier
    switch (this.attack) {
      case 'rain': {
        const volleys = 3 + this.phase;
        const every = 1.0 / sp;
        if (at > this.attackStep * every && this.attackStep < volleys) {
          this.attackStep++;
          const n = 6 + this.phase * 2;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * (ARENA_R - 1.5);
            this.spawnDrop(Math.cos(a) * d, Math.sin(a) * d, 0.95);
          }
          this.spawnDrop(p.pos.x + p.vel.x * 0.5, p.pos.z + p.vel.z * 0.5, 0.95);
        }
        if (at > volleys * every + 1.2) this.finish(1.4);
        break;
      }
      case 'gust': {
        if (this.attackStep === 0) {
          this.baron.setMood('puff');
          this.baron.puffAmount = Math.min(1, at / 1.0);
          if (at > 1.1) {
            this.attackStep = 1;
            this.hooks.sfx('wind');
            this.windDir.copy(p.pos).sub(this.baron.position).setY(0).normalize();
          }
        } else if (this.attackStep === 1) {
          this.baron.puffAmount = Math.max(0, 1 - (at - 1.1) * 0.5);
          // debris: top hats & umbrellas tumble across the stage at ankle height
          if (Math.random() < dt * (3 + this.phase)) {
            const side = new Vector3(this.windDir.z, 0, -this.windDir.x).multiplyScalar((Math.random() - 0.5) * 30);
            const start = this.baron.position.clone().setY(0.9).add(side).addScaledVector(this.windDir, 2);
            this.spawnDebris(start, this.windDir.clone().multiplyScalar(14 + this.phase * 3));
          }
          for (let k = 0; k < 3; k++) {
            const pos = new Vector3((Math.random() - 0.5) * 40, 0.5 + Math.random() * 4, (Math.random() - 0.5) * 40);
            this.fx.emit('puff', pos, this.windDir.clone().multiplyScalar(18), { size: 0.25, life: 0.6, color: 0xd9d4e6, grav: 0, drag: 0 });
          }
          if (at > 3.8) this.finish(1.2);
        }
        break;
      }
      case 'lightning': {
        const n = 3 + this.phase;
        const every = 0.85 / sp;
        if (at > this.attackStep * every && this.attackStep < n) {
          this.attackStep++;
          this.baron.setMood('furious');
          const lead = 0.45;
          this.spawnStrike(clamp(p.pos.x + p.vel.x * lead, -ARENA_R, ARENA_R), clamp(p.pos.z + p.vel.z * lead, -ARENA_R, ARENA_R), 0.85 / sp);
        }
        if (at > n * every + 1.4) this.finish(1.3);
        break;
      }
      case 'puffs': {
        if (this.attackStep === 0) {
          this.attackStep = 1;
          const n = 2 + this.phase;
          for (let i = 0; i < n; i++) this.spawnPuff(this.baron.position.clone().add(new Vector3((i - n / 2) * 3, -3, 0)));
          this.hooks.sfx('pop');
        }
        if (at > 2.5) this.finish(1.0);
        break;
      }
      case 'hat': {
        if (this.attackStep === 0) {
          this.attackStep = 1;
          this.baron.hatAttached = false;
          this.baron.hat.getWorldPosition(this.hatPos);
          this.baron.body.remove(this.baron.hat);
          this.scene.add(this.baron.hat);
          this.baron.hat.position.copy(this.hatPos);
          this.hatVel.set(0, 0, 0);
          this.hooks.sfx('slide');
        }
        // homing boomerang: accelerate toward the player, overshoot, swing back
        const target = this.tmp.copy(p.pos).setY(1.2);
        const acc = target.sub(this.hatPos).normalize().multiplyScalar(30 + this.phase * 6);
        this.hatVel.addScaledVector(acc, dt);
        this.hatVel.multiplyScalar(Math.exp(-dt * 0.7));
        const max = 18;
        if (this.hatVel.length() > max) this.hatVel.setLength(max);
        this.hatPos.addScaledVector(this.hatVel, dt);
        this.hatPos.y = Math.max(0.9, this.hatPos.y);
        const hat = this.baron.hat;
        hat.position.copy(this.hatPos);
        hat.rotation.y += dt * 14;
        hat.rotation.z = 0.4;
        if (this.hatPos.distanceTo(p.pos.clone().setY(p.pos.y + 1)) < 1.9) this.hurt(this.hatPos);
        if (Math.random() < 0.3) this.fx.emit('puff', this.hatPos, new Vector3(), { size: 0.3, life: 0.4, color: 0x5a5874, grav: 0 });
        if (at > 4.6) {
          this.returnHat();
          this.finish(1.0);
        }
        break;
      }
      case 'slam': {
        if (this.attackStep === 0) {
          // rise above the player's position
          this.slamFrom.copy(p.pos).setY(0);
          this.slamFrom.x = clamp(this.slamFrom.x, -12, 12);
          this.slamFrom.z = clamp(this.slamFrom.z, -12, 12);
          this.bossPos.set(this.slamFrom.x, 16, this.slamFrom.z);
          if (at > 1.3) {
            this.attackStep = 1;
            this.hooks.sfx('slidedown');
          }
          // telegraph: a growing shadow ring where he'll land
          if (!this.drops.length || this.attackT < dt * 1.5) this.spawnDrop(this.slamFrom.x, this.slamFrom.z, 1.6, 4.2, true);
        } else if (this.attackStep === 1) {
          this.bossPos.set(this.slamFrom.x, 3.6, this.slamFrom.z);
          if (this.baron.position.y < 4.4) {
            this.attackStep = 2;
            this.rig.shake = 1.1;
            this.hooks.sfx('thunder', { vol: 0.8 });
            this.spawnWave(this.slamFrom.x, this.slamFrom.z, 11);
            setTimeout(() => !this.over && this.spawnWave(this.slamFrom.x, this.slamFrom.z, 9), 450);
            this.fx.ring(new Vector3(this.slamFrom.x, 0.3, this.slamFrom.z), 18, 10, 0.9);
            this.vulnerable = 1.8;
            this.baron.setMood('hurt');
            this.attackT = 0;
          }
        } else if (at > 1.8) {
          this.finish(1.2);
        }
        break;
      }
    }
  }

  private finish(gap: number) {
    this.attack = null;
    this.baron.puffAmount = 0;
    this.gap = gap / (1 + this.phase * 0.25);
  }

  private returnHat() {
    const hat = this.baron.hat;
    this.scene.remove(hat);
    this.baron.body.add(hat);
    hat.position.copy(this.baron.hatHome);
    hat.rotation.set(0, 0, -0.15);
    this.baron.hatAttached = true;
  }

  // ------------------------------------------------------------------ hazards
  private markerMat = patchUnlit(new MeshBasicMaterial({ color: 0x1d140f, transparent: true, opacity: 0.4, depthWrite: false }), 'keep');
  private strikeMat = patchUnlit(new MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending }), 'keep');
  private dropMat = toon(0x8fb4e0, { gloss: true, emissive: 0x2a4a7a, emissiveIntensity: 0.4 });
  private waveMat = toon(0xfbf0d4, { emissive: 0xfff1b3, emissiveIntensity: 0.4, side: DoubleSide });

  private spawnDrop(x: number, z: number, warn: number, radius = 1.3, isShadow = false) {
    if (Math.hypot(x, z) > ARENA_R - 0.5) {
      const k = (ARENA_R - 0.5) / Math.hypot(x, z);
      x *= k;
      z *= k;
    }
    const marker = new Mesh(new CircleGeometry(radius, 24), this.markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.05, z);
    marker.scale.setScalar(0.2);
    marker.renderOrder = 3;
    this.scene.add(marker);
    let mesh: Mesh;
    if (isShadow) {
      mesh = new Mesh(new SphereGeometry(0.01), this.dropMat);
      mesh.visible = false;
    } else {
      mesh = new Mesh(new SphereGeometry(0.55, 14, 10), this.dropMat);
      mesh.add(m(new ConeGeometry(0.42, 0.9, 12), this.dropMat, { p: [0, 0.6, 0] }));
      mesh.position.set(x, 18, z);
      mesh.scale.set(1, 1.3, 1);
    }
    this.scene.add(mesh);
    this.drops.push({ mesh, marker, x, z, t: warn, fall: isShadow ? -1 : 18 / warn });
  }

  private spawnStrike(x: number, z: number, warn: number) {
    const marker = new Mesh(new RingGeometry(1.6, 2.4, 32), this.strikeMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.06, z);
    marker.renderOrder = 3;
    this.scene.add(marker);
    this.strikes.push({ marker, x, z, t: warn, done: false });
    this.hooks.sfx('ui', { pitch: 2 });
  }

  private spawnWave(x: number, z: number, speed: number) {
    const mesh = new Mesh(new RingGeometry(0.85, 1, 64), this.waveMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.12, z);
    this.scene.add(mesh);
    const wall = m(new CylinderGeometry(1, 1, 0.9, 64, 1, true), this.waveMat, { p: [0, 0, 0.45], r: [Math.PI / 2, 0, 0] });
    mesh.add(wall);
    this.waves.push({ mesh, x, z, r: 0.5, speed, hit: false });
  }

  private spawnDebris(pos: Vector3, vel: Vector3) {
    const g = new Group();
    const kind = Math.random();
    if (kind < 0.5) {
      g.add(m(new CylinderGeometry(0.5, 0.55, 0.8, 14), toon(0x1f1a24, { gloss: true }), { p: [0, 0.4, 0] }));
      g.add(m(new CylinderGeometry(0.9, 0.9, 0.08, 16), toon(0x1f1a24), { p: [0, 0.02, 0] }));
    } else {
      g.add(m(new ConeGeometry(0.9, 0.6, 10, 1, true), toon(kind < 0.75 ? PAL.red : PAL.teal, { side: DoubleSide }), { p: [0, 0.5, 0] }));
      g.add(m(G.cyl(0.04, 0.04, 1.2, 4), toon(0x3a2e28), { p: [0, -0.1, 0] }));
    }
    g.position.copy(pos);
    this.scene.add(g);
    this.debris.push({ obj: g, pos: pos.clone(), vel, life: 4 });
  }

  private spawnPuff(pos: Vector3) {
    const g = new Group();
    const dark = toon(0x4c4560, { mottle: 0.4 });
    for (const [x, y, z, r] of [
      [0, 0.8, 0, 0.8],
      [-0.6, 0.6, -0.1, 0.55],
      [0.6, 0.65, -0.1, 0.6],
    ])
      g.add(m(new SphereGeometry(r, 14, 10), dark, { p: [x, y, z] }));
    const face = new FaceRig('decal', { eyes: 'angry', mouth: 'teeth', brows: 'angry' });
    const fp = new Mesh(new CircleGeometry(0.6, 20), toon(0xffffff, { map: face.texture, alphaTest: 0.5, mottle: 0, key: 'puffface' }));
    fp.position.set(0, 0.85, 0.78);
    g.add(fp);
    g.position.copy(pos);
    this.scene.add(g);
    this.puffs.push({ g, pos: pos.clone(), hp: 3, hop: Math.random(), vy: 0, y: pos.y, hurt: 0 });
  }

  private flashBolt(x: number, z: number) {
    const g = new Group();
    let px = x;
    let pz = z;
    let py = 30;
    const mat = toon(0xfff6c8, { emissive: 0xfff1b3, emissiveIntensity: 1.6, mottle: 0 });
    while (py > 0) {
      const nx = x + (Math.random() - 0.5) * 2.4;
      const nz = z + (Math.random() - 0.5) * 2.4;
      const ny = Math.max(0, py - 3 - Math.random() * 3);
      const a = new Vector3(px, py, pz);
      const b = new Vector3(nx, ny, nz);
      const seg = m(G.box(0.35, 0.35, 1), mat, { shadow: false });
      seg.position.copy(a).lerp(b, 0.5);
      seg.scale.z = a.distanceTo(b);
      seg.lookAt(b);
      g.add(seg);
      px = nx;
      pz = nz;
      py = ny;
    }
    this.scene.add(g);
    this.flashes.push({ mesh: g as unknown as Mesh, t: 0.22 });
  }

  private updateHazards(dt: number, t: number) {
    const p = this.player;
    // raindrops & slam shadows
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t -= dt;
      const grow = clamp(1 - d.t / 1.0, 0.2, 1);
      d.marker.scale.setScalar(grow);
      if (d.fall > 0) {
        d.mesh.position.y = Math.max(0.3, d.t * d.fall);
      }
      if (d.t <= 0) {
        if (d.fall > 0) {
          if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 1.5 && p.pos.y < 1.6) this.hurt(new Vector3(d.x, 0, d.z));
          this.fx.burst('splash', new Vector3(d.x, 0.3, d.z), 8, 5, { color: 0xbcd4f0 });
          if (Math.random() < 0.3) this.hooks.sfx('drop', { vol: 0.4, pitch: 0.8 + Math.random() * 0.4 });
        }
        this.scene.remove(d.mesh, d.marker);
        this.drops.splice(i, 1);
      }
    }
    // lightning
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      s.marker.rotation.z += dt * 6;
      const k = 1 + Math.sin(t * 40) * 0.08;
      s.marker.scale.setScalar(k);
      if (s.t <= 0 && !s.done) {
        s.done = true;
        this.flashBolt(s.x, s.z);
        this.renderer.flash = 0.45;
        this.renderer.flashColor.set(0xfff6c8);
        this.hooks.sfx('thunder', { vol: 0.7 });
        if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 2.4 && p.pos.y < 3) this.hurt(new Vector3(s.x, 0, s.z));
        if (this.phase >= 1) this.spawnWave(s.x, s.z, 8);
        this.fx.burst('spark', new Vector3(s.x, 0.5, s.z), 18, 10);
        this.scene.remove(s.marker);
        this.strikes.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt;
      f.mesh.visible = Math.floor(f.t * 40) % 2 === 0;
      if (f.t <= 0) {
        this.scene.remove(f.mesh);
        this.flashes.splice(i, 1);
      }
    }
    // shockwaves: jump over them!
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.speed * dt;
      w.mesh.scale.setScalar(w.r);
      const d = Math.hypot(p.pos.x - w.x, p.pos.z - w.z);
      if (!w.hit && Math.abs(d - w.r) < 0.7 && p.pos.y < 0.85) {
        w.hit = true;
        this.hurt(new Vector3(w.x, 0, w.z));
      }
      if (w.r > ARENA_R * 2.2) {
        this.scene.remove(w.mesh);
        this.waves.splice(i, 1);
      }
    }
    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.pos.addScaledVector(d.vel, dt);
      d.obj.position.copy(d.pos);
      d.obj.position.y = 0.6 + Math.abs(Math.sin(d.life * 7)) * 0.6;
      d.obj.rotation.x += dt * 9;
      d.obj.rotation.y += dt * 5;
      if (d.obj.position.distanceTo(p.pos.clone().setY(p.pos.y + 0.6)) < 1.2) this.hurt(d.obj.position);
      if (d.life <= 0 || Math.hypot(d.pos.x, d.pos.z) > ARENA_R + 6) {
        this.scene.remove(d.obj);
        this.debris.splice(i, 1);
      }
    }
    // puff minions hop after you
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const pf = this.puffs[i];
      pf.hurt -= dt;
      if (pf.hp <= 0) {
        this.fx.burst('puff', pf.g.position.clone().setY(pf.y + 0.8), 10, 4, { color: 0x6b6a86 });
        this.fx.burst('star', pf.g.position.clone().setY(pf.y + 1), 4, 5);
        this.hooks.sfx('pop');
        this.superCharge = Math.min(5, this.superCharge + 0.3);
        this.scene.remove(pf.g);
        this.puffs.splice(i, 1);
        continue;
      }
      pf.vy -= 30 * dt;
      pf.y += pf.vy * dt;
      if (pf.y <= 0) {
        pf.y = 0;
        pf.vy = 8 + Math.random() * 3;
        const dir = p.pos.clone().sub(pf.pos).setY(0);
        if (dir.length() > 0.1) dir.setLength(Math.min(3.2, dir.length()));
        pf.pos.add(dir);
        pf.pos.setLength(Math.min(pf.pos.length(), ARENA_R - 1));
      }
      pf.g.position.set(lerp(pf.g.position.x, pf.pos.x, 1 - Math.exp(-dt * 4)), pf.y, lerp(pf.g.position.z, pf.pos.z, 1 - Math.exp(-dt * 4)));
      pf.g.rotation.y = Math.atan2(p.pos.x - pf.g.position.x, p.pos.z - pf.g.position.z);
      const sq = pf.y < 0.2 ? 0.75 : 1.1;
      pf.g.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      if (pf.g.position.distanceTo(p.pos) < 1.4) this.hurt(pf.g.position);
    }
  }

  private clearHazards() {
    for (const d of this.drops) this.scene.remove(d.mesh, d.marker);
    for (const s of this.strikes) this.scene.remove(s.marker);
    for (const w of this.waves) this.scene.remove(w.mesh);
    for (const d of this.debris) this.scene.remove(d.obj);
    for (const pf of this.puffs) this.scene.remove(pf.g);
    for (const b of this.bolts) this.scene.remove(b.mesh);
    this.drops = [];
    this.strikes = [];
    this.waves = [];
    this.debris = [];
    this.puffs = [];
    this.bolts = [];
  }

  /** Ambient storm: random distant flashes and drizzle. */
  private storm(dt: number, t: number) {
    this.stormT -= dt;
    if (this.stormT <= 0) {
      this.stormT = 3 + Math.random() * 5;
      this.renderer.flash = Math.max(this.renderer.flash, 0.18);
      this.renderer.flashColor.set(0xe8e0ff);
      this.hooks.sfx('thunder', { vol: 0.35, pitch: 0.7 });
    }
    this.rainAcc += dt * (40 + this.phase * 30);
    const c = this.rig.camera.position;
    while (this.rainAcc > 1) {
      this.rainAcc -= 1;
      const pos = new Vector3(c.x + (Math.random() - 0.5) * 40, c.y + 10 + Math.random() * 6, c.z + (Math.random() - 0.5) * 40);
      this.fx.emit('rain', pos, new Vector3(0, -34, 0), { size: 0.09, life: 0.7, stretch: 8 });
    }
    // phase 3: occasional stray drops anywhere
    if (this.phase === 2 && !this.attack && Math.random() < dt * 1.5) {
      const a = Math.random() * Math.PI * 2;
      this.spawnDrop(Math.cos(a) * Math.random() * 18, Math.sin(a) * Math.random() * 18, 1.0);
    }
    void t;
  }

  dispose() {
    this.clearHazards();
  }
}

export const bossTips = [
  'Hold fire and keep moving. The Baron telegraphs every attack: dark circles mean rain.',
  'Yellow rings mean lightning. Keep running and it will strike behind you.',
  'Shockwaves roll along the stage. Jump right over them!',
  `Fill all five super cards, then unleash a Flashbulb Blast to clear the stage.`,
  'When he slams down he is dizzy for a moment. Pour it on!',
  'Penny sells an Extra Heart and Twin Bolts back in town. Tokens well spent!',
];

