import { Color, DirectionalLight, HemisphereLight, Object3D, Scene, Vector3 } from 'three';
import { Terrain, TERRAIN_HALF } from '../world/Terrain';
import { Water } from '../world/Water';
import { Sky, SKY_PRESETS, type SkyPreset } from '../render/Sky';
import { Physics } from '../core/Physics';
import { Player, type PlayerHooks } from '../player/Player';
import { CameraRig } from '../player/CameraRig';
import { Particles } from '../fx/Particles';
import type { Renderer } from '../render/Renderer';
import { SPAWN } from '../world/layout';
import { World } from '../world/World';

export class Overworld {
  readonly scene = new Scene();
  readonly terrain = new Terrain();
  readonly water: Water;
  readonly sky = new Sky();
  readonly physics: Physics;
  readonly player: Player;
  readonly rig: CameraRig;
  readonly fx = new Particles();
  readonly sun: DirectionalLight;
  readonly world: World;
  readonly hemi: HemisphereLight;
  private sunTarget = new Object3D();

  constructor(private renderer: Renderer, hooks: PlayerHooks) {
    this.scene.background = new Color(0x000000);
    this.physics = new Physics(this.terrain);
    this.water = new Water(this.terrain.heightTex, TERRAIN_HALF);
    this.scene.add(this.sky, this.terrain.mesh, this.water, this.fx);
    this.world = new World(this.physics, this.terrain, this.fx);
    this.scene.add(this.world.root);

    this.hemi = new HemisphereLight(0xfff0d2, 0x7d6a8f, 1.15);
    this.sun = new DirectionalLight(0xfff1cf, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -36;
    s.right = 36;
    s.top = 36;
    s.bottom = -36;
    s.near = 1;
    s.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.target = this.sunTarget;
    this.scene.add(this.hemi, this.sun, this.sunTarget);

    this.player = new Player(this.physics, hooks);
    this.scene.add(this.player.root, this.player.shadowMesh);
    this.rig = new CameraRig(renderer.aspect);
    renderer.onResize((w, h) => this.rig.setAspect(w / h));

    const y = this.terrain.heightAt(SPAWN.x, SPAWN.z);
    this.player.place(SPAWN.x, y, SPAWN.z, SPAWN.yaw);
    this.rig.snap(this.player.pos, 0);
    this.applySky(SKY_PRESETS.day);
  }

  applySky(p: SkyPreset) {
    this.sky.apply(p);
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.renderer.haze.set(p.haze);
    this.water.setNight(p.night);
  }

  updateLights() {
    const p = this.player.pos;
    const d = this.sky.sunDir;
    this.sunTarget.position.copy(p);
    this.sun.position.copy(p).addScaledVector(d, 80);
    // texel snapping to stop shadow shimmer as the camera moves
    const texel = 72 / this.sun.shadow.mapSize.x;
    this.sun.position.x = Math.round(this.sun.position.x / texel) * texel;
    this.sun.position.z = Math.round(this.sun.position.z / texel) * texel;
  }

  get cameraPos(): Vector3 {
    return this.rig.camera.position;
  }
}
