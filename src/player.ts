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
  /** analog stick input (touch joystick): x = strafe, y = forward, each -1..1 */
  analog = { f: 0, s: 0 };
  moving = false;
  sprinting = false;
  crouching = false;

  constructor(private world: World, private camera: THREE.PerspectiveCamera) {
    const hint = world.spawnHint ?? { x: 0, z: 0 };
    this.position.set(hint.x, 0, hint.z);
    this.snapToGround();
  }

  /** How deep the player is wading, in meters (0 on dry land). */
  get waterDepth(): number {
    return Math.max(0, WATER_Y - this.world.heightAt(this.position.x, this.position.z));
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
    this.analog.f = 0;
    this.analog.s = 0;
  }

  snapToGround() {
    const h = this.world.heightAt(this.position.x, this.position.z);
    // in deep water you swim: eyes stay just above the surface
    const stand = h + (this.crouching ? EYE * 0.6 : EYE);
    this.position.y = Math.max(stand, WATER_Y + 0.55);
  }

  update(dt: number) {
    const k = this.keys;
    let fwd = 0;
    let strafe = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
    let analogMag = 0;
    if (fwd === 0 && strafe === 0) {
      analogMag = Math.min(1, Math.hypot(this.analog.f, this.analog.s));
      if (analogMag > 0.12) {
        fwd = this.analog.f;
        strafe = this.analog.s;
      } else {
        analogMag = 0;
      }
    }
    this.sprinting = k.has('ShiftLeft') || k.has('ShiftRight') || analogMag > 0.94;
    this.crouching = k.has('KeyC') || k.has('ControlLeft');
    this.moving = fwd !== 0 || strafe !== 0;

    if (this.moving) {
      let speed = this.sprinting ? SPRINT : this.crouching ? CROUCH : WALK;
      if (analogMag > 0) speed *= Math.max(0.35, analogMag);
      // wading slows you down the deeper you go
      speed /= 1 + Math.min(2.2, this.waterDepth * 0.85);
      const len = Math.max(1, Math.hypot(fwd, strafe));
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = ((-sin * fwd) / len + (cos * strafe) / len) * speed * dt;
      const dz = ((-cos * fwd) / len + (-sin * strafe) / len) * speed * dt;
      let nx = this.position.x + dx;
      let nz = this.position.z + dz;
      [nx, nz] = this.world.collide(nx, nz, 0.42);
      nx = THREE.MathUtils.clamp(nx, -PLAY_BOUND, PLAY_BOUND);
      nz = THREE.MathUtils.clamp(nz, -PLAY_BOUND, PLAY_BOUND);
      this.position.x = nx;
      this.position.z = nz;
    }
    this.snapToGround();

    // head-bob, subtle and speed-dependent; a slow buoyant sway while swimming
    const inWater = this.waterDepth > 0.4;
    const bob = inWater
      ? Math.sin(performance.now() * 0.0022) * 0.07
      : this.moving
        ? Math.sin(performance.now() * 0.011 * (this.sprinting ? 1.5 : 1)) * 0.045
        : 0;
    this.camera.position.copy(this.position);
    this.camera.position.y += bob;
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
  }
}
