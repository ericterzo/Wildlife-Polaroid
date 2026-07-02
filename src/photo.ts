import * as THREE from 'three';
import { Animal, SPECIES_BY_ID, describeSize } from './animals';

export interface PhotoRecord {
  species: string;
  order: number; // 1-based capture order — the book is sorted by this
  stars: number; // 1..3
  points: number;
  sizeFactor: number;
  sizeLabel: string;
  day: number;
  combo?: number; // animals in frame (>= 2 means combo bonus was applied)
  flying?: boolean; // bird photographed in flight
  dataUrl: string; // composited polaroid JPEG
}

export interface ShotScore {
  subject: Animal | null; // the closest animal in frame — the album entry
  extras: Animal[]; // everything else that made it into the shot
  stars: number;
  quality: number; // 0..1 framing quality of the subject
  combo: number; // total animals in frame
  flying: boolean;
}

const MAX_PHOTO_DIST = 60;

/** Rarer species are worth more per shot. */
function rarityPoints(rarity: number): number {
  return Math.round(18 / rarity);
}

/**
 * Score a shot. Every un-occluded animal in frame counts; the CLOSEST one is
 * the subject the photo is filed under. Framing quality blends how centered
 * the subject is with how much of the frame it fills — and for tiny
 * specimens, centering is nearly everything, since they can't fill a frame.
 */
export function scoreShot(camera: THREE.PerspectiveCamera, animals: Animal[], occluders: THREE.Object3D[]): ShotScore {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector3();
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  interface Hit {
    animal: Animal;
    dist: number;
    offset: number;
    occupancy: number;
  }
  const hits: Hit[] = [];

  for (const a of animals) {
    const focus = a.focusPoint;
    const dist = camera.position.distanceTo(focus);
    if (dist > MAX_PHOTO_DIST || dist < 0.5) continue;
    ndc.copy(focus).project(camera);
    if (ndc.z > 1 || Math.abs(ndc.x) > 0.92 || Math.abs(ndc.y) > 0.88) continue;

    // occlusion: cast a ray at the subject; anything solid in front blocks it
    const dir = focus.clone().sub(camera.position).normalize();
    raycaster.set(camera.position, dir);
    raycaster.far = dist - a.boundRadius;
    if (raycaster.far > 0.1 && raycaster.intersectObjects(occluders, false).length > 0) continue;

    // occupancy: rough fraction of the frame height the animal fills
    // (zooming in raises it — the telephoto is how you "get closer" safely)
    const occupancy = a.boundRadius / (dist * tanHalfFov);
    hits.push({ animal: a, dist, offset: Math.hypot(ndc.x, ndc.y), occupancy });
  }

  if (hits.length === 0) return { subject: null, extras: [], stars: 0, quality: 0, combo: 0, flying: false };

  hits.sort((h1, h2) => h1.dist - h2.dist);
  const main = hits[0];
  const quality = framingQuality(main.animal, main.offset, main.occupancy);

  // Harder stars: 3 means genuinely well-shot — filled frame AND centered.
  let stars = 1;
  if (quality >= 0.45) stars = 2;
  if (quality >= 0.75) stars = 3;

  return {
    subject: main.animal,
    extras: hits.slice(1).map((h) => h.animal),
    stars,
    quality,
    combo: hits.length,
    flying: main.animal.flying,
  };
}

/**
 * 0..1 framing quality. Centering and frame occupancy, weighted by specimen
 * size: a MASSIVE cow should fill the frame; a teeny-tiny robin physically
 * can't, so its score comes almost entirely from how centered it is.
 */
function framingQuality(a: Animal, offset: number, occupancy: number): number {
  const center01 = THREE.MathUtils.clamp(1 - offset / 0.85, 0, 1);
  const occ01 = THREE.MathUtils.clamp(occupancy / 0.55, 0, 1);
  const occWeight = 0.6 * THREE.MathUtils.clamp(a.size.factor / 0.8, 0.15, 1);
  return occWeight * occ01 + (1 - occWeight) * center01;
}

export function computePoints(subject: Animal, quality: number, combo: number, flying: boolean): number {
  const size = describeSize(subject.size.factor);
  const base = rarityPoints(subject.def.rarity) * size.bonus;
  const framing = 0.35 + 2.4 * Math.pow(quality, 1.25); // bad framing ~0.4x, perfect ~2.75x
  const comboMult = 1 + 0.4 * Math.min(4, Math.max(0, combo - 1)); // +40% per extra animal, cap +160%
  const flyMult = flying ? 1.5 : 1;
  return Math.max(1, Math.round(base * framing * comboMult * flyMult));
}

/**
 * Composite the polaroid: crop the center square of the rendered frame, warm
 * it up a little, and mount it in a white frame with a handwritten caption.
 */
export function makePolaroid(
  source: HTMLCanvasElement,
  caption: string,
  subCaption: string
): string {
  const size = Math.min(source.width, source.height);
  const sx = (source.width - size) / 2;
  const sy = (source.height - size) / 2;

  const c = document.createElement('canvas');
  c.width = 440;
  c.height = 524;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f0e6';
  ctx.fillRect(0, 0, c.width, c.height);
  // slight frame shading
  ctx.fillStyle = '#e7e2d4';
  ctx.fillRect(0, 0, c.width, 6);
  ctx.fillRect(0, 0, 6, c.height);

  ctx.save();
  ctx.filter = 'saturate(0.88) sepia(0.14) contrast(1.04) brightness(1.02)';
  ctx.drawImage(source, sx, sy, size, size, 20, 20, 400, 400);
  ctx.restore();
  // vignette
  const grad = ctx.createRadialGradient(220, 220, 150, 220, 220, 300);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(30,20,10,0.28)');
  ctx.fillStyle = grad;
  ctx.fillRect(20, 20, 400, 400);
  // inner border
  ctx.strokeStyle = 'rgba(60,50,40,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 400, 400);

  ctx.fillStyle = '#3a3630';
  ctx.font = '28px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.textAlign = 'center';
  ctx.fillText(caption, 220, 462, 400);
  ctx.font = '20px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.fillStyle = '#6a635a';
  ctx.fillText(subCaption, 220, 496, 400);

  return c.toDataURL('image/jpeg', 0.82);
}

export function captionFor(record: PhotoRecord): { main: string; sub: string } {
  const def = SPECIES_BY_ID.get(record.species);
  const name = def ? def.name : record.species;
  const main = record.sizeLabel ? `${record.sizeLabel} ${name}` : name;
  const stars = '★'.repeat(record.stars) + '☆'.repeat(3 - record.stars);
  const tags: string[] = [];
  if (record.flying) tags.push('in flight!');
  if ((record.combo ?? 1) > 1) tags.push(`×${record.combo} combo`);
  const tail = tags.length > 0 ? ' · ' + tags.join(' · ') : '';
  return { main, sub: `${stars} · Day ${record.day} · ${record.points} pts${tail}` };
}
