import { Group, Mesh, CircleGeometry, Vector3 } from 'three';
import { FlickModel } from './FlickModel';
import type { Input } from '../core/Input';
import type { Collider, Physics } from '../core/Physics';
import { clamp, damp, dampAngle } from '../core/math';
import { flat } from '../render/materials';

export interface PlayerHooks {
  jump(double: boolean): void;
  land(impact: number): void;
  dash(): void;
  bounce(): void;
  footstep(): void;
  fellInWater(): void;
}

const R = 0.42; // body radius
const H = 1.9; // body height

export const TUNING = {
  maxSpeed: 10.5,
  accel: 70,
  decel: 55,
  airAccel: 28,
  gravUp: 36,
  gravDown: 56,
  gravCut: 90, // extra while rising with jump released
  jumpVel: 15,
  doubleVel: 13.5,
  maxFall: 38,
  coyote: 0.12,
  buffer: 0.14,
  dashSpeed: 25,
  dashTime: 0.19,
  dashCooldown: 0.42,
};

export class Player {
  readonly root = new Group();
  readonly model = new FlickModel();
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  readonly prev = new Vector3();
  yaw = 0;
  grounded = false;
  groundC: Collider | null = null;
  frozen = false;
  canDoubleJump = true;
  canDash = true;
  shooting = false;
  celebrate = false;
  hurt = false;
  talking = false;
  glow = 0;
  /** When set, Flick turns to face this yaw (lock-on shooting). */
  faceYaw: number | null = null;
  /** Extra horizontal push (wind in the boss fight). */
  readonly externalForce = new Vector3();
  lastSafe = new Vector3();
  airTime = 0;

  private coyote = 0;
  private bufferT = 0;
  private jumps = 0;
  private jumpHeld = false;
  private bounced = false;
  private dashT = 0;
  private dashCd = 0;
  private airDashUsed = false;
  private dashDir = new Vector3();
  private spinT = 1;
  private stepAcc = 0;
  private safeT = 0;
  private wasGrounded = false;
  private fallStartY = 0;
  private shadow: Mesh;
  private n = { x: 0, z: 0 };

  constructor(private physics: Physics, private hooks: PlayerHooks) {
    this.root.add(this.model);
    this.shadow = new Mesh(new CircleGeometry(0.55, 24), flat(0x1d140f, { transparent: true, opacity: 0.35 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    (this.shadow.material as { depthWrite: boolean }).depthWrite = false;
  }

  get shadowMesh() {
    return this.shadow;
  }

  get dashing() {
    return this.dashT > 0;
  }

  get forward() {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  place(x: number, y: number, z: number, yaw: number) {
    this.pos.set(x, y, z);
    this.prev.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.lastSafe.copy(this.pos);
    this.groundC = null;
    this.dashT = 0;
    this.sync();
  }

  respawn() {
    this.place(this.lastSafe.x, this.lastSafe.y + 0.5, this.lastSafe.z, this.yaw);
  }

  update(dt: number, input: Input, camYaw: number, beat: number) {
    if (this.frozen) {
      this.vel.x = damp(this.vel.x, 0, 12, dt);
      this.vel.z = damp(this.vel.z, 0, 12, dt);
    }
    const mx = this.frozen ? 0 : input.move.x;
    const my = this.frozen ? 0 : input.move.y;
    // camera-relative wish direction
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const wx = rx * mx + fx * my;
    const wz = rz * mx + fz * my;
    const wlen = Math.min(1, Math.hypot(wx, wz));

    if (!this.frozen && input.pressed('jump')) this.bufferT = TUNING.buffer;
    this.jumpHeld = !this.frozen && input.down('jump');

    // dash
    this.dashCd -= dt;
    if (!this.frozen && this.canDash && input.pressed('dash') && this.dashCd <= 0 && !(this.airDashUsed && !this.grounded)) {
      this.dashT = TUNING.dashTime;
      this.dashCd = TUNING.dashCooldown;
      if (!this.grounded) this.airDashUsed = true;
      if (wlen > 0.2) this.dashDir.set(wx, 0, wz).normalize();
      else this.dashDir.copy(this.forward);
      this.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
      this.hooks.dash();
    }

    // horizontal control
    const hv = this.vel;
    if (this.dashT > 0) {
      this.dashT -= dt;
      hv.x = this.dashDir.x * TUNING.dashSpeed;
      hv.z = this.dashDir.z * TUNING.dashSpeed;
      hv.y = Math.max(hv.y, 0) * 0.5;
      if (this.dashT <= 0) {
        hv.x *= 0.5;
        hv.z *= 0.5;
      }
    } else {
      const tx = wx * TUNING.maxSpeed;
      const tz = wz * TUNING.maxSpeed;
      const a = this.grounded ? (wlen > 0.05 ? TUNING.accel : TUNING.decel) : TUNING.airAccel;
      const dx = tx - hv.x;
      const dz = tz - hv.z;
      const dl = Math.hypot(dx, dz);
      const stepA = a * dt;
      if (dl <= stepA || dl < 1e-6) {
        hv.x = tx;
        hv.z = tz;
      } else {
        hv.x += (dx / dl) * stepA;
        hv.z += (dz / dl) * stepA;
      }
      if (this.faceYaw !== null) this.yaw = dampAngle(this.yaw, this.faceYaw, 18, dt);
      else if (wlen > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), this.grounded ? 16 : 7, dt);
    }

    // jumping
    if (this.grounded) {
      this.coyote = TUNING.coyote;
      this.jumps = 0;
      this.airDashUsed = false;
      this.bounced = false;
    } else this.coyote -= dt;
    this.bufferT -= dt;
    if (this.bufferT > 0) {
      if (this.coyote > 0 && this.jumps === 0) {
        this.vel.y = TUNING.jumpVel;
        this.jumps = 1;
        this.coyote = 0;
        this.bufferT = 0;
        this.grounded = false;
        this.groundC = null;
        this.model.punch(0.5);
        this.hooks.jump(false);
      } else if (!this.grounded && this.canDoubleJump && this.jumps < 2 && this.coyote <= 0) {
        this.vel.y = TUNING.doubleVel;
        this.jumps = 2;
        this.bufferT = 0;
        this.spinT = 0;
        this.bounced = false;
        this.model.punch(0.4);
        this.hooks.jump(true);
      }
    }

    // gravity
    if (this.dashT <= 0) {
      let g = this.vel.y > 0 ? TUNING.gravUp : TUNING.gravDown;
      if (this.vel.y > 0 && !this.jumpHeld && !this.bounced) g += TUNING.gravCut;
      this.vel.y = Math.max(-TUNING.maxFall, this.vel.y - g * dt);
    }

    this.vel.x += this.externalForce.x * dt;
    this.vel.z += this.externalForce.z * dt;

    // integrate with substeps for robustness
    const steps = Math.min(8, Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt) / 0.3) || 1));
    for (let i = 0; i < steps; i++) this.step(dt / steps);

    // footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && hs > 2) {
      this.stepAcc += dt * (hs / TUNING.maxSpeed) * 5.2;
      if (this.stepAcc > 1) {
        this.stepAcc = 0;
        this.hooks.footstep();
      }
    }

    // landing feedback
    if (this.grounded && !this.wasGrounded) {
      const impact = clamp((this.fallStartY - this.pos.y) / 6, 0, 1);
      this.hooks.land(impact);
    }
    if (!this.grounded && this.wasGrounded) this.fallStartY = this.pos.y;
    if (!this.grounded) this.fallStartY = Math.max(this.fallStartY, this.pos.y);
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    this.wasGrounded = this.grounded;

    // safe spot for respawns
    this.safeT -= dt;
    if (this.grounded && (!this.groundC || !this.groundC.dynamic) && this.pos.y > 0.8 && this.safeT <= 0) {
      if (!this.groundC || !this.groundC.bounce) {
        this.lastSafe.copy(this.pos);
        this.safeT = 0.4;
      }
    }

    if (this.pos.y < -1.1) this.hooks.fellInWater();

    this.spinT = Math.min(1, this.spinT + dt / 0.38);
    this.model.update(dt, {
      speed01: hs / TUNING.maxSpeed,
      grounded: this.grounded,
      vy: this.vel.y,
      dashing: this.dashT > 0,
      spin: this.spinT,
      talking: this.talking,
      shooting: this.shooting,
      hurt: this.hurt,
      celebrate: this.celebrate,
      beat,
      glow: this.glow,
    });
    this.sync();
  }

  private step(dt: number) {
    const p = this.pos;
    this.prev.copy(p);
    if (this.groundC && this.groundC.dynamic && this.groundC.enabled) {
      this.yaw += this.physics.carry(this.groundC, p);
      this.prev.copy(p);
    }
    p.addScaledVector(this.vel, dt);

    const wasGrounded = this.grounded;
    this.grounded = false;
    let ground: Collider | null = null;
    const list = this.physics.nearby(p.x, p.z, 3).slice();
    for (const c of list) {
      const top = c.y1;
      if (this.vel.y <= 0 && this.prev.y >= top - 0.32 && p.y <= top + 0.02 && this.physics.inside(c, p.x, p.z, R * 0.55)) {
        p.y = top;
        this.vel.y = 0;
        this.grounded = true;
        ground = c;
        continue;
      }
      if (c.oneWay) continue;
      if (p.y >= top - 0.02 || p.y + H <= c.y0) continue;
      if (this.vel.y > 0 && this.prev.y + H <= c.y0 + 0.12 && this.physics.inside(c, p.x, p.z, R * 0.3)) {
        p.y = c.y0 - H;
        this.vel.y = 0;
        continue;
      }
      if (this.physics.pushOut(c, p, R, this.n)) {
        const vn = this.vel.x * this.n.x + this.vel.z * this.n.z;
        if (vn < 0) {
          this.vel.x -= vn * this.n.x;
          this.vel.z -= vn * this.n.z;
        }
      }
    }

    // terrain
    const terrain = this.physics.ground;
    const gh = terrain.heightAt(p.x, p.z);
    if (p.y <= gh) {
      // too steep to climb? slide back
      if (this.wasSteep(p.x, p.z) && gh > this.prev.y + 0.05) {
        p.x = this.prev.x;
        p.z = this.prev.z;
        this.vel.x *= 0.3;
        this.vel.z *= 0.3;
      }
      p.y = Math.max(p.y, terrain.heightAt(p.x, p.z));
      if (this.vel.y <= 0) {
        this.grounded = true;
        ground = null;
        this.vel.y = 0;
      }
    }

    // stick to the ground when walking down slopes and off small steps
    if (!this.grounded && wasGrounded && this.vel.y <= 0 && this.dashT <= 0) {
      const sup = this.physics.supportAt(p.x, p.z, p.y + 0.05, R * 0.55);
      if (p.y - sup.y < 0.5) {
        p.y = sup.y;
        this.grounded = true;
        ground = sup.c;
      }
    }

    if (this.grounded && ground && ground !== this.groundC) {
      ground.onLand?.();
      if (ground.bounce) {
        this.vel.y = ground.bounce;
        this.grounded = false;
        this.bounced = true;
        this.jumps = 1;
        this.airDashUsed = false;
        this.model.punch(0.7);
        this.hooks.bounce();
        ground = null;
      }
    }
    this.groundC = this.grounded ? ground : null;
  }

  private wasSteep(x: number, z: number) {
    return (this.physics.ground as { slopeAt?: (x: number, z: number) => number }).slopeAt?.(x, z)! > 1.35;
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    // blob shadow on whatever is below
    const sup = this.physics.supportAt(this.pos.x, this.pos.z, this.pos.y + 0.1, 0.1);
    this.shadow.position.set(this.pos.x, sup.y + 0.04, this.pos.z);
    const hgt = Math.max(0, this.pos.y - sup.y);
    const s = clamp(1 - hgt / 14, 0.35, 1);
    this.shadow.scale.setScalar(s);
  }
}
