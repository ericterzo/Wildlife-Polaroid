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
  dataUrl: string; // composited polaroid JPEG
}

export interface ShotResult {
  subject: Animal | null;
  stars: number;
  points: number;
  dataUrl: string;
}

const MAX_PHOTO_DIST = 60;

/** Rarer species are worth more per shot. */
function rarityPoints(rarity: number): number {
  return Math.round(18 / rarity);
}

export function scoreShot(camera: THREE.PerspectiveCamera, animals: Animal[], occluders: THREE.Object3D[]): { subject: Animal | null; stars: number; centerOffset: number } {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector3();
  let best: Animal | null = null;
  let bestScore = -Infinity;
  let bestOffset = 1;
  let bestApparent = 0;

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
    const hits = raycaster.intersectObjects(occluders, false);
    if (hits.length > 0) continue;

    const offset = Math.hypot(ndc.x, ndc.y);
    const apparent = a.boundRadius / dist; // rough size on screen
    const score = apparent * 3 + (1 - offset);
    if (score > bestScore) {
      bestScore = score;
      best = a;
      bestOffset = offset;
      bestApparent = apparent;
    }
  }

  if (!best) return { subject: null, stars: 0, centerOffset: 1 };
  let stars = 1;
  if (bestApparent > 0.05) stars++; // filled the frame
  if (bestOffset < 0.32) stars++; // well centered
  return { subject: best, stars, centerOffset: bestOffset };
}

export function computePoints(animal: Animal, stars: number): number {
  const size = describeSize(animal.size.factor);
  return Math.round(rarityPoints(animal.def.rarity) * stars * size.bonus);
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
  return { main, sub: `${stars} · Day ${record.day} · ${record.points} pts` };
}
