import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { AnimalSpawner, SPECIES_BY_ID } from './animals';
import { PhotoRecord, scoreShot, computePoints, makePolaroid, captionFor } from './photo';
import { SaveData, downloadSave, parseSaveZip, buildSaveZip, autosave, loadAutosave, dayOf } from './save';
import { UI } from './ui';

type GameState = 'title' | 'playing' | 'book' | 'paused';

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const SKY = new THREE.Color('#cfe3f0');
const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 55, 330);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight('#d8ecf7', '#5f6f4c', 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d8', 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -75;
sun.shadow.camera.right = 75;
sun.shadow.camera.top = 75;
sun.shadow.camera.bottom = -75;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ audio

let audioCtx: AudioContext | null = null;
function blip(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.06) {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch {
    /* audio is a garnish */
  }
}
const shutterSound = () => {
  blip(2600, 0.05, 'square', 0.05);
  setTimeout(() => blip(1400, 0.06, 'square', 0.04), 55);
};
const newSpeciesSound = () => {
  blip(660, 0.1, 'triangle', 0.07);
  setTimeout(() => blip(880, 0.14, 'triangle', 0.07), 110);
  setTimeout(() => blip(1320, 0.2, 'triangle', 0.06), 230);
};

// ------------------------------------------------------------------ state

interface Session {
  seed: number;
  world: World;
  player: Player;
  spawner: AnimalSpawner;
  photos: PhotoRecord[];
  elapsed: number;
}

let state: GameState = 'title';
let session: Session | null = null;
let aiming = false;
let shotCooldown = 0;
let autosaveTimer = 0;
let wasLocked = false;

const ui = new UI({
  onNewGame: (seed) => beginTrip({ seed, elapsed: 0, player: null as never, photos: [] }, true),
  onContinue: () => {
    const data = loadAutosave();
    if (data) beginTrip(data, false);
  },
  onLoadFile: async (file) => {
    try {
      ui.titleStatus('Reading save…');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const data = parseSaveZip(bytes);
      beginTrip(data, false);
    } catch (e) {
      ui.titleStatus(e instanceof Error ? e.message : 'Could not read that file.');
      ui.showTitle(loadAutosave() !== null);
    }
  },
  onResume: () => {
    renderer.domElement.requestPointerLock();
    // pointerlockchange handler completes the transition
    state = 'playing';
    ui.hidePause();
  },
  onSave: () => {
    if (session) {
      downloadSave(snapshot(session));
      ui.toast('Save downloaded — keep that zip safe!');
    }
  },
  onQuit: () => {
    if (session) autosave(snapshot(session));
    state = 'title';
    document.exitPointerLock();
    ui.showTitle(loadAutosave() !== null);
  },
});

function snapshot(s: Session): SaveData {
  return {
    seed: s.seed,
    elapsed: s.elapsed,
    player: { x: s.player.position.x, z: s.player.position.z, yaw: s.player.yaw, pitch: s.player.pitch },
    photos: s.photos,
  };
}

function beginTrip(data: SaveData, isNew: boolean) {
  ui.titleStatus('Developing the world…');
  // let the status paint before the synchronous world build
  setTimeout(() => {
    if (session) {
      session.spawner.clear();
      scene.remove(session.world.group);
    }
    const world = new World(data.seed);
    scene.add(world.group);
    const player = new Player(world, camera);
    if (!isNew && data.player) {
      player.position.set(data.player.x, 0, data.player.z);
      player.yaw = data.player.yaw;
      player.pitch = data.player.pitch;
      player.snapToGround();
    }
    session = {
      seed: data.seed,
      world,
      player,
      spawner: new AnimalSpawner(world, scene),
      photos: data.photos ?? [],
      elapsed: data.elapsed ?? 0,
    };
    state = 'playing';
    ui.showPlaying();
    updateScore();
    ui.toast(isNew ? `Welcome to world ${data.seed >>> 0} — click to look around` : 'Trip restored — click to look around');
  }, 40);
}

function updateScore() {
  if (!session) return;
  const pts = session.photos.reduce((a, r) => a + r.points, 0);
  ui.setScore(session.photos.length, session.photos.length, pts, dayOf(session.elapsed));
}

// ------------------------------------------------------------------ photo

function takePhoto() {
  if (!session || shotCooldown > 0) return;
  shotCooldown = 0.8;
  renderer.render(scene, camera); // guarantee a fresh frame in the buffer
  const { subject, stars } = scoreShot(camera, session.spawner.animals, session.world.occluders);
  ui.flash();
  shutterSound();
  const day = dayOf(session.elapsed);

  if (!subject) {
    const url = makePolaroid(renderer.domElement, 'Just scenery…', `Day ${day}`);
    ui.develop(url);
    ui.toast('No animal in frame');
    return;
  }

  const points = computePoints(subject, stars);
  const rec: PhotoRecord = {
    species: subject.def.id,
    order: 0,
    stars,
    points,
    sizeFactor: subject.size.factor,
    sizeLabel: subject.size.label,
    day,
    dataUrl: '',
  };
  const cap = captionFor(rec);
  rec.dataUrl = makePolaroid(renderer.domElement, cap.main, cap.sub);

  const existing = session.photos.find((p) => p.species === subject.def.id);
  if (!existing) {
    rec.order = session.photos.length + 1;
    session.photos.push(rec);
    newSpeciesSound();
    ui.toast(`NEW — ${cap.main}!  ${'★'.repeat(stars)}  +${points} pts`);
  } else if (points > existing.points) {
    rec.order = existing.order;
    session.photos[session.photos.indexOf(existing)] = rec;
    ui.toast(`Better shot — ${cap.main}  ${'★'.repeat(stars)}  ${points} pts`);
  } else {
    ui.toast(`${cap.main}  ${'★'.repeat(stars)} — your old shot was better`);
  }
  ui.develop(rec.dataUrl);

  // the shutter spooks nearby subjects
  const dist = subject.position.distanceTo(session.player.position);
  if (dist < subject.def.fleeDist * 1.3) subject.spook(session.player.position);

  updateScore();
  autosave(snapshot(session));
}

// ------------------------------------------------------------------ input

const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || !session) return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
    return;
  }
  if (e.button === 0) takePhoto();
  if (e.button === 2) aiming = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) aiming = false;
});

document.addEventListener('mousemove', (e) => {
  if (state === 'playing' && session && document.pointerLockElement === canvas) {
    session.player.onMouse(e.movementX, e.movementY);
  }
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && wasLocked && state === 'playing') {
    // user pressed Esc — pause
    state = 'paused';
    session?.player.clearKeys();
    aiming = false;
    if (session) {
      const pts = session.photos.reduce((a, r) => a + r.points, 0);
      autosave(snapshot(session));
      ui.showPause(`World ${session.seed >>> 0} · Day ${dayOf(session.elapsed)} · ${session.photos.length} species · ${pts} pts`);
    }
  }
  wasLocked = locked;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (state === 'playing' && session) {
      state = 'book';
      session.player.clearKeys();
      aiming = false;
      ui.openBook(session.photos);
      document.exitPointerLock();
    } else if (state === 'book') {
      state = 'playing';
      ui.closeBook();
      canvas.requestPointerLock();
    }
    return;
  }
  if (state === 'book') {
    if (e.code === 'ArrowLeft') ui.flipBook(-1);
    if (e.code === 'ArrowRight') ui.flipBook(1);
    if (e.code === 'Escape') {
      state = 'playing';
      ui.closeBook();
    }
    return;
  }
  if (state === 'playing' && session) session.player.onKey(e.code, true);
});
window.addEventListener('keyup', (e) => {
  if (state === 'playing' && session) session.player.onKey(e.code, false);
});

window.addEventListener('beforeunload', () => {
  if (session) autosave(snapshot(session));
});

// ------------------------------------------------------------------- loop

const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (session && state === 'playing') {
    session.elapsed += dt;
    shotCooldown -= dt;
    autosaveTimer += dt;
    if (autosaveTimer > 10) {
      autosaveTimer = 0;
      autosave(snapshot(session));
      updateScore();
    }
    session.player.update(dt);
    session.spawner.update(dt, session.player.position, session.player.noiseFactor);

    // camera zoom while aiming
    const targetFov = aiming ? 40 : 70;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 10));
      camera.updateProjectionMatrix();
    }
    ui.setViewfinder(aiming);

    // golden-hour sun follows the player so shadows stay crisp
    sun.position.set(session.player.position.x + 70, 95, session.player.position.z + 45);
    sun.target.position.copy(session.player.position);
  }

  if (session) renderer.render(scene, camera);
}
tick();

// ------------------------------------------------------------------ boot

ui.showTitle(loadAutosave() !== null);

// Debug/test hook — lets automated checks drive the game without pointer lock.
(window as unknown as Record<string, unknown>).__game = {
  start: (seed: number) => beginTrip({ seed, elapsed: 0, player: null as never, photos: [] }, true),
  get state() {
    return state;
  },
  get session() {
    return session;
  },
  takePhoto,
  snapshot: () => (session ? snapshot(session) : null),
  openBook: () => {
    if (session) ui.openBook(session.photos);
  },
  lookAt: (x: number, y: number, z: number) => camera.lookAt(x, y, z),
  buildZip: () => (session ? buildSaveZip(snapshot(session)) : null),
  parseZip: (bytes: Uint8Array) => parseSaveZip(bytes),
  loadTrip: (data: SaveData) => beginTrip(data, false),
  SPECIES_BY_ID,
};
