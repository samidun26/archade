import { PerspectiveCamera, Vector3 } from 'three';
import type { Input } from '../core/Input';
import type { Physics } from '../core/Physics';
import { angleDiff, clamp, damp, dampAngle as dampAngleLocal, lerp } from '../core/math';

export class CameraRig {
  readonly camera: PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0.32;
  distance = 7.8;
  targetDistance = 7.8;
  autoFollow = true;
  /** When set, the camera frames this point too (boss fights, NPC chats). */
  focus: Vector3 | null = null;
  focusWeight = 0;
  shake = 0;
  /** Boss-fight lock-on: keep the player in front and this point framed beyond. */
  lockTarget: Vector3 | null = null;
  private lockOffset = 0;
  baseFov = 62;
  fovKick = 0;

  private target = new Vector3();
  private smoothTarget = new Vector3();
  private groundRefY = 0;
  private idleLook = 10;
  private tmp = new Vector3();
  private dir = new Vector3();
  private shakeT = 0;
  private curDist = 9;

  constructor(aspect: number) {
    this.camera = new PerspectiveCamera(62, aspect, 0.3, 900);
  }

  private lockLook = new Vector3();
  private updateLock(dt: number, input: Input, p: Vector3, physics: Physics) {
    const t = this.lockTarget!;
    const sens = 0.0042 * input.sensitivity;
    // the player can nudge the framing left/right, it springs back
    this.lockOffset = Math.max(-0.9, Math.min(0.9, this.lockOffset - input.lookX * sens));
    if (Math.abs(input.lookX) < 0.5) this.lockOffset = damp(this.lockOffset, 0, 1.5, dt);
    const want = Math.atan2(p.x - t.x, p.z - t.z) + this.lockOffset;
    this.yaw = dampAngleLocal(this.yaw, want, 3.2, dt);
    this.pitch = damp(this.pitch, 0.34, 3, dt);
    const dist = this.distance;
    const anchor = this.tmp.set(p.x, p.y + 1.6, p.z);
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    const hit = physics.raycast(anchor, this.dir, dist + 0.4);
    const d = Math.max(2.5, Math.min(dist, hit - 0.4));
    this.curDist = damp(this.curDist, d, 8, dt);
    const cam = this.camera;
    const desired = anchor.clone().addScaledVector(this.dir, this.curDist);
    desired.y += 1.2;
    cam.position.lerp(desired, 1 - Math.exp(-dt * 8));
    // look between the player and the target, biased to the player so they stay in frame
    const look = this.smoothTarget.copy(p).setY(p.y + 1.4).lerp(t, 0.32);
    this.lockLook.lerp(look, 1 - Math.exp(-dt * 6));
    if (this.shake > 0) {
      this.shakeT += dt * 40;
      const s = this.shake * this.shake * 0.5;
      cam.position.x += Math.sin(this.shakeT * 1.3) * s;
      cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.lockLook);
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const fov = this.baseFov + 4 + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  setAspect(a: number) {
    this.camera.aspect = a;
    // portrait phones see a little more around them
    this.baseFov = a < 1 ? 72 : 62;
    this.camera.updateProjectionMatrix();
  }

  snap(pos: Vector3, yaw: number) {
    this.yaw = yaw;
    this.target.copy(pos);
    this.smoothTarget.copy(pos);
    this.groundRefY = pos.y;
    this.curDist = this.distance;
    this.lockLook.copy(pos);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(pos.x + Math.sin(yaw) * cp * this.distance, pos.y + 1.7 + Math.sin(this.pitch) * this.distance, pos.z + Math.cos(yaw) * cp * this.distance);
  }

  update(
    dt: number,
    input: Input,
    playerPos: Vector3,
    playerVel: Vector3,
    grounded: boolean,
    physics: Physics,
    playerYaw: number,
  ) {
    // ---- look input
    const sens = 0.0042 * input.sensitivity;
    const lx = input.lookX;
    const ly = input.lookY * (input.invertY ? -1 : 1);
    if (Math.abs(lx) + Math.abs(ly) > 0.01) this.idleLook = 0;
    else this.idleLook += dt;
    this.yaw -= lx * sens;
    this.pitch = clamp(this.pitch + ly * sens, -0.25, 1.15);
    this.targetDistance = clamp(this.targetDistance + input.zoom * 6, 4.5, 16);
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    if (this.lockTarget) {
      this.updateLock(dt, input, playerPos, physics);
      return;
    }

    // ---- auto follow: drift behind the player while running
    const hs = Math.hypot(playerVel.x, playerVel.z);
    if (this.autoFollow && this.idleLook > 1.4 && hs > 3 && !this.focus) {
      const behind = Math.atan2(-playerVel.x, -playerVel.z) + Math.PI;
      const desired = behind + Math.PI;
      // only nudge if the player is running roughly away/sideways, never spin around when running at camera
      const d = angleDiff(this.yaw, desired);
      if (Math.abs(d) < 2.2) this.yaw += d * (1 - Math.exp(-0.9 * dt)) * (hs / 10);
      this.pitch = damp(this.pitch, 0.3, 0.6, dt);
    }
    void playerYaw;

    // ---- vertical framing: don't bob with every jump
    if (grounded || playerPos.y < this.groundRefY) this.groundRefY = damp(this.groundRefY, playerPos.y, grounded ? 10 : 6, dt);
    else if (playerPos.y > this.groundRefY + 5) this.groundRefY = damp(this.groundRefY, playerPos.y - 4, 4, dt);
    const ty = lerp(this.groundRefY, playerPos.y, 0.35) + 1.7;
    this.target.set(playerPos.x + playerVel.x * 0.12, ty, playerPos.z + playerVel.z * 0.12);
    if (this.focus && this.focusWeight > 0) this.target.lerp(this.tmp.copy(this.focus).setY(Math.max(ty, this.focus.y * 0.4)), this.focusWeight * 0.35);
    this.smoothTarget.x = damp(this.smoothTarget.x, this.target.x, 12, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, this.target.z, 12, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, this.target.y, 7, dt);

    // ---- desired position + collision
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    const hit = physics.raycast(this.smoothTarget, this.dir, this.distance + 0.4);
    const want = Math.max(1.6, Math.min(this.distance, hit - 0.4));
    this.curDist = want < this.curDist ? damp(this.curDist, want, 25, dt) : damp(this.curDist, want, 4, dt);
    const cam = this.camera;
    cam.position.copy(this.smoothTarget).addScaledVector(this.dir, this.curDist);
    const gh = physics.ground.heightAt(cam.position.x, cam.position.z) + 0.6;
    if (cam.position.y < gh) cam.position.y = gh;
    // keep the camera above the sea a bit too
    if (cam.position.y < 0.8) cam.position.y = 0.8;

    // ---- shake
    if (this.shake > 0) {
      this.shakeT += dt * 40;
      const s = this.shake * this.shake * 0.5;
      cam.position.x += Math.sin(this.shakeT * 1.3) * s;
      cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.smoothTarget);

    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
