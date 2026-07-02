import * as THREE from 'three';
import { fbm, hash2, mulberry32, valueNoise } from './noise';

export const WORLD_HALF = 600; // world spans [-600, 600] on x and z
export const PLAY_BOUND = 575; // soft wall for the player
export const WATER_Y = -2.4;

const TILE = 150; // terrain tile size (m)
const TILES = (WORLD_HALF * 2) / TILE; // 8x8 tiles
const STEP = 3; // vertex spacing (m)

export type Habitat = 'field' | 'forest' | 'town' | 'water';

export interface Town {
  x: number;
  z: number;
  h: number;
  r: number;
}

interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class World {
  readonly seed: number;
  readonly group = new THREE.Group();
  readonly towns: Town[] = [];
  readonly occluders: THREE.Object3D[] = []; // solid meshes for photo line-of-sight
  private buildingBoxes: AABB[] = [];
  private pathGrid = new Map<string, Array<[number, number]>>();
  private treeGrid = new Map<string, Array<[number, number]>>();
  spawnHint: { x: number; z: number } | null = null;

  constructor(seed: number) {
    this.seed = seed | 0;
    this.placeTowns();
    this.buildPaths();
    this.buildTerrain();
    this.buildWater();
    this.buildVegetation();
    this.buildTowns();
  }

  // ---------------------------------------------------------------- height

  /** Raw terrain before town flattening: rolling hills + pond depressions. */
  private rawHeight(x: number, z: number): number {
    let h = (fbm(x / 260, z / 260, this.seed, 4) - 0.5) * 26;
    h += (valueNoise(x / 40, z / 40, this.seed + 7) - 0.5) * 1.6; // small detail
    const pond = this.pondNoise(x, z);
    if (pond > 0.64) {
      const t = Math.min(1, (pond - 0.64) / 0.12);
      h -= t * t * (3 - 2 * t) * 8;
    }
    return h;
  }

  private pondNoise(x: number, z: number): number {
    return fbm(x / 140 + 37.3, z / 140 - 11.8, this.seed + 500, 3);
  }

  heightAt(x: number, z: number): number {
    let h = this.rawHeight(x, z);
    for (const t of this.towns) {
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < t.r) {
        const w = 1 - Math.min(1, Math.max(0, (d - t.r * 0.55) / (t.r * 0.45)));
        const s = w * w * (3 - 2 * w);
        h = h + (t.h - h) * s;
      }
    }
    return h;
  }

  // ---------------------------------------------------------------- biomes

  forestNoise(x: number, z: number): number {
    return fbm(x / 180 + 91.7, z / 180 + 45.2, this.seed + 900, 3);
  }

  isForest(x: number, z: number): boolean {
    if (this.forestNoise(x, z) <= 0.56) return false;
    if (this.pathDist(x, z) < 6) return false;
    return !this.nearTown(x, z, 12);
  }

  nearTown(x: number, z: number, margin = 0): Town | null {
    for (const t of this.towns) {
      if (Math.hypot(x - t.x, z - t.z) < t.r + margin) return t;
    }
    return null;
  }

  habitatAt(x: number, z: number): Habitat {
    if (this.heightAt(x, z) < WATER_Y + 0.9) return 'water';
    if (this.nearTown(x, z, 8)) return 'town';
    if (this.isForest(x, z)) return 'forest';
    return 'field';
  }

  // ---------------------------------------------------------------- towns

  private placeTowns() {
    const rng = mulberry32(this.seed ^ 0x5eed);
    let guard = 0;
    while (this.towns.length < 5 && guard++ < 400) {
      const x = (rng() * 2 - 1) * 420;
      const z = (rng() * 2 - 1) * 420;
      if (this.pondNoise(x, z) > 0.6) continue; // no towns in ponds
      if (this.towns.some((t) => Math.hypot(x - t.x, z - t.z) < 250)) continue;
      const h = this.rawHeight(x, z);
      if (h < WATER_Y + 2) continue;
      this.towns.push({ x, z, h, r: 55 + rng() * 12 });
    }
    const t0 = this.towns[0];
    this.spawnHint = { x: t0.x, z: t0.z + t0.r * 0.7 };
  }

  private buildPaths() {
    // Minimum spanning tree between towns + one loop edge.
    const n = this.towns.length;
    const inTree = [0];
    const edges: Array<[number, number]> = [];
    while (inTree.length < n) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (const a of inTree) {
        for (let b = 0; b < n; b++) {
          if (inTree.includes(b)) continue;
          const d = Math.hypot(this.towns[a].x - this.towns[b].x, this.towns[a].z - this.towns[b].z);
          if (d < bestD) {
            bestD = d;
            best = [a, b];
          }
        }
      }
      if (!best) break;
      edges.push(best);
      inTree.push(best[1]);
    }
    // Extra edge for a loop: connect the two towns farthest apart in the tree order.
    if (n >= 4) edges.push([1, n - 1]);

    const rng = mulberry32(this.seed ^ 0x9a7);
    for (const [a, b] of edges) {
      const ta = this.towns[a];
      const tb = this.towns[b];
      const len = Math.hypot(tb.x - ta.x, tb.z - ta.z);
      const steps = Math.ceil(len / 3);
      const px = -(tb.z - ta.z) / len; // perpendicular
      const pz = (tb.x - ta.x) / len;
      const wobbleSeed = rng() * 1000;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wobble =
          (valueNoise(t * 6 + wobbleSeed, wobbleSeed, this.seed + 77) - 0.5) * 30 * Math.sin(t * Math.PI);
        const x = ta.x + (tb.x - ta.x) * t + px * wobble;
        const z = ta.z + (tb.z - ta.z) * t + pz * wobble;
        this.addPathPoint(x, z);
      }
    }
    // Forest trailheads: short dead-end spurs off each town.
    for (const t of this.towns) {
      const ang = rng() * Math.PI * 2;
      const spurLen = 60 + rng() * 60;
      for (let d = 0; d < spurLen; d += 3) {
        this.addPathPoint(t.x + Math.cos(ang) * (t.r * 0.5 + d), t.z + Math.sin(ang) * (t.r * 0.5 + d));
      }
    }
  }

  private addPathPoint(x: number, z: number) {
    const key = `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
    let arr = this.pathGrid.get(key);
    if (!arr) this.pathGrid.set(key, (arr = []));
    arr.push([x, z]);
  }

  pathDist(x: number, z: number): number {
    const cx = Math.floor(x / 12);
    const cz = Math.floor(z / 12);
    let best = Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.pathGrid.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const [px, pz] of arr) {
          const d = Math.hypot(x - px, z - pz);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- terrain

  private buildTerrain() {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const cGrassA = new THREE.Color('#79a854');
    const cGrassB = new THREE.Color('#93bd63');
    const cForest = new THREE.Color('#557f3e');
    const cPath = new THREE.Color('#c9b184');
    const cPlaza = new THREE.Color('#b3a795');
    const cSand = new THREE.Color('#c2a76e');
    const cMud = new THREE.Color('#8d7c54');
    const tmp = new THREE.Color();

    for (let tx = 0; tx < TILES; tx++) {
      for (let tz = 0; tz < TILES; tz++) {
        const ox = -WORLD_HALF + tx * TILE;
        const oz = -WORLD_HALF + tz * TILE;
        const n = TILE / STEP + 1;
        const positions = new Float32Array(n * n * 3);
        const colors = new Float32Array(n * n * 3);
        const indices: number[] = [];
        for (let iz = 0; iz < n; iz++) {
          for (let ix = 0; ix < n; ix++) {
            const x = ox + ix * STEP;
            const z = oz + iz * STEP;
            const h = this.heightAt(x, z);
            const v = (iz * n + ix) * 3;
            positions[v] = x;
            positions[v + 1] = h;
            positions[v + 2] = z;

            // color by biome
            const detail = hash2(Math.round(x * 3), Math.round(z * 3), this.seed + 3);
            tmp.copy(cGrassA).lerp(cGrassB, valueNoise(x / 22, z / 22, this.seed + 12) * 0.9 + detail * 0.1);
            if (this.isForest(x, z)) tmp.lerp(cForest, 0.75);
            if (h < WATER_Y + 0.7) {
              tmp.copy(cSand);
              if (h < WATER_Y - 0.8) tmp.lerp(cMud, 0.8);
            } else {
              const town = this.nearTown(x, z, 0);
              if (town && Math.hypot(x - town.x, z - town.z) < 16) tmp.lerp(cPlaza, 0.85);
              const pd = this.pathDist(x, z);
              if (pd < 3.4) tmp.lerp(cPath, Math.min(1, (3.4 - pd) / 1.2) * 0.92);
            }
            colors[v] = tmp.r;
            colors[v + 1] = tmp.g;
            colors[v + 2] = tmp.b;
          }
        }
        for (let iz = 0; iz < n - 1; iz++) {
          for (let ix = 0; ix < n - 1; ix++) {
            const a = iz * n + ix;
            indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, material);
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.occluders.push(mesh);
      }
    }
  }

  private buildWater() {
    const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2);
    const mat = new THREE.MeshLambertMaterial({ color: '#4d87b5', transparent: true, opacity: 0.68 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = WATER_Y;
    this.group.add(mesh);
  }

  // ------------------------------------------------------------ vegetation

  private addTreeCollider(x: number, z: number) {
    const key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    let arr = this.treeGrid.get(key);
    if (!arr) this.treeGrid.set(key, (arr = []));
    arr.push([x, z]);
  }

  /** Returns push-out vector if (x,z) is within `r` of a trunk, else null. */
  treePushOut(x: number, z: number, r: number): [number, number] | null {
    const cx = Math.floor(x / 8);
    const cz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const arr = this.treeGrid.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const [tx, tz] of arr) {
          const dx = x - tx;
          const dz = z - tz;
          const d = Math.hypot(dx, dz);
          if (d < r && d > 0.001) {
            const push = (r - d) / d;
            return [dx * push, dz * push];
          }
        }
      }
    }
    return null;
  }

  private buildVegetation() {
    interface Inst {
      x: number;
      z: number;
      s: number;
      rot: number;
      tint: number;
    }
    const pines: Inst[] = [];
    const broads: Inst[] = [];
    const grassSpots: Inst[] = [];
    const flowers: Inst[] = [];
    const rocks: Inst[] = [];

    for (let gx = -WORLD_HALF; gx < WORLD_HALF; gx += 6) {
      for (let gz = -WORLD_HALF; gz < WORLD_HALF; gz += 6) {
        const jx = gx + (hash2(gx, gz, this.seed + 21) - 0.5) * 5;
        const jz = gz + (hash2(gx, gz, this.seed + 22) - 0.5) * 5;
        const h = this.heightAt(jx, jz);
        if (h < WATER_Y + 0.6) continue;
        const r1 = hash2(gx, gz, this.seed + 23);
        const forest = this.isForest(jx, jz);
        const clear = this.pathDist(jx, jz) > 4.5 && !this.nearTown(jx, jz, 4);
        if (forest && clear && r1 < 0.5) {
          const inst = {
            x: jx,
            z: jz,
            s: 0.75 + hash2(gx, gz, this.seed + 24) * 0.7,
            rot: hash2(gx, gz, this.seed + 25) * Math.PI * 2,
            tint: hash2(gx, gz, this.seed + 26),
          };
          (hash2(gx, gz, this.seed + 27) < 0.55 ? pines : broads).push(inst);
          this.addTreeCollider(jx, jz);
        } else if (!forest && clear && r1 < 0.012) {
          const inst = { x: jx, z: jz, s: 0.9 + hash2(gx, gz, this.seed + 24), rot: 0, tint: hash2(gx, gz, this.seed + 26) };
          broads.push(inst);
          this.addTreeCollider(jx, jz);
        } else if (!forest && clear && r1 > 0.6 && r1 < 0.78) {
          grassSpots.push({ x: jx, z: jz, s: 0.7 + hash2(gx, gz, this.seed + 30) * 0.8, rot: 0, tint: hash2(gx, gz, this.seed + 31) });
        } else if (!forest && clear && r1 > 0.985) {
          flowers.push({ x: jx, z: jz, s: 1, rot: 0, tint: hash2(gx, gz, this.seed + 32) });
        } else if (clear && r1 > 0.972 && r1 < 0.978) {
          rocks.push({ x: jx, z: jz, s: 0.4 + hash2(gx, gz, this.seed + 33) * 1.4, rot: hash2(gx, gz, this.seed + 34) * Math.PI, tint: hash2(gx, gz, this.seed + 35) });
        }
      }
    }

    const dummy = new THREE.Object3D();
    const fill = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      list: Inst[],
      yOf: (i: Inst) => number,
      colorize?: (i: Inst, c: THREE.Color) => void,
      shadows = false
    ) => {
      if (list.length === 0) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const c = new THREE.Color();
      list.forEach((i, k) => {
        dummy.position.set(i.x, yOf(i), i.z);
        dummy.rotation.set(0, i.rot, 0);
        dummy.scale.setScalar(i.s);
        dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
        if (colorize) {
          colorize(i, c);
          im.setColorAt(k, c);
        }
      });
      im.castShadow = shadows;
      im.instanceMatrix.needsUpdate = true;
      this.group.add(im);
    };

    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.6, 6);
    trunkGeo.translate(0, 1.3, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#6e5233' });
    const allTrees = pines.concat(broads);
    fill(trunkGeo, trunkMat, allTrees, (i) => this.heightAt(i.x, i.z) - 0.2, undefined, true);

    const pineGeo = new THREE.ConeGeometry(2.0, 6.5, 7);
    pineGeo.translate(0, 5.2, 0);
    const pineMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const cPineA = new THREE.Color('#3d6b34');
    const cPineB = new THREE.Color('#54854a');
    fill(pineGeo, pineMat, pines, (i) => this.heightAt(i.x, i.z) - 0.2, (i, c) => c.copy(cPineA).lerp(cPineB, i.tint), true);

    const broadGeo = new THREE.IcosahedronGeometry(2.4, 0);
    broadGeo.translate(0, 4.1, 0);
    broadGeo.scale(1, 1.15, 1);
    const broadMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    const cBroadA = new THREE.Color('#4f8a3c');
    const cBroadB = new THREE.Color('#7aa947');
    fill(broadGeo, broadMat, broads, (i) => this.heightAt(i.x, i.z) - 0.2, (i, c) => c.copy(cBroadA).lerp(cBroadB, i.tint), true);

    const grassGeo = new THREE.ConeGeometry(0.32, 0.75, 4);
    grassGeo.translate(0, 0.3, 0);
    const grassMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const cG1 = new THREE.Color('#83b356');
    const cG2 = new THREE.Color('#a7c96a');
    fill(grassGeo, grassMat, grassSpots, (i) => this.heightAt(i.x, i.z), (i, c) => c.copy(cG1).lerp(cG2, i.tint));

    const flowerGeo = new THREE.SphereGeometry(0.16, 5, 4);
    flowerGeo.translate(0, 0.35, 0);
    const flowerMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const flowerPalette = ['#f2f0e4', '#e8c94e', '#d96a8a', '#8f7fd4'].map((s) => new THREE.Color(s));
    fill(flowerGeo, flowerMat, flowers, (i) => this.heightAt(i.x, i.z), (i, c) => c.copy(flowerPalette[Math.floor(i.tint * flowerPalette.length) % flowerPalette.length]));

    const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    const cR1 = new THREE.Color('#8b8b86');
    const cR2 = new THREE.Color('#a8a49a');
    fill(rockGeo, rockMat, rocks, (i) => this.heightAt(i.x, i.z) + 0.15, (i, c) => c.copy(cR1).lerp(cR2, i.tint), true);
  }

  // ---------------------------------------------------------------- towns

  private buildTowns() {
    const rng = mulberry32(this.seed ^ 0x70a2);
    const wallPalette = ['#e8dcc4', '#f0ead8', '#c96f4a', '#d9b98a', '#e3cf9a', '#b8c4c9'];
    const roofPalette = ['#8a4a3a', '#6b4a35', '#5a6570', '#7a3f30'];
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    roofGeo.rotateY(Math.PI / 4);

    for (const town of this.towns) {
      const dir = rng() * Math.PI * 2;
      const dx = Math.cos(dir);
      const dz = Math.sin(dir);
      const nx = -dz;
      const nz = dx;

      // Houses along the main street, both sides.
      for (let s = -40; s <= 40; s += 15) {
        for (const side of [-1, 1]) {
          if (rng() < 0.22) continue;
          const lat = side * (9 + rng() * 3);
          const bx = town.x + dx * s + nx * lat;
          const bz = town.z + dz * s + nz * lat;
          if (Math.abs(s) < 10 && rng() < 0.6) continue; // keep the plaza open
          const w = 5.5 + rng() * 3.5;
          const d = 4.5 + rng() * 2.5;
          const hgt = 3 + rng() * 1.6;
          this.addBuilding(bx, bz, w, d, hgt, dir, wallPalette[(rng() * wallPalette.length) | 0], roofPalette[(rng() * roofPalette.length) | 0], roofGeo);
        }
      }
      // Landmark tower on the plaza edge — visible from far away for navigation.
      const tx = town.x + nx * 16;
      const tz = town.z + nz * 16;
      this.addBuilding(tx, tz, 5, 5, 11, dir, '#ded6c2', '#5a6570', roofGeo, true);

      // Lamp posts along the street.
      const lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 3.4, 5);
      const lampMat = new THREE.MeshLambertMaterial({ color: '#4a4a4a' });
      const bulbGeo = new THREE.SphereGeometry(0.22, 6, 5);
      const bulbMat = new THREE.MeshLambertMaterial({ color: '#ffd98a', emissive: '#c9a24a' });
      for (let s = -30; s <= 30; s += 20) {
        const lx = town.x + dx * s + nx * 5;
        const lz = town.z + dz * s + nz * 5;
        const y = this.heightAt(lx, lz);
        const post = new THREE.Mesh(lampGeo, lampMat);
        post.position.set(lx, y + 1.7, lz);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(lx, y + 3.5, lz);
        this.group.add(post, bulb);
      }
      // Fences around the plaza corners.
      const fenceMat = new THREE.MeshLambertMaterial({ color: '#9a7b52' });
      const fenceGeo = new THREE.BoxGeometry(3.4, 0.9, 0.12);
      for (let s = -46; s <= 46; s += 4) {
        if (rng() < 0.4) continue;
        for (const side of [-1, 1]) {
          const fx = town.x + dx * s + nx * side * 15;
          const fz = town.z + dz * s + nz * side * 15;
          const f = new THREE.Mesh(fenceGeo, fenceMat);
          f.position.set(fx, this.heightAt(fx, fz) + 0.45, fz);
          f.rotation.y = -dir;
          this.group.add(f);
        }
      }
    }
  }

  private addBuilding(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    rotY: number,
    wall: string,
    roof: string,
    roofGeo: THREE.BufferGeometry,
    spire = false
  ) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: wall }));
    body.position.y = h / 2 - 0.3;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: roof, flatShading: true }));
    roofMesh.scale.set(w * 1.3, spire ? h * 0.6 : Math.min(w, d) * 0.6, d * 1.3);
    roofMesh.position.y = h - 0.3 + (spire ? h * 0.3 : Math.min(w, d) * 0.3);
    roofMesh.castShadow = true;
    g.add(roofMesh);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2, 0.15),
      new THREE.MeshLambertMaterial({ color: '#5a4630' })
    );
    door.position.set(0, 0.75, d / 2 + 0.03);
    g.add(door);
    g.position.set(x, y, z);
    g.rotation.y = -rotY;
    this.group.add(g);
    this.occluders.push(body);

    const half = Math.max(w, d) / 2 + 0.5; // conservative rotated AABB
    this.buildingBoxes.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
  }

  /** Circle-vs-AABB push out for player/animal collision. */
  collide(x: number, z: number, r: number): [number, number] {
    let ox = x;
    let oz = z;
    for (const b of this.buildingBoxes) {
      if (ox > b.minX - r && ox < b.maxX + r && oz > b.minZ - r && oz < b.maxZ + r) {
        const pushLeft = ox - (b.minX - r);
        const pushRight = b.maxX + r - ox;
        const pushDown = oz - (b.minZ - r);
        const pushUp = b.maxZ + r - oz;
        const m = Math.min(pushLeft, pushRight, pushDown, pushUp);
        if (m === pushLeft) ox = b.minX - r;
        else if (m === pushRight) ox = b.maxX + r;
        else if (m === pushDown) oz = b.minZ - r;
        else oz = b.maxZ + r;
      }
    }
    const tp = this.treePushOut(ox, oz, r + 0.45);
    if (tp) {
      ox += tp[0];
      oz += tp[1];
    }
    return [ox, oz];
  }
}
