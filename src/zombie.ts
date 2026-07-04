// Zombie survival cheat mode. Every animal turns green with red eyes and
// shambles toward the player; the camera becomes a hatchet. Survive.
import * as THREE from 'three';
import { Animal, AnimalSpawner } from './animals';
import { Player } from './player';
import { World } from './world';

const SWING_RADIUS = 3.6; // hatchet reach
const INNER_RADIUS = 1.7; // this close = it got you
const MAX_LIVES = 5;
const DAY_SECONDS = 30;
const MAX_REST_SPLATTER = 420;

export interface ZombieSfx {
  swing: () => void;
  squish: () => void;
  hurt: () => void;
  death: () => void;
}

const zombieSkin = new THREE.MeshLambertMaterial({ color: '#5d9a3e' });
const zombieSkinDark = new THREE.MeshLambertMaterial({ color: '#48802f' });
const eyeMat = new THREE.MeshBasicMaterial({ color: '#e01818' });
const eyeGeo = new THREE.SphereGeometry(0.045, 6, 5);
const splatterMats = ['#8a1410', '#a51e14', '#6b0f0c'].map((c) => new THREE.MeshBasicMaterial({ color: c }));
const splatterGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);

/** Turn an animal green, give it red eyes, and point it at the player. */
export function zombify(a: Animal) {
  a.zombie = true;
  a.perchY = null;
  a.rig.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = Math.random() < 0.3 ? zombieSkinDark : zombieSkin;
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.09, 0.12, 0.22);
    a.rig.head.add(eye);
  }
}

interface Splatter {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  resting: boolean;
}

export class ZombieMode {
  active = false;
  lives = MAX_LIVES;
  kills = 0;
  elapsed = 0;
  dead = false;
  private hurtCooldown = 0;
  private swingCooldown = 0;
  private swingT = -1; // >= 0 while the hatchet swing animates
  private hatchet: THREE.Group;
  private splatters: Splatter[] = [];

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private sfx: ZombieSfx,
    private onDeath: () => void
  ) {
    this.hatchet = buildHatchet();
  }

  get day(): number {
    return Math.floor(this.elapsed / DAY_SECONDS);
  }

  get score(): number {
    return this.day * 100 + this.kills * 10;
  }

  begin(spawner: AnimalSpawner) {
    this.active = true;
    this.dead = false;
    this.lives = MAX_LIVES;
    this.kills = 0;
    this.elapsed = 0;
    this.hurtCooldown = 2; // a moment of grace at the start
    // the world turns: everything alive joins the horde (fish flee to the deep)
    for (const a of [...spawner.animals]) {
      if (a.def.aquatic || a.flying) a.alive = false;
      else zombify(a);
    }
    spawner.onSpawn = zombify;
    spawner.zombieMax = 8;
    spawner.zombieInterval = 1.4;
    // hatchet needs the camera in the scene graph to render
    this.scene.add(this.camera);
    this.camera.add(this.hatchet);
    document.body.classList.add('zombie-mode');
  }

  end(spawner: AnimalSpawner) {
    this.active = false;
    spawner.onSpawn = null;
    spawner.zombieMax = 0;
    for (const a of spawner.animals) a.alive = false; // clear the horde
    this.camera.remove(this.hatchet);
    this.scene.remove(this.camera);
    for (const s of this.splatters) this.scene.remove(s.mesh);
    this.splatters.length = 0;
    document.body.classList.remove('zombie-mode');
  }

  /** Swing the hatchet. Returns true if the swing happened. */
  trySwing(spawner: AnimalSpawner, player: Player): boolean {
    if (!this.active || this.dead || this.swingCooldown > 0) return false;
    this.swingCooldown = 0.28;
    this.swingT = 0;
    this.sfx.swing();
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    for (const a of spawner.animals) {
      if (!a.zombie || !a.alive) continue;
      const to = a.focusPoint.sub(player.position);
      const dist = Math.hypot(to.x, to.z);
      if (dist > SWING_RADIUS + a.boundRadius * 0.4) continue;
      to.normalize();
      if (to.dot(fwd) < 0.35) continue; // behind you doesn't count
      a.alive = false;
      this.kills++;
      this.sfx.squish();
      this.burstSplatter(a.position, a.scale);
      announceKill(a);
    }
    return true;
  }

  update(dt: number, spawner: AnimalSpawner, player: Player, world: World) {
    if (!this.active || this.dead) return;
    this.elapsed += dt;
    this.hurtCooldown -= dt;
    this.swingCooldown -= dt;

    // difficulty ramps with the day counter: more zombies, faster zombies
    const day = this.day;
    spawner.zombieMax = Math.min(26, 8 + day * 2);
    spawner.zombieInterval = Math.max(0.35, 1.4 - day * 0.12);
    const speedMult = Math.min(2.3, 1 + day * 0.16);
    for (const a of spawner.animals) a.zombieSpeed = speedMult;

    // claws: any zombie inside the inner radius costs a life
    if (this.hurtCooldown <= 0) {
      for (const a of spawner.animals) {
        if (!a.zombie || !a.alive || a.zombieStun > 0) continue;
        const dx = a.position.x - player.position.x;
        const dz = a.position.z - player.position.z;
        if (Math.hypot(dx, dz) < INNER_RADIUS + a.scale * 0.25) {
          this.lives--;
          this.hurtCooldown = 1.0;
          this.sfx.hurt();
          flashHurt();
          // knock the zombie back so it must come at you again
          const d = Math.max(0.01, Math.hypot(dx, dz));
          const [nx, nz] = world.collide(a.position.x + (dx / d) * 3.5, a.position.z + (dz / d) * 3.5, 0.5);
          a.position.x = nx;
          a.position.z = nz;
          a.zombieStun = 1.3;
          if (this.lives <= 0) {
            this.dead = true;
            this.sfx.death();
            this.onDeath();
            return;
          }
          break;
        }
      }
    }

    // hatchet idle bob + swing animation: chops in toward the screen center
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = Math.min(1, this.swingT / 0.24);
      const arc = Math.sin(t * Math.PI); // out and back
      this.hatchet.rotation.x = HATCHET_REST_X - arc * 1.5;
      this.hatchet.rotation.z = HATCHET_REST_Z - arc * 0.9;
      this.hatchet.position.x = HATCHET_REST_POS.x - arc * 0.3; // sweep to center
      this.hatchet.position.y = HATCHET_REST_POS.y + arc * 0.06;
      if (t >= 1) this.swingT = -1;
    } else {
      const bob = player.moving ? Math.sin(performance.now() * 0.008) * 0.03 : 0;
      this.hatchet.rotation.x = HATCHET_REST_X + bob;
      this.hatchet.rotation.z = HATCHET_REST_Z;
      this.hatchet.position.x = HATCHET_REST_POS.x;
      this.hatchet.position.y = HATCHET_REST_POS.y;
    }

    // splatter physics: fly, land, stay
    for (let i = this.splatters.length - 1; i >= 0; i--) {
      const s = this.splatters[i];
      if (s.resting) continue;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const ground = world.heightAt(s.mesh.position.x, s.mesh.position.z) + 0.04;
      if (s.mesh.position.y <= ground) {
        s.mesh.position.y = ground;
        s.mesh.scale.set(1.6, 0.3, 1.6); // flatten into a stain
        s.resting = true;
      }
    }
    const resting = this.splatters.filter((s) => s.resting);
    while (resting.length > MAX_REST_SPLATTER) {
      const oldest = resting.shift()!;
      this.scene.remove(oldest.mesh);
      const ix = this.splatters.indexOf(oldest);
      if (ix >= 0) this.splatters.splice(ix, 1);
    }
  }

  private burstSplatter(at: THREE.Vector3, scale: number) {
    const n = 12 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(splatterGeo, splatterMats[i % splatterMats.length]);
      mesh.position.copy(at);
      mesh.position.y += 0.4 * scale;
      mesh.scale.setScalar(0.7 + Math.random() * Math.min(2, scale));
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3;
      this.splatters.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(ang) * sp, 2 + Math.random() * 3.5, Math.sin(ang) * sp),
        resting: false,
      });
      this.scene.add(mesh);
    }
  }

  hudText(): string {
    const hearts = '❤'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, MAX_LIVES - this.lives));
    return `🧟 Day ${this.day} · ${this.kills} kills · ${hearts}`;
  }
}

const HATCHET_REST_X = -0.55;
const HATCHET_REST_Z = 0.14;
const HATCHET_REST_POS = new THREE.Vector3(0.36, -0.4, -0.72);

/** "You just killed a MASSIVE zombie Farm Dog" — top-of-screen kill feed. */
function announceKill(a: Animal) {
  const el = document.getElementById('kill-feed');
  if (!el) return;
  const size = a.size.label ? `${a.size.label === 'MASSIVE' ? 'MASSIVE' : a.size.label.toLowerCase()} ` : '';
  el.textContent = `You just killed a ${size}zombie ${a.def.name}!`;
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
}

function buildHatchet(): THREE.Group {
  // Built upright in local space (handle along +Y, blade facing -Z),
  // then the whole group is tilted into a ready grip.
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.035, 0.72, 7),
    new THREE.MeshLambertMaterial({ color: '#8a6a42' })
  );
  g.add(handle);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.11, 0.24),
    new THREE.MeshLambertMaterial({ color: '#7d838a' })
  );
  head.position.set(0, 0.3, -0.09);
  g.add(head);
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.16, 0.07),
    new THREE.MeshLambertMaterial({ color: '#c9ced4' })
  );
  edge.position.set(0, 0.3, -0.24);
  g.add(edge);
  g.scale.setScalar(0.8);
  g.position.copy(HATCHET_REST_POS);
  g.rotation.set(HATCHET_REST_X, 0, HATCHET_REST_Z);
  return g;
}

function flashHurt() {
  const el = document.getElementById('hurt');
  if (!el) return;
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
}
