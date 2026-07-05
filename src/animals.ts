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
  flies: boolean; // flees by flying away (photos of it in flight earn a bonus)
  swims: boolean; // lives on the water surface
  aquatic?: boolean; // underwater — only appears while the player is wading
  temperament?: 'friendly' | 'shy'; // friendly ones come to you; default = shy
  dino?: boolean; // 65 million years late, still showed up for the photo
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
  breastColor?: string; // robin's red breast
}

/** Generic bird. +Z is forward. */
function bird(o: BirdOpts): AnimalRig {
  const g = new THREE.Group();
  const [bw, bh, bd] = o.body;
  const body = box(bw, bh, bd, o.bodyColor);
  body.position.y = o.bodyY;
  body.rotation.x = -0.15;
  g.add(body);
  if (o.breastColor) {
    const breast = box(bw * 0.8, bh * 0.62, bd * 0.3, o.breastColor);
    breast.position.set(0, o.bodyY - bh * 0.12, bd * 0.32);
    breast.rotation.x = -0.15;
    g.add(breast);
  }

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

/** Town human. Legs + arms swing while walking. */
function villager(): AnimalRig {
  const g = new THREE.Group();
  const shirts = ['#c96a4a', '#5a7fa8', '#7a9a5a', '#b08ab5', '#c9b14e', '#8a6a52'];
  const trousers = ['#4a4a55', '#5a4a3a', '#3a4a44'];
  const skins = ['#e8c49a', '#c99a6e', '#a5744a', '#8a5c38'];
  const hairs = ['#3a2e22', '#6e5233', '#b3a184', '#8a8a8a', '#c96a2e'];
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  const shirt = pick(shirts);
  const trouser = pick(trousers);
  const skin = pick(skins);

  const body = box(0.52, 0.68, 0.3, shirt);
  body.position.y = 1.19;
  g.add(body);

  const head = new THREE.Group();
  head.position.set(0, 1.53, 0.02);
  const skull = box(0.3, 0.32, 0.3, skin);
  skull.position.y = 0.18;
  head.add(skull);
  const hair = box(0.32, 0.12, 0.32, pick(hairs));
  hair.position.y = 0.37;
  head.add(hair);
  g.add(head);

  const legs: THREE.Object3D[] = [];
  const addLimb = (x: number, y: number, w: number, len: number, color: string) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limb = box(w, len, w, color);
    limb.position.y = -len / 2;
    pivot.add(limb);
    g.add(pivot);
    legs.push(pivot);
  };
  addLimb(-0.13, 0.86, 0.16, 0.84, trouser); // left leg
  addLimb(0.13, 0.86, 0.16, 0.84, trouser); // right leg
  addLimb(0.34, 1.48, 0.11, 0.62, shirt); // right arm (opposite phase of right leg)
  addLimb(-0.34, 1.48, 0.11, 0.62, shirt); // left arm

  return { group: g, legs, head, tail: null, bodyHeight: 1.3 };
}

// -- dinosaur builders (built at rough real-world meters; rolls only go UP) --

/** Two mighty legs, two adorable arms: the classic theropod chassis. */
function biped(o: {
  body: [number, number, number];
  bodyY: number;
  color: string;
  belly?: string;
  head: [number, number, number];
  headUp: number;
  headFwd: number;
  neckLen?: number;
  teeth?: boolean;
  domeHead?: boolean;
  crest?: number; // parasaurolophus tube, in meters of swagger
  legH: number;
  legW: number;
  armLen: number;
  tail: [number, number, number];
}): AnimalRig {
  const g = new THREE.Group();
  const [bw, bh, bd] = o.body;
  const body = box(bw, bh, bd, o.color);
  body.position.y = o.bodyY;
  body.rotation.x = -0.18; // chest up, tail down — proper theropod posture
  g.add(body);
  if (o.belly) {
    const belly = box(bw * 0.8, bh * 0.5, bd * 0.7, o.belly);
    belly.position.set(0, o.bodyY - bh * 0.3, bd * 0.05);
    g.add(belly);
  }

  const head = new THREE.Group();
  head.position.set(0, o.bodyY + o.headUp, bd / 2 + o.headFwd);
  const neck = box(bw * 0.45, o.neckLen ?? bh * 0.6, bw * 0.5, o.color);
  neck.position.set(0, -(o.neckLen ?? bh * 0.6) * 0.35, -0.1);
  head.add(neck);
  const [hw, hh, hd] = o.head;
  const skull = box(hw, hh, hd, o.color);
  skull.position.set(0, hh * 0.25, hd * 0.3);
  head.add(skull);
  if (o.teeth) {
    for (const side of [-1, 1]) {
      const fangs = box(hw * 0.12, hh * 0.28, hd * 0.7, '#efe9dc');
      fangs.position.set(side * hw * 0.38, -hh * 0.12, hd * 0.35);
      head.add(fangs);
    }
  }
  if (o.domeHead) {
    const dome = box(hw * 0.85, hh * 0.7, hd * 0.6, '#8a7a5e');
    dome.position.set(0, hh * 0.65, hd * 0.1);
    head.add(dome);
  }
  if (o.crest) {
    const crest = box(hw * 0.3, hw * 0.3, o.crest, o.color);
    crest.position.set(0, hh * 0.55, -o.crest * 0.35);
    crest.rotation.x = -0.5; // sweeps back like a hood ornament
    head.add(crest);
  }
  g.add(head);

  const legs: THREE.Object3D[] = [];
  const addLimb = (x: number, y: number, z: number, w: number, len: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const limb = box(w, len, w, o.color);
    limb.position.y = -len / 2;
    pivot.add(limb);
    g.add(pivot);
    legs.push(pivot);
  };
  addLimb(-bw * 0.38, o.bodyY - bh * 0.3, 0, o.legW, o.legH); // left leg
  addLimb(bw * 0.38, o.bodyY - bh * 0.3, 0, o.legW, o.legH); // right leg
  addLimb(bw * 0.45, o.bodyY + bh * 0.15, bd * 0.32, o.legW * 0.35, o.armLen); // rrright arm
  addLimb(-bw * 0.45, o.bodyY + bh * 0.15, bd * 0.32, o.legW * 0.35, o.armLen); // left arm

  const tail = new THREE.Group();
  tail.position.set(0, o.bodyY + bh * 0.05, -bd / 2);
  const [tw, th, td] = o.tail;
  const tailMesh = box(tw, th, td, o.color);
  tailMesh.position.set(0, -th * 0.15, -td / 2);
  tailMesh.rotation.x = 0.12;
  tail.add(tailMesh);
  const tailTip = box(tw * 0.5, th * 0.5, td * 0.6, o.color);
  tailTip.position.set(0, -th * 0.2, -td - td * 0.25);
  tail.add(tailTip);
  g.add(tail);

  return { group: g, legs, head, tail, bodyHeight: o.bodyY };
}

function trex(): AnimalRig {
  return biped({
    body: [1.4, 1.6, 3.2], bodyY: 2.4, color: '#6b7248', belly: '#a89c74',
    head: [0.9, 1.0, 1.5], headUp: 1.5, headFwd: 0.5, neckLen: 1.0, teeth: true,
    legH: 2.0, legW: 0.55, armLen: 0.7, // those arms never skip leg day, because there is only leg day
    tail: [0.8, 0.9, 3.4],
  });
}

function pachycephalosaurus(): AnimalRig {
  return biped({
    body: [0.9, 1.1, 2.2], bodyY: 1.6, color: '#8a6a52', belly: '#bfa77e',
    head: [0.5, 0.6, 0.8], headUp: 1.0, headFwd: 0.3, neckLen: 0.7, domeHead: true,
    legH: 1.3, legW: 0.35, armLen: 0.6,
    tail: [0.5, 0.6, 2.2],
  });
}

function parasaurolophus(): AnimalRig {
  return biped({
    body: [1.1, 1.3, 2.8], bodyY: 1.9, color: '#7a8a5a', belly: '#c2b98a',
    head: [0.5, 0.7, 1.0], headUp: 1.3, headFwd: 0.4, neckLen: 0.9, crest: 1.4,
    legH: 1.6, legW: 0.45, armLen: 0.9,
    tail: [0.6, 0.8, 2.8],
  });
}

function diplodocus(): AnimalRig {
  const rig = quadruped({
    body: [1.8, 1.9, 5.5], bodyY: 2.6, bodyColor: '#8a9070',
    head: [0.55, 0.5, 0.9], headFwd: 0.4, headUp: 3.2, // head office is upstairs
    legH: 1.9, legW: 0.6,
    tail: { size: [0.7, 0.7, 5.0], up: 0.3 },
  });
  // stretch a proper neck up to that distant head
  const neck = box(0.55, 3.6, 0.7, '#8a9070');
  neck.position.set(0, -1.7, -0.4);
  neck.rotation.x = 0.25;
  rig.head.add(neck);
  return rig;
}

function stegosaurus(): AnimalRig {
  const rig = quadruped({
    body: [1.6, 1.8, 4.2], bodyY: 1.8, bodyColor: '#7a6a4a',
    head: [0.5, 0.5, 0.8], headFwd: 0.4, headUp: -0.4, // head low, hips high — fashion icon
    legH: 1.2, legW: 0.5,
    tail: { size: [0.6, 0.7, 2.8], up: 0.4 },
  });
  // the famous back plates, two staggered rows
  for (let i = 0; i < 5; i++) {
    for (const side of [-0.18, 0.18]) {
      const plate = box(0.15, 1.0 + Math.sin((i / 4) * Math.PI) * 0.5, 0.8, '#a5543a');
      plate.position.set(side, 2.7 + Math.sin((i / 4) * Math.PI) * 0.5, 1.6 - i * 0.95 + (side > 0 ? -0.4 : 0));
      plate.rotation.z = side * 0.1;
      rig.group.add(plate);
    }
  }
  // thagomizer (tail spikes)
  if (rig.tail) {
    for (const side of [-1, 1]) {
      const spike = box(0.12, 0.7, 0.12, '#e8e2d4');
      spike.position.set(side * 0.3, 0.4, -2.6);
      spike.rotation.z = side * 0.5;
      rig.tail.add(spike);
    }
  }
  return rig;
}

function triceratops(): AnimalRig {
  const rig = quadruped({
    body: [1.7, 1.7, 4.0], bodyY: 1.7, bodyColor: '#8a7a5e',
    head: [1.0, 0.9, 1.2], headFwd: 0.5, headUp: 0.3,
    snout: [0.5, 0.5, 0.6, '#a89c74'],
    legH: 1.2, legW: 0.55,
    tail: { size: [0.5, 0.6, 2.0] },
  });
  // the frill: a big bony billboard
  const frill = box(1.8, 1.6, 0.25, '#9a8768');
  frill.position.set(0, 0.9, -0.3);
  frill.rotation.x = -0.25;
  rig.head.add(frill);
  // two brow horns + one nose horn
  for (const side of [-1, 1]) {
    const horn = box(0.15, 0.15, 1.1, '#efe9dc');
    horn.position.set(side * 0.4, 0.6, 0.9);
    horn.rotation.x = -0.35;
    rig.head.add(horn);
  }
  const noseHorn = box(0.15, 0.5, 0.15, '#efe9dc');
  noseHorn.position.set(0, 0.35, 1.15);
  rig.head.add(noseHorn);
  return rig;
}

/** The pteranodon soars — wings out, legs optional, drama mandatory. */
function pteranodon(): AnimalRig {
  const g = new THREE.Group();
  const body = box(0.5, 0.5, 1.6, '#a5764a');
  body.position.y = 0.3;
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.9);
  const skull = box(0.35, 0.35, 0.7, '#a5764a');
  head.add(skull);
  const beak = box(0.18, 0.15, 1.1, '#c9973c');
  beak.position.set(0, -0.05, 0.8);
  head.add(beak);
  const crest = box(0.14, 0.2, 0.9, '#8a5c38');
  crest.position.set(0, 0.25, -0.45);
  crest.rotation.x = 0.35;
  head.add(crest);
  g.add(head);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.25, 0.45, 0.1);
    const wing = box(2.8, 0.08, 1.0, '#b98a5e');
    wing.position.x = side * 1.4;
    pivot.add(wing);
    const tip = box(1.2, 0.06, 0.6, '#b98a5e');
    tip.position.set(side * 3.2, 0, -0.15);
    tip.rotation.z = side * 0.1;
    pivot.add(tip);
    g.add(pivot);
    wings.push(pivot); // stored as "legs" so the walk-cycle code flaps them
  }
  return { group: g, legs: wings, head, tail: null, bodyHeight: 0.4 };
}

/** Underwater fish — appears while the player wades. */
function fish(bodyColor: string, finColor: string, len = 0.55): AnimalRig {
  const g = new THREE.Group();
  const body = box(0.14, 0.22, len, bodyColor);
  g.add(body);
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0, len / 2);
  g.add(headPivot);
  const tail = new THREE.Group();
  tail.position.set(0, 0, -len / 2);
  const fin = box(0.03, 0.2, 0.18, finColor);
  fin.position.set(0, 0, -0.09);
  tail.add(fin);
  g.add(tail);
  const dorsal = box(0.03, 0.12, 0.2, finColor);
  dorsal.position.set(0, 0.15, -0.05);
  g.add(dorsal);
  return { group: g, legs: [], head: headPivot, tail, bodyHeight: 0 };
}

// -- the roster: 30 real species ---------------------------------------------

export const SPECIES: SpeciesDef[] = [
  {
    id: 'rabbit', name: 'European Rabbit', habitats: ['field'], rarity: 1.0, fleeDist: 8, speed: 7, baseScale: 0.55, flies: false, swims: false,
    build: () => quadruped({
      body: [0.42, 0.4, 0.62], bodyY: 0.38, bodyColor: '#9a8468',
      head: [0.3, 0.3, 0.32], headFwd: 0.05, headUp: 0.22,
      ears: [0.09, 0.34, 0.09], earColor: '#8a7458',
      legH: 0.24, tail: { size: [0.14, 0.14, 0.14], color: '#e8e2d4' },
    }),
  },
  {
    id: 'red_fox', name: 'Red Fox', habitats: ['forest', 'field'], rarity: 0.5, fleeDist: 13, speed: 9, baseScale: 0.8, flies: false, swims: false,
    build: () => quadruped({
      body: [0.42, 0.42, 0.95], bodyY: 0.52, bodyColor: '#c96a2e',
      head: [0.32, 0.3, 0.34], headFwd: 0.08, headUp: 0.25,
      snout: [0.14, 0.12, 0.2, '#e8e2d4'], ears: [0.11, 0.2, 0.11],
      legH: 0.4, legColor: '#3a3230',
      tail: { size: [0.2, 0.2, 0.62], color: '#c96a2e' },
    }),
  },
  {
    id: 'roe_deer', name: 'Roe Deer Buck', habitats: ['field', 'forest'], rarity: 0.45, fleeDist: 24, speed: 11, baseScale: 1.15, flies: false, swims: false,
    build: () => quadruped({
      body: [0.5, 0.55, 1.1], bodyY: 0.85, bodyColor: '#b08a5e',
      head: [0.3, 0.34, 0.4], headFwd: 0.12, headUp: 0.55,
      snout: [0.14, 0.13, 0.18, '#4a3a2c'], ears: [0.1, 0.22, 0.12],
      legH: 0.72, legW: 0.09, antlers: true, // the gentleman wears his crown
      tail: { size: [0.16, 0.18, 0.1], color: '#e8e2d4' },
    }),
  },
  {
    id: 'roe_deer_doe', name: 'Roe Deer Doe', habitats: ['field', 'forest'], rarity: 0.6, fleeDist: 24, speed: 11, baseScale: 1.08, flies: false, swims: false,
    build: () => quadruped({
      body: [0.48, 0.52, 1.05], bodyY: 0.82, bodyColor: '#b8916a',
      head: [0.28, 0.32, 0.38], headFwd: 0.12, headUp: 0.52,
      snout: [0.13, 0.12, 0.17, '#4a3a2c'], ears: [0.1, 0.22, 0.12],
      legH: 0.7, legW: 0.085, // no antlers — she doesn't need them
      tail: { size: [0.15, 0.17, 0.1], color: '#e8e2d4' },
    }),
  },
  {
    id: 'wild_boar', name: 'Wild Boar', habitats: ['forest'], rarity: 0.28, fleeDist: 10, speed: 8, baseScale: 1.0, flies: false, swims: false,
    build: () => quadruped({
      body: [0.58, 0.62, 1.2], bodyY: 0.62, bodyColor: '#4d4038',
      head: [0.42, 0.44, 0.44], headFwd: 0.05, headUp: 0.05,
      snout: [0.18, 0.16, 0.22, '#8a7263'], ears: [0.12, 0.16, 0.16],
      legH: 0.4, legW: 0.12,
      tail: { size: [0.06, 0.06, 0.3] },
    }),
  },
  {
    id: 'pig', name: 'Domestic Pig', habitats: ['town', 'field'], rarity: 0.6, fleeDist: 6, speed: 5, baseScale: 0.9, flies: false, swims: false,
    build: () => quadruped({
      body: [0.56, 0.56, 1.05], bodyY: 0.52, bodyColor: '#e8a8a0',
      head: [0.38, 0.38, 0.36], headFwd: 0.04, headUp: 0.04,
      snout: [0.18, 0.14, 0.14, '#d98a84'], ears: [0.12, 0.14, 0.15], earColor: '#d98a84',
      legH: 0.32, legW: 0.11,
      tail: { size: [0.05, 0.05, 0.18], color: '#d98a84' },
    }),
  },
  {
    id: 'badger', name: 'European Badger', habitats: ['forest'], rarity: 0.22, fleeDist: 9, speed: 6, baseScale: 0.7, flies: false, swims: false,
    build: () => quadruped({
      body: [0.5, 0.38, 0.85], bodyY: 0.32, bodyColor: '#77787c',
      head: [0.3, 0.26, 0.36], headColor: '#e8e6e0', headFwd: 0.04, headUp: 0.08,
      snout: [0.12, 0.11, 0.14, '#2e2e30'], ears: [0.07, 0.08, 0.12],
      legH: 0.2, legW: 0.11, legColor: '#2e2e30', stripe: true,
      tail: { size: [0.12, 0.12, 0.24], color: '#9a9aa0' },
    }),
  },
  {
    id: 'red_squirrel', name: 'Red Squirrel', habitats: ['forest'], rarity: 0.85, fleeDist: 6, speed: 6, baseScale: 0.32, flies: false, swims: false,
    build: () => quadruped({
      body: [0.3, 0.32, 0.5], bodyY: 0.3, bodyColor: '#b3552e',
      head: [0.24, 0.24, 0.26], headFwd: 0.04, headUp: 0.2,
      ears: [0.06, 0.14, 0.08], legH: 0.18,
      tail: { size: [0.16, 0.34, 0.4], up: 0.2, color: '#c26a3e' },
    }),
  },
  {
    id: 'grey_squirrel', name: 'Grey Squirrel', habitats: ['forest', 'town'], rarity: 0.7, fleeDist: 5, speed: 6, baseScale: 0.34, flies: false, swims: false,
    build: () => quadruped({
      body: [0.3, 0.32, 0.5], bodyY: 0.3, bodyColor: '#8a8a90',
      head: [0.24, 0.24, 0.26], headFwd: 0.04, headUp: 0.2,
      ears: [0.06, 0.12, 0.08], legH: 0.18,
      tail: { size: [0.16, 0.34, 0.42], up: 0.2, color: '#a5a5ab' },
    }),
  },
  {
    id: 'hedgehog', name: 'Hedgehog', habitats: ['field', 'forest'], rarity: 0.45, fleeDist: 4, speed: 1.6, baseScale: 0.35, flies: false, swims: false,
    build: () => quadruped({
      body: [0.42, 0.32, 0.5], bodyY: 0.2, bodyColor: '#6b5b48',
      head: [0.2, 0.18, 0.22], headColor: '#a5906f', headFwd: 0.03, headUp: -0.02,
      snout: [0.08, 0.08, 0.1, '#3a3230'], legH: 0.08, legW: 0.06,
    }),
  },
  {
    id: 'sheep', name: 'Sheep', habitats: ['field', 'town'], rarity: 0.9, fleeDist: 6, speed: 5, baseScale: 0.95, flies: false, swims: false,
    build: () => quadruped({
      body: [0.62, 0.6, 1.0], bodyY: 0.68, bodyColor: '#e9e4d5',
      head: [0.26, 0.3, 0.34], headColor: '#3a3230', headFwd: 0.08, headUp: 0.3,
      ears: [0.1, 0.08, 0.14], earColor: '#3a3230',
      legH: 0.44, legW: 0.09, legColor: '#3a3230',
      tail: { size: [0.14, 0.16, 0.1] },
    }),
  },
  {
    id: 'cow', name: 'Cow', habitats: ['field'], rarity: 0.65, fleeDist: 5, speed: 4, baseScale: 1.5, flies: false, swims: false,
    build: () => quadruped({
      body: [0.7, 0.72, 1.5], bodyY: 0.95, bodyColor: '#e9e4d5',
      head: [0.36, 0.4, 0.42], headColor: '#4d4038', headFwd: 0.1, headUp: 0.25,
      snout: [0.24, 0.16, 0.14, '#caa08a'], ears: [0.14, 0.09, 0.2], earColor: '#4d4038',
      legH: 0.62, legW: 0.13,
      tail: { size: [0.07, 0.5, 0.07], up: 0.25, color: '#4d4038' },
    }),
  },
  {
    id: 'horse', name: 'Horse', habitats: ['field'], rarity: 0.5, fleeDist: 8, speed: 12, baseScale: 1.6, flies: false, swims: false,
    build: () => quadruped({
      body: [0.6, 0.7, 1.5], bodyY: 1.05, bodyColor: '#7a5230',
      head: [0.28, 0.42, 0.52], headFwd: 0.18, headUp: 0.62,
      snout: [0.18, 0.2, 0.2, '#5a3c22'], ears: [0.08, 0.14, 0.1],
      legH: 0.78, legW: 0.1, legColor: '#4a3320',
      tail: { size: [0.12, 0.55, 0.12], up: 0.28, color: '#3a2a18' },
    }),
  },
  {
    id: 'chicken', name: 'Chicken', habitats: ['town'], rarity: 1.0, fleeDist: 3, speed: 3.5, baseScale: 0.42, flies: false, swims: false,
    build: () => bird({
      body: [0.4, 0.42, 0.55], bodyY: 0.42, bodyColor: '#ece7da',
      headSize: 0.2, neckLen: 0.12, beakLen: 0.12, legH: 0.24, tailUp: true,
    }),
  },
  {
    id: 'cat', name: 'House Cat', habitats: ['town'], rarity: 0.7, fleeDist: 8, speed: 7, baseScale: 0.55, flies: false, swims: false, temperament: 'friendly',
    build: () => quadruped({
      body: [0.32, 0.34, 0.7], bodyY: 0.38, bodyColor: '#8a8a90',
      head: [0.28, 0.26, 0.26], headFwd: 0.04, headUp: 0.24,
      ears: [0.09, 0.12, 0.1], legH: 0.28, legW: 0.07,
      tail: { size: [0.08, 0.08, 0.5], up: 0.14 },
    }),
  },
  {
    id: 'black_cat', name: 'Black Cat', habitats: ['town'], rarity: 0.45, fleeDist: 8, speed: 7, baseScale: 0.55, flies: false, swims: false, temperament: 'friendly',
    build: () => quadruped({
      body: [0.32, 0.34, 0.7], bodyY: 0.38, bodyColor: '#2a2a2e',
      head: [0.28, 0.26, 0.26], headFwd: 0.04, headUp: 0.24,
      ears: [0.09, 0.12, 0.1], legH: 0.28, legW: 0.07,
      tail: { size: [0.08, 0.08, 0.5], up: 0.14 },
    }),
  },
  {
    id: 'ginger_cat', name: 'Ginger Cat', habitats: ['town', 'field'], rarity: 0.4, fleeDist: 8, speed: 7, baseScale: 0.55, flies: false, swims: false, temperament: 'friendly',
    build: () => quadruped({
      body: [0.32, 0.34, 0.7], bodyY: 0.38, bodyColor: '#d98a3c',
      head: [0.28, 0.26, 0.26], headFwd: 0.04, headUp: 0.24,
      ears: [0.09, 0.12, 0.1], legH: 0.28, legW: 0.07, legColor: '#e8e2d4',
      tail: { size: [0.08, 0.08, 0.5], up: 0.14 },
    }),
  },
  {
    id: 'dog', name: 'Farm Dog', habitats: ['town', 'field'], rarity: 0.55, fleeDist: 10, speed: 9, baseScale: 0.75, flies: false, swims: false, temperament: 'friendly',
    build: () => quadruped({
      body: [0.38, 0.42, 0.85], bodyY: 0.5, bodyColor: '#a5764a',
      head: [0.3, 0.3, 0.32], headColor: '#8a5c38', headFwd: 0.06, headUp: 0.26,
      snout: [0.14, 0.12, 0.18, '#5a4630'], ears: [0.1, 0.16, 0.11], earColor: '#5a4630',
      legH: 0.36, legW: 0.09, legColor: '#e8e2d4',
      tail: { size: [0.08, 0.08, 0.4], up: 0.2 },
    }),
  },
  {
    id: 'mallard', name: 'Mallard Duck', habitats: ['water'], rarity: 0.9, fleeDist: 6, speed: 4, baseScale: 0.5, flies: true, swims: true,
    build: () => bird({
      body: [0.42, 0.36, 0.72], bodyY: 0.28, bodyColor: '#9a8468',
      headColor: '#2e6b3e', headSize: 0.22, neckLen: 0.1, beakLen: 0.18, beakColor: '#e0c23c',
      legH: 0.14, legColor: '#d97f36',
    }),
  },
  {
    id: 'mute_swan', name: 'Mute Swan', habitats: ['water'], rarity: 0.35, fleeDist: 9, speed: 5, baseScale: 0.95, flies: true, swims: true,
    build: () => bird({
      body: [0.5, 0.42, 0.9], bodyY: 0.32, bodyColor: '#efeade',
      headSize: 0.18, neckLen: 0.48, neckColor: '#efeade', beakLen: 0.16, beakColor: '#d9762e',
      legH: 0.12, legColor: '#3a3a3a',
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
    id: 'kingfisher', name: 'Kingfisher', habitats: ['water'], rarity: 0.18, fleeDist: 11, speed: 8, baseScale: 0.28, flies: true, swims: false,
    build: () => bird({
      body: [0.24, 0.26, 0.4], bodyY: 0.3, bodyColor: '#2e7fb5',
      headColor: '#2e7fb5', breastColor: '#d97f36', headSize: 0.15, neckLen: 0.02,
      beakLen: 0.22, beakColor: '#2a2a2e', legH: 0.1, legColor: '#d9762e',
    }),
  },
  {
    id: 'barn_owl', name: 'Barn Owl', habitats: ['forest'], rarity: 0.2, fleeDist: 10, speed: 7, baseScale: 0.5, flies: true, swims: false,
    build: () => bird({
      body: [0.34, 0.44, 0.42], bodyY: 0.4, bodyColor: '#d9c9a3',
      headColor: '#efe9dc', headSize: 0.26, neckLen: 0.02, beakLen: 0.08, beakColor: '#8a7355',
      legH: 0.14, legColor: '#b3a184',
    }),
  },
  {
    id: 'pheasant', name: 'Common Pheasant', habitats: ['field'], rarity: 0.55, fleeDist: 8, speed: 5, baseScale: 0.55, flies: true, swims: false,
    build: () => bird({
      body: [0.34, 0.34, 0.62], bodyY: 0.36, bodyColor: '#a3562e',
      headColor: '#2e5b4e', headSize: 0.17, neckLen: 0.14, beakLen: 0.1,
      legH: 0.22, tailUp: false,
    }),
  },
  {
    id: 'blackbird', name: 'Blackbird', habitats: ['field', 'town', 'forest'], rarity: 0.9, fleeDist: 5, speed: 5, baseScale: 0.3, flies: true, swims: false,
    build: () => bird({
      body: [0.26, 0.26, 0.42], bodyY: 0.26, bodyColor: '#26262a',
      headSize: 0.14, neckLen: 0.04, beakLen: 0.1, beakColor: '#e0a83c',
      legH: 0.14, legColor: '#5a4630', tailUp: true,
    }),
  },
  {
    id: 'robin', name: 'European Robin', habitats: ['forest', 'town'], rarity: 0.75, fleeDist: 4, speed: 5, baseScale: 0.22, flies: true, swims: false,
    build: () => bird({
      body: [0.24, 0.24, 0.36], bodyY: 0.24, bodyColor: '#8a6f52',
      breastColor: '#d95c30', headSize: 0.14, neckLen: 0.02, beakLen: 0.07, beakColor: '#3a3230',
      legH: 0.12, legColor: '#5a4630', tailUp: true,
    }),
  },
  {
    id: 'magpie', name: 'Magpie', habitats: ['field', 'town'], rarity: 0.6, fleeDist: 7, speed: 6, baseScale: 0.4, flies: true, swims: false,
    build: () => bird({
      body: [0.28, 0.28, 0.5], bodyY: 0.28, bodyColor: '#efeade',
      headColor: '#26262a', breastColor: '#26262a', headSize: 0.15, neckLen: 0.04,
      beakLen: 0.1, beakColor: '#26262a', legH: 0.16, legColor: '#3a3a3a', tailUp: true,
    }),
  },
  {
    id: 'crow', name: 'Carrion Crow', habitats: ['field', 'forest'], rarity: 0.65, fleeDist: 9, speed: 6, baseScale: 0.42, flies: true, swims: false,
    build: () => bird({
      body: [0.3, 0.3, 0.52], bodyY: 0.3, bodyColor: '#1e1e24',
      headSize: 0.16, neckLen: 0.04, beakLen: 0.14, beakColor: '#2a2a2e',
      legH: 0.16, legColor: '#2a2a2e',
    }),
  },
  {
    id: 'villager', name: 'Villager', habitats: ['town'], rarity: 0.9, fleeDist: 2, speed: 3, baseScale: 1.0, flies: false, swims: false,
    build: villager,
  },
  {
    id: 'carp', name: 'Common Carp', habitats: ['water'], rarity: 0.8, fleeDist: 4, speed: 3.5, baseScale: 0.7, flies: false, swims: false, aquatic: true,
    build: () => fish('#a58a4a', '#8a6f3a'),
  },
  {
    id: 'pike', name: 'Northern Pike', habitats: ['water'], rarity: 0.3, fleeDist: 5, speed: 6, baseScale: 1.0, flies: false, swims: false, aquatic: true,
    build: () => fish('#5a7a4a', '#46603a', 0.75),
  },
  // ---- the Late Cretaceous wing of the photo book ----
  {
    id: 'trex', name: 'Tyrannosaurus Rex', habitats: ['field', 'forest'], rarity: 0.08, fleeDist: 0, speed: 7, baseScale: 1.0, flies: false, swims: false, dino: true,
    build: trex,
  },
  {
    id: 'diplodocus', name: 'Diplodocus', habitats: ['field'], rarity: 0.1, fleeDist: 0, speed: 3, baseScale: 1.0, flies: false, swims: false, dino: true,
    build: diplodocus,
  },
  {
    id: 'stegosaurus', name: 'Stegosaurus', habitats: ['field', 'forest'], rarity: 0.12, fleeDist: 0, speed: 3.5, baseScale: 1.0, flies: false, swims: false, dino: true,
    build: stegosaurus,
  },
  {
    id: 'triceratops', name: 'Triceratops', habitats: ['field'], rarity: 0.12, fleeDist: 0, speed: 4.5, baseScale: 1.0, flies: false, swims: false, dino: true,
    build: triceratops,
  },
  {
    id: 'parasaurolophus', name: 'Parasaurolophus', habitats: ['field', 'forest'], rarity: 0.14, fleeDist: 0, speed: 5.5, baseScale: 1.0, flies: false, swims: false, dino: true,
    build: parasaurolophus,
  },
  {
    id: 'pachycephalosaurus', name: 'Pachycephalosaurus', habitats: ['field', 'forest'], rarity: 0.14, fleeDist: 0, speed: 6, baseScale: 1.0, flies: false, swims: false, dino: true,
    build: pachycephalosaurus,
  },
  {
    id: 'pteranodon', name: 'Pteranodon', habitats: ['field'], rarity: 0.16, fleeDist: 0, speed: 8, baseScale: 1.0, flies: true, swims: false, dino: true,
    build: pteranodon,
  },
];

export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// ------------------------------------------------------------- size rolls

export interface SizeRoll {
  factor: number; // multiplier on baseScale
  label: string; // '', 'Tiny', 'MASSIVE', ...
  bonus: number; // photo score multiplier for extremity
}

/** No animal renders smaller than a regular crow, no matter the roll — a
 *  handful of pixels isn't a photo subject (or a spottable zombie). */
export const MIN_VISUAL_SCALE = 0.42;

/**
 * Animals vary from teeny-tiny to way-larger-than-life on a bell curve —
 * the extremes are rare and worth more points. factor spans ~0.5x to ~4.6x.
 * `bias` (0..1) drags the curve toward the big end (easy mode).
 */
export function rollSize(rand: () => number, bias = 0): SizeRoll {
  let g = (rand() + rand() + rand()) / 3; // bell-shaped in [0,1]
  g += bias * (1 - g);
  const factor = Math.max(0.5, Math.pow(2, (g - 0.5) * 4.4));
  return describeSize(factor);
}

/**
 * Dinosaur sizes only go one way: up. Factor 1 (already huge) to ~3.6
 * (make-your-own-earthquake), with the top end rarer.
 */
export function rollDinoSize(rand: () => number): SizeRoll {
  const factor = 1 + rand() * rand() * 2.6;
  return describeSize(factor);
}

export function describeSize(factor: number): SizeRoll {
  const e = Math.abs(Math.log2(factor));
  let label = '';
  if (factor <= 0.55) label = 'Teeny-tiny';
  else if (factor <= 0.68) label = 'Tiny';
  else if (factor <= 0.82) label = 'Small';
  else if (factor >= 3.4) label = 'MASSIVE';
  else if (factor >= 2.2) label = 'Huge';
  else if (factor >= 1.45) label = 'Big';
  const bonus = 1 + e * 1.5; // ~1x at normal size, up to ~4.3x at the extremes
  return { factor, label, bonus };
}

// ---------------------------------------------------------------- animals

type AIState = 'idle' | 'graze' | 'wander' | 'alert' | 'flee' | 'flyaway' | 'approach' | 'flyover';

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
  /** Set when the bird is sitting in a tree; cleared when it takes off. */
  perchY: number | null = null;
  private flyoverY = 0;
  // -- zombie mode --
  zombie = false;
  zombieSpeed = 1; // difficulty multiplier, updated by ZombieMode
  zombieStun = 0; // seconds of knockback stun after clawing the player
  // -- apex predator paperwork --
  huntTarget: Animal | null = null; // what the T. rex has decided is lunch
  justKilled: Animal | null = null; // set for one frame so the spawner can splatter
  anchor: { x: number; z: number } | null = null; // T. rex loiters near its last kill
  trexTimer = 12; // seconds until the next hunt

  constructor(def: SpeciesDef, x: number, z: number, size: SizeRoll, private world: World) {
    this.def = def;
    this.size = size;
    // labels/points come from the roll; the rendered size is floored so even
    // a teeny-tiny robin stays clearly visible on screen
    this.scale = Math.max(MIN_VISUAL_SCALE, def.baseScale * size.factor);
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
    return Math.max(0.55, 1.6 * this.scale);
  }

  /** Small specimens move slower, big ones faster. */
  get speedScale(): number {
    return THREE.MathUtils.clamp(0.35 + 0.6 * this.size.factor, 0.5, 1.5);
  }

  /** Unit vector this animal is facing (+Z forward, rotated by heading). */
  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.rig.group.rotation.y), 0, Math.cos(this.rig.group.rotation.y));
  }

  /** In the air right now? (bonus points for birds photographed in flight) */
  get flying(): boolean {
    return this.state === 'flyaway' || this.state === 'flyover';
  }

  /** Put this bird on a tree: it sits there until spooked. */
  perchAt(y: number) {
    this.perchY = y;
    this.state = 'idle';
    this.position.y = y;
  }

  /** Send this bird on a straight pass through the sky above the player. */
  startFlyover(heading: number, altitude: number) {
    this.state = 'flyover';
    this.stateT = 0;
    this.heading = heading;
    this.flyoverY = altitude;
    this.position.y = altitude;
    this.rig.group.rotation.y = heading;
  }

  private groundY(x: number, z: number): number {
    if (this.perchY !== null) return this.perchY;
    if (this.def.aquatic) return WATER_Y - 0.4;
    if (this.def.swims) return Math.max(this.world.heightAt(x, z), WATER_Y - 0.08);
    return this.world.heightAt(x, z);
  }

  /** Is the terrain at (x,z) suitable for this animal to move onto? */
  private terrainOk(x: number, z: number): boolean {
    const h = this.world.heightAt(x, z);
    if (this.def.aquatic) return h < WATER_Y - 0.7;
    if (this.def.swims) return h < WATER_Y - 0.2;
    return h > WATER_Y + 0.15;
  }

  private enterState(s: AIState) {
    this.state = s;
    this.stateT = 0;
    if (s === 'wander') {
      if (this.perchY !== null) {
        this.state = 'idle'; // perched birds sit still until something happens
        return;
      }
      // an anchored T. rex paces around its last kill instead of roaming off
      const cx = this.anchor?.x ?? this.position.x;
      const cz = this.anchor?.z ?? this.position.z;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 5 + Math.random() * (this.anchor ? 10 : 18);
        const tx = cx + Math.cos(a) * d;
        const tz = cz + Math.sin(a) * d;
        if (this.terrainOk(tx, tz)) {
          this.target.set(tx, tz);
          return;
        }
      }
      this.state = 'idle';
    }
  }

  spook(playerPos: THREE.Vector3) {
    if (this.def.temperament === 'friendly') return; // nothing scares a farm cat
    if (this.def.dino) return; // and NOTHING scares a dinosaur, least of all you
    if (this.state === 'flee' || this.state === 'flyaway' || this.state === 'alert') return;
    this.enterState('alert');
    const dx = this.position.x - playerPos.x;
    const dz = this.position.z - playerPos.z;
    this.heading = Math.atan2(dx, dz) + Math.PI; // face the player while alert
  }

  update(dt: number, playerPos: THREE.Vector3, playerNoise: number) {
    if (this.zombie) {
      this.animT += dt;
      this.updateZombie(dt, playerPos);
      return;
    }
    this.stateT += dt;
    this.animT += dt;
    const p = this.position;
    const distToPlayer = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
    const friendly = this.def.temperament === 'friendly';

    // T. rex on the hunt overrides everything else on the schedule
    if (this.huntTarget) {
      this.updateHunt(dt);
      this.animateWalk();
      return;
    }

    if (!friendly && !this.def.dino && this.state !== 'flee' && this.state !== 'flyaway' && this.state !== 'alert' && this.state !== 'flyover') {
      // shy: closer + noisier player = spook (perched birds watch from higher up)
      const fleeAt = this.perchY !== null ? this.def.fleeDist * 0.55 : this.def.fleeDist;
      if (distToPlayer < fleeAt * playerNoise) this.spook(playerPos);
    }
    if (friendly && (this.state === 'idle' || this.state === 'graze' || this.state === 'wander')) {
      // friendly: notice the player and come say hello
      if (distToPlayer < 18 && distToPlayer > 2.4) this.enterState('approach');
    }

    this.moving = false;
    switch (this.state) {
      case 'idle':
        if (this.stateT > 1.5 + Math.random() * 2) this.enterState(Math.random() < 0.5 ? 'graze' : 'wander');
        break;
      case 'graze':
        if (this.stateT > 2 + Math.random() * 3) this.enterState(Math.random() < 0.6 ? 'wander' : 'idle');
        break;
      case 'approach': {
        if (distToPlayer <= 2.4 || distToPlayer > 26) {
          this.enterState('idle');
          break;
        }
        const want = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        this.turnToward(want, dt);
        this.stepForward(this.def.speed * 0.45, dt);
        break;
      }
      case 'alert': {
        // frozen, head up, facing the player — this is the photo window
        this.rig.group.rotation.y = this.heading;
        if (this.stateT > 1.4) {
          if (this.def.flies && !this.def.swims) {
            this.perchY = null; // take off
            this.enterState('flyaway');
          } else {
            this.enterState('flee');
          }
          const dx = p.x - playerPos.x;
          const dz = p.z - playerPos.z;
          this.heading = Math.atan2(dx, dz);
        }
        break;
      }
      case 'flyover': {
        if (this.def.id === 'pteranodon') this.heading += 0.22 * dt; // lazy circles, king of the sky
        p.x += Math.sin(this.heading) * this.def.speed * 2.4 * dt;
        p.z += Math.cos(this.heading) * this.def.speed * 2.4 * dt;
        p.y = this.flyoverY + Math.sin(this.animT * 1.3) * 0.6;
        this.rig.group.rotation.y = this.heading;
        this.moving = true;
        if (this.stateT > 18 && this.def.id !== 'pteranodon') this.alive = false;
        break;
      }
      case 'flee': {
        const speed = this.def.speed * this.speedScale;
        const nx = p.x + Math.sin(this.heading) * speed * dt;
        const nz = p.z + Math.cos(this.heading) * speed * dt;
        if (!this.terrainOk(nx, nz)) {
          this.heading += 0.9; // veer away from unsuitable terrain
        } else {
          const [cx, cz] = this.world.collide(nx, nz, 0.5 * this.scale);
          p.set(cx, this.groundY(cx, cz), cz);
          this.moving = true;
        }
        this.rig.group.rotation.y = this.heading;
        if (distToPlayer > this.def.fleeDist * 3 + 25 || this.stateT > 8) this.enterState('wander');
        break;
      }
      case 'flyaway': {
        const flySpeed = this.def.speed * 1.6 * this.speedScale;
        p.x += Math.sin(this.heading) * flySpeed * dt;
        p.z += Math.cos(this.heading) * flySpeed * dt;
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
        this.turnToward(Math.atan2(dx, dz), dt);
        this.stepForward(this.def.speed * 0.28, dt);
        break;
      }
    }

    this.animateWalk();
    if (this.def.aquatic) {
      // fish: constant tail wiggle + gentle bob below the surface
      p.y = WATER_Y - 0.4 + Math.sin(this.animT * 1.7) * 0.08;
    }
    if (this.state === 'graze') {
      this.rig.head.rotation.x = THREE.MathUtils.lerp(this.rig.head.rotation.x, 0.85, dt * 5);
    } else if (this.state === 'alert') {
      this.rig.head.rotation.x = THREE.MathUtils.lerp(this.rig.head.rotation.x, -0.25, dt * 8);
    } else {
      this.rig.head.rotation.x = THREE.MathUtils.lerp(this.rig.head.rotation.x, Math.sin(this.animT * 1.4) * 0.06, dt * 4);
    }
  }

  /** Legs swing, tails wag, pteranodon "legs" (wings) flap. */
  private animateWalk() {
    const fast = this.state === 'flee' || this.state === 'flyaway' || this.huntTarget !== null;
    const wings = this.def.id === 'pteranodon';
    const rate = wings ? 3.2 : this.moving ? (fast ? 14 : 7) : 0;
    const amp = wings ? 0.35 : this.moving ? 0.55 : 0;
    this.rig.legs.forEach((leg, i) => {
      const phase = wings ? 0 : i % 2 === 0 ? 0 : Math.PI;
      const axis = wings ? 'z' : 'x';
      const swing = Math.sin(this.animT * rate + phase) * amp;
      if (axis === 'z') leg.rotation.z = swing * (i === 0 ? 1 : -1);
      else leg.rotation.x = swing;
    });
    if (this.def.aquatic) {
      if (this.rig.tail) this.rig.tail.rotation.y = Math.sin(this.animT * (this.moving ? 9 : 4)) * 0.5;
    } else if (this.rig.tail) {
      this.rig.tail.rotation.y = Math.sin(this.animT * 3.2) * 0.25;
    }
  }

  /** The T. rex closes on its target; on contact, lunch is served. */
  private updateHunt(dt: number) {
    const target = this.huntTarget!;
    if (!target.alive) {
      this.huntTarget = null;
      return;
    }
    const p = this.position;
    const dx = target.position.x - p.x;
    const dz = target.position.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 120) {
      this.huntTarget = null; // got away — this time
      return;
    }
    this.turnToward(Math.atan2(dx, dz), dt * 2.2);
    const reach = 2.2 + this.scale + target.scale * 0.4;
    if (dist <= reach) {
      target.alive = false;
      this.justKilled = target; // the spawner handles the... aftermath
      this.anchor = { x: target.position.x, z: target.position.z };
      this.huntTarget = null;
      this.enterState('idle');
      return;
    }
    const speed = this.def.speed * this.speedScale * 1.15;
    const nx = p.x + Math.sin(this.heading) * speed * dt;
    const nz = p.z + Math.cos(this.heading) * speed * dt;
    const [cx, cz] = this.world.collide(nx, nz, 0.6 * this.scale);
    p.set(cx, Math.max(this.world.heightAt(cx, cz), WATER_Y - 0.25), cz);
    this.rig.group.rotation.y = this.heading;
    this.moving = true;
  }

  /** Zombie AI: shamble straight at the player, always. */
  private updateZombie(dt: number, playerPos: THREE.Vector3) {
    const p = this.position;
    const dx = playerPos.x - p.x;
    const dz = playerPos.z - p.z;
    const dist = Math.hypot(dx, dz);
    this.moving = false;

    if (this.zombieStun > 0) {
      this.zombieStun -= dt;
    } else if (dist > 1.1 && dist < 90) {
      this.turnToward(Math.atan2(dx, dz), dt * 1.6);
      const speed = this.def.speed * 0.45 * this.zombieSpeed * this.speedScale;
      const nx = p.x + Math.sin(this.heading) * speed * dt;
      const nz = p.z + Math.cos(this.heading) * speed * dt;
      const [cx, cz] = this.world.collide(nx, nz, 0.5 * this.scale);
      // zombies wade straight through ponds
      p.set(cx, Math.max(this.world.heightAt(cx, cz), WATER_Y - 0.25), cz);
      this.rig.group.rotation.y = this.heading;
      this.moving = true;
    }

    // lurching walk + hungry head tilt
    const amp = this.moving ? 0.5 : 0;
    const villagerArms = this.def.id === 'villager';
    this.rig.legs.forEach((leg, i) => {
      if (villagerArms && i >= 2) {
        leg.rotation.x = -1.35 + Math.sin(this.animT * 4 + i) * 0.12; // arms out, zombie-style
      } else {
        leg.rotation.x = Math.sin(this.animT * 6 + (i % 2 === 0 ? 0 : Math.PI)) * amp;
      }
    });
    this.rig.group.rotation.z = Math.sin(this.animT * 3.1) * 0.05; // unsettling sway
    this.rig.head.rotation.x = THREE.MathUtils.lerp(this.rig.head.rotation.x, -0.2, dt * 4);
    if (this.rig.tail) this.rig.tail.rotation.y = 0;
  }

  private turnToward(want: number, dt: number) {
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(dh, -2.4 * dt, 2.4 * dt);
  }

  private stepForward(baseSpeed: number, dt: number) {
    const speed = baseSpeed * this.speedScale;
    const p = this.position;
    const nx = p.x + Math.sin(this.heading) * speed * dt;
    const nz = p.z + Math.cos(this.heading) * speed * dt;
    if (!this.terrainOk(nx, nz)) {
      this.enterState('idle');
      return;
    }
    const [cx, cz] = this.world.collide(nx, nz, 0.5 * this.scale);
    p.set(cx, this.groundY(cx, cz), cz);
    this.rig.group.rotation.y = this.heading;
    this.moving = true;
  }
}

// ---------------------------------------------------------------- spawner

const MAX_ANIMALS = 15;
const MAX_FISH = 3;
const SPAWN_MIN = 45;
const SPAWN_MAX = 110;
const DESPAWN = 150;

const LAND_SPECIES = SPECIES.filter((s) => !s.aquatic && !s.dino);
const FISH_SPECIES = SPECIES.filter((s) => s.aquatic);
const FLIER_SPECIES = SPECIES.filter((s) => s.flies && !s.dino);
const DINO_SPECIES = SPECIES.filter((s) => s.dino);

const DINO_UNLOCK_TIME = 180; // seconds of gameplay before the past wakes up
const DINO_MIN_DIST_FROM_HOME = 250; // meters from the starting town
const MAX_DINOS = 4;

export interface GoreLike {
  burst(at: THREE.Vector3, scale: number): void;
}

export class AnimalSpawner {
  readonly animals: Animal[] = [];
  private cooldown = 0;
  private fishCooldown = 0;
  private flyoverTimer = 8; // first flyover comes fairly soon
  private discoveryTimer = 25; // guaranteed something-new, roughly every minute
  private giantTimer = 15 + Math.random() * 60; // guaranteed whopper, ditto

  /** Easy mode: far more animals, closer, and bigger on average. */
  easy = false;
  /** Zombie mode: the spawner feeds the horde instead of the meadow. */
  zombieMax = 0; // 0 = zombie mode off
  zombieInterval = 1.2;
  onSpawn: ((a: Animal) => void) | null = null; // zombification hook
  /** Species already in the photo book — main keeps this fresh. */
  photographed = new Set<string>();
  /** Session play time in seconds — gates the dinosaurs. */
  elapsed = 0;
  /** Shared splatter system, for when the T. rex catches something. */
  gore: GoreLike | null = null;

  constructor(private world: World, private scene: THREE.Scene) {}

  update(dt: number, playerPos: THREE.Vector3, playerNoise: number, playerWaterDepth = 0) {
    this.cooldown -= dt;
    this.fishCooldown -= dt;
    const zombieMode = this.zombieMax > 0;

    if (!zombieMode) {
      this.flyoverTimer -= dt;
      if (this.flyoverTimer <= 0) {
        this.flyoverTimer = 16 + Math.random() * 20;
        this.spawnFlyover(playerPos);
      }
      // engagement pacing: one unseen species and one giant per minute-ish
      this.discoveryTimer -= dt;
      if (this.discoveryTimer <= 0) {
        this.discoveryTimer = 60;
        this.spawnDiscovery(playerPos);
      }
      this.giantTimer -= dt;
      if (this.giantTimer <= 0) {
        this.giantTimer = 15 + Math.random() * 75; // random moment each minute-ish
        this.spawnGiant(playerPos);
      }
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      a.update(dt, playerPos, playerNoise);
      if (a.justKilled) {
        // T. rex dining: splatter where the victim stood
        this.gore?.burst(a.justKilled.position, a.justKilled.scale);
        a.justKilled = null;
        a.trexTimer = 18 + Math.random() * 6;
      }
      const d = Math.hypot(a.position.x - playerPos.x, a.position.z - playerPos.z);
      const range = a.def.aquatic ? 32 : DESPAWN;
      if (!a.alive || d > range) {
        this.scene.remove(a.rig.group);
        this.animals.splice(i, 1);
      }
    }
    // hungry tyrants pick their next course
    if (!zombieMode) this.updateTrexHunts(dt);

    const landCount = this.animals.filter((a) => !a.def.aquatic).length;
    if (zombieMode) {
      if (landCount < this.zombieMax && this.cooldown <= 0) {
        this.cooldown = this.zombieInterval;
        for (let i = 0; i < 4; i++) this.trySpawnZombie(playerPos);
      }
      return; // no fish, no perching, no flyovers while the dead walk
    }
    const maxAnimals = this.easy ? 26 : MAX_ANIMALS;
    if (landCount < maxAnimals && this.cooldown <= 0) {
      this.cooldown = this.easy ? 0.25 : 0.6;
      const burst = this.easy ? 8 : 3;
      for (let i = 0; i < burst; i++) this.trySpawn(playerPos);
    }
    // fish only show up while the player is wading
    const fishCount = this.animals.filter((a) => a.def.aquatic).length;
    if (playerWaterDepth > 0.35 && fishCount < MAX_FISH && this.fishCooldown <= 0) {
      this.fishCooldown = 1.4;
      this.trySpawnFish(playerPos);
    }
  }

  private updateTrexHunts(dt: number) {
    for (const rex of this.animals) {
      if (rex.def.id !== 'trex' || rex.zombie || !rex.alive) continue;
      if (rex.huntTarget) continue; // already mid-chase
      rex.trexTimer -= dt;
      if (rex.trexTimer > 0) continue;
      // anything on legs is on the menu, dinosaurs included — and the king
      // always orders the LARGEST thing in sight (actual physical size,
      // so a "small" stegosaurus still outranks a giant rabbit)
      let best: Animal | null = null;
      let bestBulk = 0;
      const SIGHT = 60;
      for (const prey of this.animals) {
        if (prey === rex || !prey.alive || prey.def.aquatic || prey.flying) continue;
        const d = Math.hypot(prey.position.x - rex.position.x, prey.position.z - rex.position.z);
        if (d > SIGHT) continue;
        const bulk = prey.scale * prey.rig.bodyHeight; // rough shoulder height in meters
        if (!best || bulk > bestBulk) {
          best = prey;
          bestBulk = bulk;
        }
      }
      if (best) {
        rex.huntTarget = best;
      } else {
        rex.trexTimer = 5; // nothing on the menu yet; check back soon
      }
    }
  }

  /** Is this spot dinosaur country? (far from home, late enough in the trip) */
  private dinoChanceAt(x: number, z: number): number {
    if (this.elapsed < DINO_UNLOCK_TIME) return 0;
    const home = this.world.spawnHint ?? { x: 0, z: 0 };
    if (Math.hypot(x - home.x, z - home.z) < DINO_MIN_DIST_FROM_HOME) return 0;
    const nearFossil = this.world.fossils.some((f) => Math.hypot(x - f.x, z - f.z) < 80);
    return nearFossil ? 0.55 : 0.12; // fossils are basically dinosaur bus stops
  }

  /** Every minute, guarantee a species the player hasn't photographed yet. */
  private spawnDiscovery(playerPos: THREE.Vector3) {
    const unseen = LAND_SPECIES.filter((s) => !this.photographed.has(s.id));
    if (unseen.length === 0) return; // book's full — nothing left to tease
    const def = this.weightedPick(unseen);
    if (!def) return;
    // park it close enough to notice, at a spot its habitat approves of
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 40;
      const x = playerPos.x + Math.cos(ang) * dist;
      const z = playerPos.z + Math.sin(ang) * dist;
      if (Math.abs(x) > 570 || Math.abs(z) > 570) continue;
      const habitat = this.world.habitatAt(x, z);
      const habitatOk = def.habitats.includes(habitat);
      if (def.swims && this.world.heightAt(x, z) > WATER_Y - 0.15) continue;
      if (!def.swims && this.world.heightAt(x, z) < WATER_Y + 0.15) continue;
      if (habitatOk || i > 12) {
        // after enough tries, close-by beats habitat-purist
        this.spawn(def, x, z);
        return;
      }
    }
  }

  /** Every minute-ish, at a random moment: one exceptionally large specimen. */
  private spawnGiant(playerPos: THREE.Vector3) {
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 35 + Math.random() * 45;
      const x = playerPos.x + Math.cos(ang) * dist;
      const z = playerPos.z + Math.sin(ang) * dist;
      if (Math.abs(x) > 570 || Math.abs(z) > 570) continue;
      if (this.world.heightAt(x, z) < WATER_Y + 0.15) continue;
      const habitat = this.world.habitatAt(x, z);
      const pool = LAND_SPECIES.filter((s) => s.habitats.includes(habitat) && !s.swims);
      const def = this.weightedPick(pool);
      if (!def) continue;
      const size = describeSize(3.4 + Math.random() * 1.2); // certified MASSIVE
      const animal = new Animal(def, x, z, size, this.world);
      this.scene.add(animal.rig.group);
      this.animals.push(animal);
      this.onSpawn?.(animal);
      return;
    }
  }

  private weightedPick(pool: SpeciesDef[]): SpeciesDef | null {
    if (pool.length === 0) return null;
    let totalW = 0;
    for (const s of pool) totalW += s.rarity;
    let pick = Math.random() * totalW;
    for (const s of pool) {
      pick -= s.rarity;
      if (pick <= 0) return s;
    }
    return pool[pool.length - 1];
  }

  private trySpawn(playerPos: THREE.Vector3) {
    const ang = Math.random() * Math.PI * 2;
    const near = this.easy ? 22 : SPAWN_MIN;
    const far = this.easy ? 75 : SPAWN_MAX;
    const dist = near + Math.random() * (far - near);
    const x = playerPos.x + Math.cos(ang) * dist;
    const z = playerPos.z + Math.sin(ang) * dist;
    if (Math.abs(x) > 570 || Math.abs(z) > 570) return;

    // deep wilderness roll: sometimes what steps out isn't from this epoch
    const dinoChance = this.dinoChanceAt(x, z);
    if (dinoChance > 0 && Math.random() < dinoChance) {
      if (this.animals.filter((a) => a.def.dino).length >= MAX_DINOS) return;
      if (this.world.heightAt(x, z) < WATER_Y + 0.3) return;
      const def = this.weightedPick(DINO_SPECIES);
      if (!def) return;
      if (this.animals.some((a) => a.def.id === def.id && def.id === 'trex')) return; // one apex at a time
      const animal = new Animal(def, x, z, rollDinoSize(Math.random), this.world);
      this.scene.add(animal.rig.group);
      this.animals.push(animal);
      this.onSpawn?.(animal);
      if (def.id === 'pteranodon') {
        animal.startFlyover(Math.random() * Math.PI * 2, playerPos.y + 14 + Math.random() * 10);
      }
      return;
    }

    const habitat = this.world.habitatAt(x, z);
    const pool = LAND_SPECIES.filter((s) => s.habitats.includes(habitat));
    const def = this.weightedPick(pool);
    if (!def) return;
    if (this.animals.filter((a) => a.def.id === def.id).length >= (this.easy ? 5 : 3)) return;
    if (def.swims && this.world.heightAt(x, z) > WATER_Y - 0.15) return;
    if (!def.swims && this.world.heightAt(x, z) < WATER_Y + 0.15) return;
    const animal = this.spawn(def, x, z);
    // forest birds often start out perched — at the very top of a tree where
    // you can actually SEE them, or on the ground at its base
    if (def.flies && !def.swims && habitat === 'forest' && Math.random() < 0.55) {
      const tree = this.world.randomTreeNear(x, z, 14);
      if (tree) {
        if (Math.random() < 0.6) {
          // crow's nest: right on the canopy tip, silhouetted against the sky
          animal.position.x = tree.x;
          animal.position.z = tree.z;
          animal.perchAt(this.world.heightAt(tree.x, tree.z) - 0.2 + 7.6 * tree.scale);
        } else {
          // ground floor: pecking around the trunk
          animal.position.x = tree.x + 1.2;
          animal.position.z = tree.z + 0.4;
          animal.position.y = this.world.heightAt(tree.x + 1.2, tree.z + 0.4);
        }
      }
    }
  }

  /** Birds crossing the sky above the player — photo bonus if you catch them.
   *  Rarely, a whole flock passes at once (combo heaven). */
  private spawnFlyover(playerPos: THREE.Vector3) {
    const flock = Math.random() < 0.18;
    const def = flock
      ? this.weightedPick(FLIER_SPECIES.filter((s) => s.baseScale <= 0.6)) // small birds flock
      : this.weightedPick(FLIER_SPECIES);
    if (!def) return;
    const ang = Math.random() * Math.PI * 2;
    const x = playerPos.x + Math.cos(ang) * 55;
    const z = playerPos.z + Math.sin(ang) * 55;
    const heading = Math.atan2(playerPos.x - x, playerPos.z - z) + (Math.random() - 0.5) * 0.35;
    const altitude = playerPos.y + 9 + Math.random() * 9;
    const count = flock ? 5 + Math.floor(Math.random() * 5) : 1;
    // lateral offsets form a loose V (direction is (sin h, cos h); this is its perpendicular)
    const px = Math.cos(heading);
    const pz = -Math.sin(heading);
    for (let i = 0; i < count; i++) {
      const lateral = (i - (count - 1) / 2) * 2.6;
      const back = Math.abs(lateral) * 0.7;
      const animal = this.spawn(def, x + px * lateral - Math.sin(heading) * back, z + pz * lateral - Math.cos(heading) * back);
      animal.startFlyover(heading, altitude + (Math.random() - 0.5) * 1.6);
    }
  }

  private trySpawnFish(playerPos: THREE.Vector3) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 8;
    const x = playerPos.x + Math.cos(ang) * dist;
    const z = playerPos.z + Math.sin(ang) * dist;
    if (this.world.heightAt(x, z) > WATER_Y - 0.75) return;
    const def = this.weightedPick(FISH_SPECIES);
    if (!def) return;
    if (this.animals.filter((a) => a.def.id === def.id).length >= 2) return;
    this.spawn(def, x, z);
  }

  /** A fresh member of the horde, somewhere in a ring around the player. */
  private trySpawnZombie(playerPos: THREE.Vector3) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 35 + Math.random() * 55;
    const x = playerPos.x + Math.cos(ang) * dist;
    const z = playerPos.z + Math.sin(ang) * dist;
    if (Math.abs(x) > 570 || Math.abs(z) > 570) return;
    if (this.world.heightAt(x, z) < WATER_Y - 1.5) return; // not from the deep
    const def = this.weightedPick(LAND_SPECIES);
    if (!def) return;
    this.spawn(def, x, z);
  }

  private spawn(def: SpeciesDef, x: number, z: number): Animal {
    const animal = new Animal(def, x, z, rollSize(Math.random, this.easy ? 0.35 : 0), this.world);
    this.scene.add(animal.rig.group);
    this.animals.push(animal);
    this.onSpawn?.(animal);
    return animal;
  }

  clear() {
    for (const a of this.animals) this.scene.remove(a.rig.group);
    this.animals.length = 0;
  }
}
