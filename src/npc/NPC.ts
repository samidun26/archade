import { Group, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { FaceRig } from '../render/faces';
import { canvas, INK, tex } from '../render/textures';
import { patchUnlit } from '../render/gbuffer';
import { dampAngle } from '../core/math';

export type Indicator = '!' | '?' | '$' | null;

const bubbleTex = new Map<string, ReturnType<typeof tex>>();
function bubble(sym: string) {
  let t = bubbleTex.get(sym);
  if (t) return t;
  const { c, g } = canvas(128, 160);
  g.fillStyle = sym === '!' ? '#f2b83b' : sym === '$' ? '#9fd38a' : '#fbf0d4';
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.beginPath();
  g.ellipse(64, 62, 52, 50, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(50, 106);
  g.lineTo(64, 150);
  g.lineTo(78, 106);
  g.fill();
  g.stroke();
  g.fillStyle = sym === '!' ? '#f2b83b' : sym === '$' ? '#9fd38a' : '#fbf0d4';
  g.fillRect(52, 100, 24, 10);
  g.fillStyle = INK;
  g.font = 'bold 76px "Luckiest Guy", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(sym === '$' ? '¢' : sym, 64, 68);
  t = tex(c);
  bubbleTex.set(sym, t);
  return t;
}

export interface NPCBuild {
  body: Group;
  face: FaceRig;
  top: number;
  /** Optional per-frame animation (talking gestures etc). */
  animate?: (dt: number, t: number, talking: boolean, beat: number) => void;
}

export class NPC extends Group {
  readonly body: Group;
  readonly face: FaceRig;
  readonly top: number;
  talking = false;
  turnToPlayer = true;
  talkRadius = 3.6;
  /** Scales the music bob (big NPCs like the oak barely sway). */
  bob = 1;
  private bubble: Sprite;
  private indicator: Indicator = null;
  private blinkT = Math.random() * 3;
  private talkT = 0;
  private baseYaw: number;
  private anim?: NPCBuild['animate'];

  constructor(
    readonly npcId: string,
    readonly displayName: string,
    readonly voice: number,
    b: NPCBuild,
    yaw = 0,
  ) {
    super();
    this.body = b.body;
    this.face = b.face;
    this.top = b.top;
    this.anim = b.animate;
    this.add(this.body);
    this.rotation.y = yaw;
    this.baseYaw = yaw;
    this.bubble = new Sprite(patchUnlit(new SpriteMaterial({ map: bubble('!'), depthWrite: false, transparent: true }), 'keep'));
    this.bubble.scale.set(0.9, 1.12, 1);
    this.bubble.position.y = this.top + 0.9;
    this.bubble.visible = false;
    this.bubble.renderOrder = 10;
    this.add(this.bubble);
    this.userData.dynamic = true;
  }

  get worldPos() {
    return this.getWorldPosition(new Vector3());
  }

  setIndicator(i: Indicator) {
    if (i === this.indicator) return;
    this.indicator = i;
    this.bubble.visible = !!i;
    if (i) {
      (this.bubble.material as SpriteMaterial).map = bubble(i);
      (this.bubble.material as SpriteMaterial).needsUpdate = true;
    }
  }

  update(dt: number, t: number, beat: number, player: Vector3) {
    // face the player when they come close
    const wp = this.worldPos;
    const dx = player.x - wp.x;
    const dz = player.z - wp.z;
    const d = Math.hypot(dx, dz);
    if (this.turnToPlayer) {
      const want = d < 9 ? Math.atan2(dx, dz) : this.baseYaw;
      this.rotation.y = dampAngle(this.rotation.y, want, 4, dt);
    }
    // bob to the music
    const ph = (beat % 1) * Math.PI * 2;
    const sq = Math.sin(ph) * (this.talking ? 0.05 : 0.03) * this.bob;
    this.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    this.body.rotation.z = Math.sin(beat * Math.PI) * 0.035 * this.bob;

    this.blinkT -= dt;
    let blink = 0;
    if (this.blinkT < 0.13) blink = 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    if (this.talking) this.talkT += dt;
    const open = this.talking && Math.floor(this.talkT * 8) % 2 === 0;
    this.face.draw(blink, open);
    this.anim?.(dt, t, this.talking, beat);
    this.bubble.position.y = this.top + 0.9 + Math.sin(t * 3) * 0.12;
  }
}
