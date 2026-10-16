import { Color, CylinderGeometry, Group, Mesh, MeshToonMaterial, PlaneGeometry, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { toonUnique, PAL, toon } from '../render/materials';
import { FaceRig, type FaceSpec } from '../render/faces';
import { G, m } from '../world/kit';

export type BaronMood = 'smug' | 'angry' | 'puff' | 'hurt' | 'furious' | 'ko';

const MOODS: Record<BaronMood, FaceSpec> = {
  smug: { eyes: 'angry', mouth: 'teeth', brows: 'angry', mustache: true },
  angry: { eyes: 'angry', mouth: 'teeth', brows: 'angry', mustache: true, eyeGap: 1.1 },
  puff: { eyes: 'wide', mouth: 'o', brows: 'up', mustache: true },
  hurt: { eyes: 'x', mouth: 'teeth', brows: 'worried', mustache: true },
  furious: { eyes: 'angry', mouth: 'grin', brows: 'angry', mustache: true, eyeGap: 1.15 },
  ko: { eyes: 'x', mouth: 'o', brows: 'worried', mustache: true },
};

/** Baron Von Blackout: a top-hatted, monocled storm cloud. */
export class Baron extends Group {
  readonly body = new Group();
  readonly hat = new Group();
  readonly face: FaceRig;
  private bodyMats: MeshToonMaterial[] = [];
  private puffs: Mesh[] = [];
  private cheeks: Mesh[] = [];
  private armL = new Group();
  private armR = new Group();
  private mood: BaronMood = 'smug';
  private flashT = 0;
  private baseColor = new Color(0x6b6a86);
  puffAmount = 0;
  hatAttached = true;
  readonly hatHome = new Vector3(0, 4.3, 0.4);

  constructor() {
    super();
    this.add(this.body);
    const blob = (x: number, y: number, z: number, r: number, c = 0x6b6a86) => {
      const mat = toonUnique(c, { mottle: 0.5 });
      this.bodyMats.push(mat);
      const s = m(new SphereGeometry(r, 28, 20), mat, { p: [x, y, z] });
      this.body.add(s);
      this.puffs.push(s);
      return s;
    };
    blob(0, 0, 0, 3.3);
    blob(-2.9, -0.4, -0.4, 2.3);
    blob(2.9, -0.3, -0.4, 2.4);
    blob(-1.6, 1.6, -0.9, 2.1);
    blob(1.7, 1.7, -0.9, 2.0);
    blob(0, -1.6, -0.6, 2.3, 0x5a5874);
    blob(-4.3, -1.2, -0.6, 1.4, 0x5a5874);
    blob(4.4, -1.1, -0.6, 1.5, 0x5a5874);
    // face on the front puff
    this.face = new FaceRig('sphere', MOODS.smug, '#7d7c98', 0.9, 240);
    const faceMat = toonUnique(0xffffff, { map: this.face.texture, mottle: 0.1 });
    this.bodyMats.push(faceMat);
    const front = m(new SphereGeometry(2.95, 32, 22), faceMat, { p: [0, 0.2, 0.75] });
    this.body.add(front);
    // puffable cheeks
    for (const sx of [-1, 1]) {
      const c = m(new SphereGeometry(0.9, 16, 12), toon(0x8c8aa8), { p: [sx * 1.7, -0.3, 2.6] });
      c.scale.setScalar(0.01);
      this.cheeks.push(c);
      this.body.add(c);
    }
    // monocle over the right eye
    const mono = new Group();
    mono.position.set(0.85, 0.85, 3.58);
    mono.add(m(new TorusGeometry(0.62, 0.09, 8, 24), toon(PAL.gold, { gloss: true })));
    const glass = m(new CylinderGeometry(0.58, 0.58, 0.05, 20).rotateX(Math.PI / 2), toon(0xcfe3ea, { gloss: true, transparent: true, opacity: 0.4 }));
    mono.add(glass);
    mono.add(m(G.cyl(0.02, 0.02, 2.4, 4), toon(PAL.gold), { p: [0.6, -1.2, -0.2], r: [0, 0, 0.3] }));
    this.body.add(mono);
    // top hat
    const black = toon(0x1f1a24, { gloss: true });
    this.hat.add(m(new CylinderGeometry(1.5, 1.6, 2.6, 24), black, { p: [0, 1.3, 0] }));
    this.hat.add(m(new CylinderGeometry(2.6, 2.6, 0.18, 28), black, { p: [0, 0.05, 0] }));
    this.hat.add(m(new CylinderGeometry(1.62, 1.62, 0.5, 24), toon(PAL.red), { p: [0, 0.5, 0] }));
    this.hat.position.copy(this.hatHome);
    this.hat.rotation.z = -0.15;
    this.body.add(this.hat);
    // stubby cloud arms with gloves
    for (const [arm, sx] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(sx * 4.5, -0.6, 0.6);
      arm.add(m(new SphereGeometry(1.0, 16, 12), toon(0x6b6a86), { p: [sx * 0.6, 0, 0] }));
      arm.add(m(new SphereGeometry(0.75, 16, 12), toon(PAL.white, { gloss: true }), { p: [sx * 1.6, 0.2, 0.3] }));
      this.body.add(arm);
    }
    // a little lightning-bolt cane
    const bolt = new Group();
    bolt.position.set(6.2, -1.6, 1.0);
    for (let i = 0; i < 3; i++) bolt.add(m(G.box(0.25, 1.3, 0.25), toon(PAL.gold, { emissive: 0xffc35a, emissiveIntensity: 0.6 }), { p: [i % 2 ? 0.3 : -0.1, -i * 1.1, 0], r: [0, 0, i % 2 ? -0.5 : 0.5] }));
    this.armR.add(bolt);
    this.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).castShadow = true;
    });
    void PlaneGeometry;
  }

  setMood(mood: BaronMood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.face.spec = MOODS[mood];
  }

  /** 0 = normal, 1 = phase 2 darkening, 2 = phase 3 thunderhead */
  setPhase(ph: number) {
    this.baseColor.set(ph === 0 ? 0x6b6a86 : ph === 1 ? 0x55506e : 0x3b3450);
  }

  flash() {
    this.flashT = 0.07;
  }

  update(dt: number, t: number) {
    this.flashT -= dt;
    const fl = this.flashT > 0;
    for (const mat of this.bodyMats) {
      if (mat.map) {
        mat.emissive.setRGB(fl ? 0.6 : 0, fl ? 0.6 : 0, fl ? 0.6 : 0);
        continue;
      }
      mat.color.copy(this.baseColor);
      mat.emissive.setRGB(fl ? 0.7 : 0, fl ? 0.7 : 0, fl ? 0.7 : 0);
    }
    // churning puffs
    this.puffs.forEach((p, i) => {
      const s = 1 + Math.sin(t * 2.2 + i * 1.7) * 0.05 + this.puffAmount * 0.12;
      p.scale.setScalar(s);
    });
    for (const c of this.cheeks) c.scale.setScalar(0.01 + this.puffAmount * 1.1);
    this.armL.rotation.z = Math.sin(t * 3) * 0.25;
    this.armR.rotation.z = -Math.sin(t * 3 + 1) * 0.25;
    this.body.rotation.z = Math.sin(t * 1.3) * 0.06;
    this.face.draw(0, false, undefined);
  }

  get hitCenter() {
    return this.getWorldPosition(new Vector3());
  }
}
