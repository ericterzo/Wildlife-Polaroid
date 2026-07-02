import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { PhotoRecord } from './photo';

export interface SaveData {
  seed: number;
  elapsed: number; // in-game seconds, drives the day counter
  player: { x: number; z: number; yaw: number; pitch: number };
  photos: PhotoRecord[];
}

const FORMAT = 'wildlife-polaroid-save';
const AUTOSAVE_KEY = 'wildlife-polaroid-autosave-v1';

interface Manifest {
  format: string;
  version: number;
  seed: number;
  elapsed: number;
  player: { x: number; z: number; yaw: number; pitch: number };
  photos: Array<Omit<PhotoRecord, 'dataUrl'> & { file: string }>;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return 'data:image/jpeg;base64,' + btoa(bin);
}

/** Build the save zip: manifest.json + every polaroid as a real JPEG. */
export function buildSaveZip(data: SaveData): Blob {
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  const manifest: Manifest = {
    format: FORMAT,
    version: 1,
    seed: data.seed,
    elapsed: data.elapsed,
    player: data.player,
    photos: data.photos.map((p) => {
      const file = `photos/${String(p.order).padStart(3, '0')}_${p.species}.jpg`;
      files[file] = [dataUrlToBytes(p.dataUrl), { level: 0 }];
      const { dataUrl, ...meta } = p;
      return { ...meta, file };
    }),
  };
  files['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 0 }];
  files['README.txt'] = [
    strToU8(
      'Wildlife Polaroid save file.\n' +
        'Load it from the title screen ("Load save file") to continue your trip —\n' +
        'same world, same spot, and your photo book with every polaroid you took.\n'
    ),
    { level: 0 },
  ];
  const zipped = zipSync(files);
  return new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
}

export function parseSaveZip(bytes: Uint8Array): SaveData {
  const files = unzipSync(bytes);
  const manifestRaw = files['manifest.json'];
  if (!manifestRaw) throw new Error('Not a Wildlife Polaroid save: manifest.json missing');
  const manifest = JSON.parse(strFromU8(manifestRaw)) as Manifest;
  if (manifest.format !== FORMAT) throw new Error('Not a Wildlife Polaroid save file');
  const photos: PhotoRecord[] = manifest.photos.map((p) => {
    const img = files[p.file];
    const { file, ...meta } = p;
    return { ...meta, dataUrl: img ? bytesToDataUrl(img) : '' };
  });
  photos.sort((a, b) => a.order - b.order);
  return { seed: manifest.seed, elapsed: manifest.elapsed, player: manifest.player, photos };
}

export function downloadSave(data: SaveData) {
  const blob = buildSaveZip(data);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wildlife-polaroid-world${data.seed}-day${dayOf(data.elapsed)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function dayOf(elapsed: number): number {
  return Math.floor(elapsed / 300) + 1; // one in-game day = 5 real minutes
}

// -- autosave (same-device convenience; the zip is the real save) ------------

export function autosave(data: SaveData) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — drop oldest duplicate-species photos' images and retry once
    try {
      const slim = { ...data, photos: data.photos.slice(-24) };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(slim));
    } catch {
      /* give up quietly; zip saving still works */
    }
  }
}

export function loadAutosave(): SaveData | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (typeof data.seed !== 'number' || !data.player) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}
