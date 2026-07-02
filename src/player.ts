import * as THREE from 'three';
import { World, WATER_Y, PLAY_BOUND } from './world';

const EYE = 1.62;
const WALK = 5.2;
const SPRINT = 9.5;
const CROUCH = 2.2;

export class Player {
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector3();
  private keys = new Set<string>();
  moving = false;
  sprinting = false;
  crouching = false;

  constructor(private world: World, private camera: THREE.PerspectiveCamera) {
    const hint = world.spawnHint ?? { x: 0, z: 0 };
    this.position.set(hint.x, 0, hint.z);
    this.snapToGround();
  }

  /** How loud the player is: multiplies animal detection distance. */
  get noiseFactor(): number {
    if (!this.moving) return 0.55;
    if (this.sprinting) return 1.7;
    if (this.crouching) return 0.6;
    return 1.0;
  }

  onKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  onMouse(dx: number, dy: number) {
    this.yaw -= dx * 0.0023;
    this.pitch -= dy * 0.0023;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35);
  }

  clearKeys() {
    this.keys.clear();
  }

  snapToGround() {
    const h = Math.max(this.world.heightAt(this.position.x, this.position.z), WATER_Y + 0.1);
    this.position.y = h + (this.crouching ? EYE * 0.6 : EYE);
  }

  update(dt: number) {
    const k = this.keys;
    let fwd = 0;
    let strafe = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
    this.sprinting = k.has('ShiftLeft') || k.has('ShiftRight');
    this.crouching = k.has('KeyC') || k.has('ControlLeft');
    this.moving = fwd !== 0 || strafe !== 0;

    if (this.moving) {
      const speed = this.sprinting ? SPRINT : this.crouching ? CROUCH : WALK;
      const len = Math.hypot(fwd, strafe);
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = ((-sin * fwd) / len + (cos * strafe) / len) * speed * dt;
      const dz = ((-cos * fwd) / len + (-sin * strafe) / len) * speed * dt;
      let nx = this.position.x + dx;
      let nz = this.position.z + dz;
      // don't wade into deep water
      if (this.world.heightAt(nx, nz) < WATER_Y - 0.5) {
        if (this.world.heightAt(this.position.x + dx, this.position.z) >= WATER_Y - 0.5) nz = this.position.z;
        else if (this.world.heightAt(this.position.x, this.position.z + dz) >= WATER_Y - 0.5) nx = this.position.x;
        else {
          nx = this.position.x;
          nz = this.position.z;
        }
      }
      [nx, nz] = this.world.collide(nx, nz, 0.42);
      nx = THREE.MathUtils.clamp(nx, -PLAY_BOUND, PLAY_BOUND);
      nz = THREE.MathUtils.clamp(nz, -PLAY_BOUND, PLAY_BOUND);
      this.position.x = nx;
      this.position.z = nz;
    }
    this.snapToGround();

    // head-bob, subtle and speed-dependent
    const bob = this.moving ? Math.sin(performance.now() * 0.011 * (this.sprinting ? 1.5 : 1)) * 0.045 : 0;
    this.camera.position.copy(this.position);
    this.camera.position.y += bob;
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }
}
