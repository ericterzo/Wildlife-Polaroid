import * as THREE from 'three';
import { World, WATER_Y, Habitat } from './world';

// ---------------------------------------------------------------- species

export interface SpeciesDef {
  id: string;
  name: string;
  habitats: Habitat[];
  rarity: number; // spawn weight, higher = more common
  fleeDist: number; // meters at which it spooks (walking player)
  speed: number; // flee speed m/s
  baseScale: number;
  flies: boolean; // flees by flying away
  swims: boolean; // lives on the water surface
  build: () => AnimalRig;
}

export interface AnimalRig {
  group: THREE.Group;
  legs: THREE.Object3D[];
  head: THREE.Object3D;
  tail: THREE.Object3D | null;
  bodyHeight: number; // approx eye-line height for photo aiming, pre-scale
}

// -- low-poly construction helpers ------------------------------------------

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  m.castShadow = true;
  return m;
}

const materialCache = new Map<string, THREE.MeshLambertMaterial>();
function material(color: string): THREE.MeshLambertMaterial {
  let m = materialCache.get(color);
  if (!m) materialCache.set(color, (m = new THREE.MeshLambertMaterial({ color })));
  return m;
}

interface QuadOpts {
  body: [number, number, number];
  bodyY: number;
  bodyColor: string;
  head: [number, number, number];
  headColor?: string;
  headFwd: number; // head pivot offset forward from body center
  headUp: number;
  snout?: [number, number, number, string];
  ears?: [number, number, number]; // w,h, spread
  earColor?: string;
  legH: number;
  legW?: number;
  legColor?: string;
  legSpread?: [number, number]; // x, z from center
  tail?: { size: [number, number, number]; up?: number; color?: string };
  antlers?: boolean;
  stripe?: boolean; // badger face stripe
}

/** Generic four-legged animal. +Z is forward. Legs pivot at the hip. */
function quadruped(o: QuadOpts): AnimalRig {
  const g = new THREE.Group();
  const [bw, bh, bd] = o.body;
  const bodyY = o.bodyY;
  const body = box(bw, bh, bd, o.bodyColor);
  body.position.y = bodyY;
  g.add(body);

  const head = new THREE.Group();
  head.position.set(0, bodyY + o.headUp, bd / 2 + o.headFwd);
  const [hw, hh, hd] = o.head;
  const skull = box(hw, hh, hd, o.headColor ?? o.bodyColor);
  skull.position.set(0, hh * 0.2, hd * 0.25);
  head.add(skull);
  if (o.snout) {
    const [sw, sh, sd, sc] = o.snout;
    const sn = box(sw, sh, sd, sc);
    sn.position.set(0, hh * 0.05, hd * 0.25 + hd / 2 + sd / 2 - 0.01);
    head.add(sn);
  }
  if (o.stripe) {
    const st = box(hw * 0.34, hh * 1.04, hd * 1.02, '#2e2e30');
    st.position.copy(skull.position);
    head.add(st);
  }
  if (o.ears) {
    const [ew, eh, spread] = o.ears;
    for (const side of [-1, 1]) {
      const ear = box(ew, eh, ew * 0.5, o.earColor ?? o.headColor ?? o.bodyColor);
      ear.position.set(side * spread, hh * 0.5 + eh * 0.45, hd * 0.1);
      head.add(ear);
    }
  }
  if (o.antlers) {
    for (const side of [-1, 1]) {
      const a1 = box(0.05, 0.5, 0.05, '#8a7355');
      a1.position.set(side * hw * 0.35, hh * 0.6 + 0.22, 0);
      a1.rotation.z = -side * 0.35;
      head.add(a1);
      const a2 = box(0.05, 0.3, 0.05, '#8a7355');
      a2.position.set(side * hw * 0.35 + side * 0.12, hh * 0.6 + 0.42, 0);
      a2.rotation.z = side * 0.6;
      head.add(a2);
    }
  }
  g.add(head);

  const legs: THREE.Object3D[] = [];
  const lw = o.legW ?? Math.min(bw, bd) * 0.16;
  const [sx, sz] = o.legSpread ?? [bw / 2 - lw * 0.7, bd / 2 - lw];
  for (const fz of [-1, 1]) {
    for (const fx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(fx * sx, bodyY - bh / 2 + 0.02, fz * sz);
      const leg = box(lw, o.legH, lw, o.legColor ?? o.bodyColor);
      leg.position.y = -o.legH / 2;
      pivot.add(leg);
      g.add(pivot);
      legs.push(pivot);
    }
  }

  let tail: THREE.Object3D | null = null;
  if (o.tail) {
    const t = new THREE.Group();
    t.position.set(0, bodyY + (o.tail.up ?? 0), -bd / 2);
    const [tw, th, td] = o.tail.size;
    const tm = box(tw, th, td, o.tail.color ?? o.bodyColor);
    tm.position.set(0, 0, -td / 2);
    t.add(tm);
    g.add(t);
    tail = t;
  }
  return { group: g, legs, head, tail, bodyHeight: bodyY };
}

interface BirdOpts {
  body: [number, number, number];
  bodyY: number;
  bodyColor: string;
  headColor?: string;
  headSize?: number;
  neckLen?: number; // 0 = head sits on body (chicken); tall for heron
  neckColor?: string;
  beakLen?: number;
  beakColor?: string;
  legH: number;
  legColor?: string;
  tailUp?: boolean;
}

/** Generic bird. +Z is forward. */
function bird(o: BirdOpts): AnimalRig {
  const g = new THREE.Group();
  const [bw, bh, bd] = o.body;
  const body = box(bw, bh, bd, o.bodyColor);
  body.position.y = o.bodyY;
  body.rotation.x = -0.15;
  g.add(body);

  const head = new THREE.Group();
  const neck = o.neckLen ?? 0;
  head.position.set(0, o.bodyY + bh * 0.3 + neck, bd * 0.42);
  if (neck > 0.05) {
    const neckMesh = box(bw * 0.28, neck + bh * 0.4, bw * 0.28, o.neckColor ?? o.bodyColor);
    neckMesh.position.set(0, -(neck + bh * 0.4) / 2 + 0.03, 0);
    head.add(neckMesh);
  }
  const hs = o.headSize ?? bw * 0.55;
  const skull = box(hs, hs, hs * 1.15, o.headColor ?? o.bodyColor);
  skull.position.y = hs * 0.3;
  head.add(skull);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(hs * 0.22, o.beakLen ?? hs * 0.8, 4), material(o.beakColor ?? '#d9a13c'));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, hs * 0.25, hs * 0.6 + (o.beakLen ?? hs * 0.8) / 2);
  beak.castShadow = true;
  head.add(beak);
  g.add(head);

  const legs: THREE.Object3D[] = [];
  for (const fx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(fx * bw * 0.25, o.bodyY - bh / 2 + 0.02, 0);
    const leg = box(0.05, o.legH, 0.05, o.legColor ?? '#c9973c');
    leg.position.y = -o.legH / 2;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }

  const t = new THREE.Group();
  t.position.set(0, o.bodyY + (o.tailUp ? bh * 0.3 : 0), -bd / 2);
  const tm = box(bw * 0.5, bh * 0.35, bd * 0.4, o.bodyColor);
  tm.position.set(0, o.tailUp ? bd * 0.15 : 0, -bd * 0.18);
  if (o.tailUp) tm.rotation.x = 0.7;
  t.add(tm);
  g.add(t);

  return { group: g, legs, head, tail: t, bodyHeight: o.bodyY };
}

// -- the roster: 16 real species ---------------------------------------------

export const SPECIES: SpeciesDef[] = [
  {
    id: 'rabbit', name: 'European Rabbit', habitats: ['field'], rarity: 1.0, fleeDist: 12, speed: 7, baseScale: 0.55, flies: false, swims: false,
    build: () => quadruped({
      body: [0.42, 0.4, 0.62], bodyY: 0.38, bodyColor: '#9a8468',
      head: [0.3, 0.3, 0.32], headFwd: 0.05, headUp: 0.22,
      ears: [0.09, 0.34, 0.09], earColor: '#8a7458',
      legH: 0.24, tail: { size: [0.14, 0.14, 0.14], color: '#e8e2d4' },
    }),
  },
  {
    id: 'red_fox', name: 'Red Fox', habitats: ['forest', 'field'], rarity: 0.5, fleeDist: 20, speed: 9, baseScale: 0.8, flies: false, swims: false,
    build: () => quadruped({
      body: [0.42, 0.42, 0.95], bodyY: 0.52, bodyColor: '#c96a2e',
      head: [0.32, 0.3, 0.34], headFwd: 0.08, headUp: 0.25,
      snout: [0.14, 0.12, 0.2, '#e8e2d4'], ears: [0.11, 0.2, 0.11],
      legH: 0.4, legColor: '#3a3230',
      tail: { size: [0.2, 0.2, 0.62], color: '#c96a2e' },
    }),
  },
  {
    id: 'roe_deer', name: 'Roe Deer', habitats: ['field', 'forest'], rarity: 0.7, fleeDist: 26, speed: 11, baseScale: 1.15, flies: false, swims: false,
    build: () => quadruped({
      body: [0.5, 0.55, 1.1], bodyY: 0.85, bodyColor: '#b08a5e',
      head: [0.3, 0.34, 0.4], headFwd: 0.12, headUp: 0.55,
      snout: [0.14, 0.13, 0.18, '#4a3a2c'], ears: [0.1, 0.22, 0.12],
      legH: 0.72, legW: 0.09, antlers: true,
      tail: { size: [0.16, 0.18, 0.1], color: '#e8e2d4' },
    }),
  },
  {
    id: 'wild_boar', name: 'Wild Boar', habitats: ['forest'], rarity: 0.28, fleeDist: 16, speed: 8, baseScale: 1.0, flies: false, swims: false,
    build: () => quadruped({
      body: [0.58, 0.62, 1.2], bodyY: 0.62, bodyColor: '#4d4038',
      head: [0.42, 0.44, 0.44], headFwd: 0.05, headUp: 0.05,
      snout: [0.18, 0.16, 0.22, '#8a7263'], ears: [0.12, 0.16, 0.16],
      legH: 0.4, legW: 0.12,
      tail: { size: [0.06, 0.06, 0.3] },
    }),
  },
  {
    id: 'badger', name: 'European Badger', habitats: ['forest'], rarity: 0.22, fleeDist: 14, speed: 6, baseScale: 0.7, flies: false, swims: false,
    build: () => quadruped({
      body: [0.5, 0.38, 0.85], bodyY: 0.32, bodyColor: '#77787c',
      head: [0.3, 0.26, 0.36], headColor: '#e8e6e0', headFwd: 0.04, headUp: 0.08,
      snout: [0.12, 0.11, 0.14, '#2e2e30'], ears: [0.07, 0.08, 0.12],
      legH: 0.2, legW: 0.11, legColor: '#2e2e30', stripe: true,
      tail: { size: [0.12, 0.12, 0.24], color: '#9a9aa0' },
    }),
  },
  {
    id: 'red_squirrel', name: 'Red Squirrel', habitats: ['forest'], rarity: 0.85, fleeDist: 9, speed: 6, baseScale: 0.32, flies: false, swims: false,
    build: () => quadruped({
      body: [0.3, 0.32, 0.5], bodyY: 0.3, bodyColor: '#b3552e',
      head: [0.24, 0.24, 0.26], headFwd: 0.04, headUp: 0.2,
      ears: [0.06, 0.14, 0.08], legH: 0.18,
      tail: { size: [0.16, 0.34, 0.4], up: 0.2, color: '#c26a3e' },
    }),
  },
  {
    id: 'hedgehog', name: 'Hedgehog', habitats: ['field', 'forest'], rarity: 0.45, fleeDist: 5, speed: 1.6, baseScale: 0.35, flies: false, swims: false,
    build: () => quadruped({
      body: [0.42, 0.32, 0.5], bodyY: 0.2, bodyColor: '#6b5b48',
      head: [0.2, 0.18, 0.22], headColor: '#a5906f', headFwd: 0.03, headUp: -0.02,
      snout: [0.08, 0.08, 0.1, '#3a3230'], legH: 0.08, legW: 0.06,
    }),
  },
  {
    id: 'sheep', name: 'Sheep', habitats: ['field', 'town'], rarity: 0.9, fleeDist: 9, speed: 5, baseScale: 0.95, flies: false, swims: false,
    build: () => quadruped({
      body: [0.62, 0.6, 1.0], bodyY: 0.68, bodyColor: '#e9e4d5',
      head: [0.26, 0.3, 0.34], headColor: '#3a3230', headFwd: 0.08, headUp: 0.3,
      ears: [0.1, 0.08, 0.14], earColor: '#3a3230',
      legH: 0.44, legW: 0.09, legColor: '#3a3230',
      tail: { size: [0.14, 0.16, 0.1] },
    }),
  },
  {
    id: 'cow', name: 'Cow', habitats: ['field'], rarity: 0.65, fleeDist: 7, speed: 4, baseScale: 1.5, flies: false, swims: false,
    build: () => quadruped({
      body: [0.7, 0.72, 1.5], bodyY: 0.95, bodyColor: '#e9e4d5',
      head: [0.36, 0.4, 0.42], headColor: '#4d4038', headFwd: 0.1, headUp: 0.25,
      snout: [0.24, 0.16, 0.14, '#caa08a'], ears: [0.14, 0.09, 0.2], earColor: '#4d4038',
      legH: 0.62, legW: 0.13,
      tail: { size: [0.07, 0.5, 0.07], up: 0.25, color: '#4d4038' },
    }),
  },
  {
    id: 'horse', name: 'Horse', habitats: ['field'], rarity: 0.5, fleeDist: 12, speed: 12, baseScale: 1.6, flies: false, swims: false,
    build: () => quadruped({
      body: [0.6, 0.7, 1.5], bodyY: 1.05, bodyColor: '#7a5230',
      head: [0.28, 0.42, 0.52], headFwd: 0.18, headUp: 0.62,
      snout: [0.18, 0.2, 0.2, '#5a3c22'], ears: [0.08, 0.14, 0.1],
      legH: 0.78, legW: 0.1, legColor: '#4a3320',
      tail: { size: [0.12, 0.55, 0.12], up: 0.28, color: '#3a2a18' },
    }),
  },
  {
    id: 'chicken', name: 'Chicken', habitats: ['town'], rarity: 1.0, fleeDist: 4, speed: 3.5, baseScale: 0.42, flies: false, swims: false,
    build: () => bird({
      body: [0.4, 0.42, 0.55], bodyY: 0.42, bodyColor: '#ece7da',
      headSize: 0.2, neckLen: 0.12, beakLen: 0.12, legH: 0.24, tailUp: true,
    }),
  },
  {
    id: 'cat', name: 'House Cat', habitats: ['town'], rarity: 0.8, fleeDist: 8, speed: 7, baseScale: 0.55, flies: false, swims: false,
    build: () => quadruped({
      body: [0.32, 0.34, 0.7], bodyY: 0.38, bodyColor: '#8a8a90',
      head: [0.28, 0.26, 0.26], headFwd: 0.04, headUp: 0.24,
      ears: [0.09, 0.12, 0.1], legH: 0.28, legW: 0.07,
      tail: { size: [0.08, 0.08, 0.5], up: 0.14 },
    }),
  },
  {
    id: 'mallard', name: 'Mallard Duck', habitats: ['water'], rarity: 0.9, fleeDist: 10, speed: 4, baseScale: 0.5, flies: true, swims: true,
    build: () => bird({
      body: [0.42, 0.36, 0.72], bodyY: 0.28, bodyColor: '#9a8468',
      headColor: '#2e6b3e', headSize: 0.22, neckLen: 0.1, beakLen: 0.18, beakColor: '#e0c23c',
      legH: 0.14, legColor: '#d97f36',
    }),
  },
  {
    id: 'grey_heron', name: 'Grey Heron', habitats: ['water'], rarity: 0.3, fleeDist: 22, speed: 6, baseScale: 1.0, flies: true, swims: false,
    build: () => bird({
      body: [0.4, 0.44, 0.8], bodyY: 0.72, bodyColor: '#9aa4ac',
      headColor: '#e8e6e0', headSize: 0.18, neckLen: 0.5, neckColor: '#d5d8da',
      beakLen: 0.4, beakColor: '#e0c23c', legH: 0.6, legColor: '#5a5a52',
    }),
  },
  {
    id: 'barn_owl', name: 'Barn Owl', habitats: ['forest'], rarity: 0.2, fleeDist: 15, speed: 7, baseScale: 0.5, flies: true, swims: false,
    build: () => bird({
      body: [0.34, 0.44, 0.42], bodyY: 0.4, bodyColor: '#d9c9a3',
      headColor: '#efe9dc', headSize: 0.26, neckLen: 0.02, beakLen: 0.08, beakColor: '#8a7355',
      legH: 0.14, legColor: '#b3a184',
    }),
  },
  {
    id: 'pheasant', name: 'Common Pheasant', habitats: ['field'], rarity: 0.55, fleeDist: 13, speed: 5, baseScale: 0.55, flies: true, swims: false,
    build: () => bird({
      body: [0.34, 0.34, 0.62], bodyY: 0.36, bodyColor: '#a3562e',
      headColor: '#2e5b4e', headSize: 0.17, neckLen: 0.14, beakLen: 0.1,
      legH: 0.22, tailUp: false,
    }),
  },
];

export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// ------------------------------------------------------------- size rolls

export interface SizeRoll {
  factor: number; // multiplier on baseScale
  label: string; // '', 'Tiny', 'Massive', ...
  bonus: number; // photo score multiplier for extremity
}

/**
 * Animals vary from tiny to massive on a bell curve — the extremes are rare
 * and worth more points. factor spans roughly 0.35x to 2.7x.
 */
export function rollSize(rand: () => number): SizeRoll {
  const g = (rand() + rand() + rand()) / 3; // bell-shaped in [0,1]
  const factor = Math.pow(2, (g - 0.5) * 2.9);
  return describeSize(factor);
}

export function describeSize(factor: number): SizeRoll {
  const e = Math.abs(Math.log2(factor));
  let label = '';
  if (factor <= 0.45) label = 'Teeny-tiny';
  else if (factor <= 0.62) label = 'Tiny';
  else if (factor <= 0.8) label = 'Small';
  else if (factor >= 2.3) label = 'MASSIVE';
  else if (factor >= 1.75) label = 'Huge';
  else if (factor >= 1.3) label = 'Big';
  const bonus = 1 + e * 1.6; // ~1x at normal size, up to ~3.3x at the extremes
  return { factor, label, bonus };
}

// ---------------------------------------------------------------- animals

type AIState = 'idle' | 'graze' | 'wander' | 'alert' | 'flee' | 'flyaway';

export class Animal {
  readonly def: SpeciesDef;
  readonly rig: AnimalRig;
  readonly size: SizeRoll;
  readonly scale: number;
  state: AIState = 'idle';
  private stateT = 0;
  private target = new THREE.Vector2();
  private heading = 0;
  private animT = 0;
  private moving = false;
  alive = true;

  constructor(def: SpeciesDef, x: number, z: number, size: SizeRoll, private world: World) {
    this.def = def;
    this.size = size;
    this.scale = def.baseScale * size.factor;
    this.rig = def.build();
    this.rig.group.scale.setScalar(this.scale);
    this.heading = Math.random() * Math.PI * 2;
    this.rig.group.rotation.y = this.heading;
    this.rig.group.position.set(x, this.groundY(x, z), z);
    this.enterState('idle');
  }

  get position(): THREE.Vector3 {
    return this.rig.group.position;
  }

  /** World-space point to aim photo detection at (roughly the body center). */
  get focusPoint(): THREE.Vector3 {
    return this.position.clone().add(new THREE.Vector3(0, this.rig.bodyHeight * this.scale, 0));
  }

  get boundRadius(): number {
    return Math.max(1.0, 1.6 * this.scale);
  }

  private groundY(x: number, z: number): number {
    if (this.def.swims) return Math.max(this.world.heightAt(x, z), WATER_Y - 0.08);
    return this.world.heightAt(x, z);
  }

  private enterState(s: AIState) {
    this.state = s;
    this.stateT = 0;
    if (s === 'wander') {
      // pick a target that stays in this animal's element
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 5 + Math.random() * 18;
        const tx = this.position.x + Math.cos(a) * d;
        const tz = this.position.z + Math.sin(a) * d;
        const h = this.world.heightAt(tx, tz);
        const wet = h < WATER_Y + 0.15;
        if (this.def.swims ? h < WATER_Y - 0.2 : !wet) {
          this.target.set(tx, tz);
          return;
        }
      }
      this.state = 'idle';
    }
  }

  spook(playerPos: THREE.Vector3) {
    if (this.state === 'flee' || this.state === 'flyaway' || this.state === 'alert') return;
    this.enterState('alert');
    const dx = this.position.x - playerPos.x;
    const dz = this.position.z - playerPos.z;
    this.heading = Math.atan2(dx, dz) + Math.PI; // face the player while alert
  }

  update(dt: number, playerPos: THREE.Vector3, playerNoise: number) {
    this.stateT += dt;
    this.animT += dt;
    const p = this.position;
    const distToPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);

    // detection: closer + noisier player = spook
    if (this.state !== 'flee' && this.state !== 'flyaway' && this.state !== 'alert') {
      if (distToPlayer < this.def.fleeDist * playerNoise) this.spook(playerPos);
    }

    this.moving = false;
    switch (this.state) {
      case 'idle':
        if (this.stateT > 1.5 + Math.random() * 2) this.enterState(Math.random() < 0.5 ? 'graze' : 'wander');
        break;
      case 'graze':
        if (this.stateT > 2 + Math.random() * 3) this.enterState(Math.random() < 0.6 ? 'wander' : 'idle');
        break;
      case 'alert': {
        // frozen, head up, facing the player — this is the photo window
        this.rig.group.rotation.y = this.heading;
        if (this.stateT > 1.4) {
          if (this.def.flies && !this.def.swims) this.enterState('flyaway');
          else this.enterState('flee');
          const dx = p.x - playerPos.x;
          const dz = p.z - playerPos.z;
          this.heading = Math.atan2(dx, dz);
        }
        break;
      }
      case 'flee': {
        const speed = this.def.speed * (0.75 + 0.25 * Math.min(1.6, this.size.factor));
        let nx = p.x + Math.sin(this.heading) * speed * dt;
        let nz = p.z + Math.cos(this.heading) * speed * dt;
        const h = this.world.heightAt(nx, nz);
        if (!this.def.swims && h < WATER_Y + 0.1) {
          this.heading += 1.8 * dt * 40 * dt + 0.8; // veer off water
          nx = p.x;
          nz = p.z;
        }
        [nx, nz] = this.world.collide(nx, nz, 0.5 * this.scale);
        p.set(nx, this.groundY(nx, nz), nz);
        this.rig.group.rotation.y = this.heading;
        this.moving = true;
        if (distToPlayer > this.def.fleeDist * 3 + 25 || this.stateT > 8) this.enterState('wander');
        break;
      }
      case 'flyaway': {
        p.x += Math.sin(this.heading) * this.def.speed * 1.6 * dt;
        p.z += Math.cos(this.heading) * this.def.speed * 1.6 * dt;
        p.y += 3.2 * dt;
        this.rig.group.rotation.y = this.heading;
        this.rig.group.rotation.x = -0.35;
        this.moving = true;
        if (this.stateT > 5) this.alive = false;
        break;
      }
      case 'wander': {
        const dx = this.target.x - p.x;
        const dz = this.target.y - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          this.enterState(Math.random() < 0.4 ? 'graze' : 'idle');
          break;
        }
        const want = Math.atan2(dx, dz);
        let dh = want - this.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        this.heading += THREE.MathUtils.clamp(dh, -2.4 * dt, 2.4 * dt);
        const speed = this.def.speed * 0.28;
        let nx = p.x + Math.sin(this.heading) * speed * dt;
        let nz = p.z + Math.cos(this.heading) * speed * dt;
        [nx, nz] = this.world.collide(nx, nz, 0.5 * this.scale);
        p.set(nx, this.groundY(nx, nz), nz);
        this.rig.group.rotation.y = this.heading;
        this.moving = true;
        break;
      }
    }

    // procedural animation
    const rate = this.moving ? (this.state === 'flee' || this.state === 'flyaway' ? 14 : 7) : 0;
    const amp = this.moving ? 0.55 : 0;
    this.rig.legs.forEach((leg, i) => {
      const phase = i % 2 === 0 ? 0 : Math.PI;
      leg.rotation.x = Math.sin(this.animT * rate + phase) * amp;
    });
    if (this.rig.tail) this.rig.tail.rotation.y = Math.sin(this.animT * 3.2) * 0.25;
    if (this.state === 'graze') {
      this.rig.head.rotation.x = THREE.MathUtils.lerp(this.rig.head.rotation.x, 0.85, dt * 5);
    } else if (this.state === 'alert') {
      this.rig.head.rotation.x = THREE.MathUtils.lerp(this.rig.head.rotation.x, -0.25, dt * 8);
    } else {
      this.rig.head.rotation.x = THREE.MathUtils.lerp(this.rig.head.rotation.x, Math.sin(this.animT * 1.4) * 0.06, dt * 4);
    }
  }
}

// ---------------------------------------------------------------- spawner

const MAX_ANIMALS = 14;
const SPAWN_MIN = 45;
const SPAWN_MAX = 110;
const DESPAWN = 150;

export class AnimalSpawner {
  readonly animals: Animal[] = [];
  private cooldown = 0;

  constructor(private world: World, private scene: THREE.Scene) {}

  update(dt: number, playerPos: THREE.Vector3, playerNoise: number) {
    this.cooldown -= dt;
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      a.update(dt, playerPos, playerNoise);
      const d = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z);
      if (!a.alive || d > DESPAWN) {
        this.scene.remove(a.rig.group);
        this.animals.splice(i, 1);
      }
    }
    if (this.animals.length < MAX_ANIMALS && this.cooldown <= 0) {
      this.cooldown = 0.6;
      for (let i = 0; i < 3 && this.animals.length < MAX_ANIMALS; i++) this.trySpawn(playerPos);
    }
  }

  private trySpawn(playerPos: THREE.Vector3) {
    const ang = Math.random() * Math.PI * 2;
    const dist = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const x = playerPos.x + Math.cos(ang) * dist;
    const z = playerPos.z + Math.sin(ang) * dist;
    if (Math.abs(x) > 570 || Math.abs(z) > 570) return;
    const habitat = this.world.habitatAt(x, z);
    const pool = SPECIES.filter((s) => s.habitats.includes(habitat));
    if (pool.length === 0) return;
    let totalW = 0;
    for (const s of pool) totalW += s.rarity;
    let pick = Math.random() * totalW;
    let def = pool[0];
    for (const s of pool) {
      pick -= s.rarity;
      if (pick <= 0) {
        def = s;
        break;
      }
    }
    // cap flocks of the same species
    if (this.animals.filter((a) => a.def.id === def.id).length >= 3) return;
    if (def.swims && this.world.heightAt(x, z) > WATER_Y - 0.15) return;
    const animal = new Animal(def, x, z, rollSize(Math.random), this.world);
    this.scene.add(animal.rig.group);
    this.animals.push(animal);
  }

  clear() {
    for (const a of this.animals) this.scene.remove(a.rig.group);
    this.animals.length = 0;
  }
}
