import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { AnimalSpawner, SPECIES_BY_ID } from './animals';
import { PhotoRecord, scoreShot, computePoints, makePolaroid, captionFor } from './photo';
import { SaveData, downloadSave, parseSaveZip, buildSaveZip, autosave, loadAutosave, dayOf } from './save';
import { UI } from './ui';
import { AmbientMusic } from './music';
import { generatePortraits } from './gallery';
import { ZombieMode } from './zombie';

type GameState = 'title' | 'playing' | 'book' | 'paused' | 'gameover';

/** Touch devices get on-screen controls instead of pointer lock + keyboard. */
const IS_TOUCH =
  new URLSearchParams(location.search).has('touch') ||
  window.matchMedia('(pointer: coarse)').matches ||
  'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
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
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
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

const SFX_KEY = 'wildlife-polaroid-sfx-vol';
let sfxVolume = (() => {
  const v = Number(localStorage.getItem(SFX_KEY));
  return Number.isFinite(v) && localStorage.getItem(SFX_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.8;
})();
function setSfxVolume(v: number) {
  sfxVolume = Math.min(1, Math.max(0, v));
  localStorage.setItem(SFX_KEY, String(sfxVolume));
}

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
function ensureAudio(): AudioContext | null {
  try {
    audioCtx ??= new AudioContext();
    if (!noiseBuffer) {
      noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function blip(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.06) {
  const ctx = ensureAudio();
  if (!ctx || sfxVolume <= 0) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain * sfxVolume, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + dur);
}

/** Filtered noise burst — the building block of mechanical camera noises. */
function noiseHit(ctx: AudioContext, at: number, dur: number, freq: number, q: number, gain: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer!;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain * sfxVolume, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(at);
  src.stop(at + dur + 0.05);
}

/**
 * A polaroid taking a picture, in under a second: the sharp shutter CLICK,
 * then the motor whirring as it ejects the print, then a soft final clunk.
 */
const shutterSound = () => {
  const ctx = ensureAudio();
  if (!ctx || sfxVolume <= 0) return;
  const t = ctx.currentTime;
  // 1) shutter click
  noiseHit(ctx, t, 0.035, 3400, 1.2, 0.5);
  noiseHit(ctx, t + 0.012, 0.03, 1500, 1.5, 0.3);
  // 2) eject motor whirr (~0.6s) — buzzy noise with a motor-speed flutter
  const motor = ctx.createBufferSource();
  motor.buffer = noiseBuffer!;
  motor.loop = true;
  const mb = ctx.createBiquadFilter();
  mb.type = 'bandpass';
  mb.frequency.setValueAtTime(950, t + 0.08);
  mb.frequency.linearRampToValueAtTime(720, t + 0.7); // motor slows as the print emerges
  mb.Q.value = 2.5;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(0.0001, t + 0.07);
  mg.gain.exponentialRampToValueAtTime(0.11 * sfxVolume, t + 0.12);
  mg.gain.setValueAtTime(0.11 * sfxVolume, t + 0.6);
  mg.gain.exponentialRampToValueAtTime(0.0001, t + 0.74);
  const flutter = ctx.createOscillator(); // gear teeth
  flutter.frequency.value = 26;
  const fg = ctx.createGain();
  fg.gain.value = 0.05 * sfxVolume;
  flutter.connect(fg).connect(mg.gain);
  motor.connect(mb).connect(mg).connect(ctx.destination);
  motor.start(t + 0.07);
  motor.stop(t + 0.8);
  flutter.start(t + 0.07);
  flutter.stop(t + 0.8);
  // 3) the print clunks free
  noiseHit(ctx, t + 0.72, 0.05, 600, 1.2, 0.22);
};
const newSpeciesSound = () => {
  blip(660, 0.1, 'triangle', 0.07);
  setTimeout(() => blip(880, 0.14, 'triangle', 0.07), 110);
  setTimeout(() => blip(1320, 0.2, 'triangle', 0.06), 230);
};

// zombie-mode noises
const swingSound = () => {
  const ctx = ensureAudio();
  if (!ctx || sfxVolume <= 0) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer!;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(350, t);
  bp.frequency.exponentialRampToValueAtTime(1600, t + 0.16); // whoosh rises
  bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18 * sfxVolume, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.25);
};
const squishSound = () => {
  const ctx = ensureAudio();
  if (!ctx || sfxVolume <= 0) return;
  noiseHit(ctx, ctx.currentTime, 0.14, 240, 0.8, 0.4);
  blip(90, 0.16, 'sine', 0.12);
};
const hurtSound = () => {
  blip(180, 0.22, 'sawtooth', 0.1);
  const ctx = ensureAudio();
  if (ctx && sfxVolume > 0) noiseHit(ctx, ctx.currentTime, 0.1, 900, 1, 0.2);
};
const deathSound = () => {
  blip(330, 0.3, 'sawtooth', 0.09);
  setTimeout(() => blip(247, 0.35, 'sawtooth', 0.09), 260);
  setTimeout(() => blip(165, 0.8, 'sawtooth', 0.1), 540);
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
let shotCooldown = 0; // while > 0, the polaroid is still developing — no photos
let autosaveTimer = 0;
let wasLocked = false;
const DEVELOP_TIME = 2.6; // seconds a photo takes to develop
let easyMode = false;

const music = new AmbientMusic();

const zombie = new ZombieMode(
  scene,
  camera,
  { swing: swingSound, squish: squishSound, hurt: hurtSound, death: deathSound },
  () => {
    // the horde got you
    state = 'gameover';
    session?.player.clearKeys();
    document.exitPointerLock();
    document.getElementById('gameover-stats')!.textContent =
      `You survived ${zombie.day} day${zombie.day === 1 ? '' : 's'} and put down ${zombie.kills} zombie${zombie.kills === 1 ? '' : 's'}.`;
    document.getElementById('gameover-score')!.textContent =
      `${zombie.day} × 100 + ${zombie.kills} × 10 = ${zombie.score} points`;
    document.getElementById('gameover')!.classList.remove('hidden');
    document.getElementById('hud')!.classList.add('hidden');
  }
);

function endZombieMode() {
  if (!zombie.active && !zombie.dead) return;
  if (session) zombie.end(session.spawner);
  document.getElementById('gameover')!.classList.add('hidden');
  document.getElementById('zombie-hud')!.classList.add('hidden');
}

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
    if (!IS_TOUCH) renderer.domElement.requestPointerLock();
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
    endZombieMode();
    if (session) autosave(snapshot(session));
    state = 'title';
    document.exitPointerLock();
    ui.showTitle(loadAutosave() !== null);
  },
  onCloseBook: () => {
    if (state === 'book') {
      state = 'playing';
      ui.closeBook();
    }
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
    endZombieMode();
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
    session.spawner.easy = easyMode;
    state = 'playing';
    ui.showPlaying();
    updateScore();
    music.start(); // begins the ambient loop (needs the user gesture that got us here)
    const look = IS_TOUCH ? 'drag to look around' : 'click to look around';
    ui.toast(isNew ? `Welcome to world ${data.seed >>> 0} — ${look}` : `Trip restored — ${look}`);
  }, 40);
}

function updateScore() {
  if (!session) return;
  const pts = session.photos.reduce((a, r) => a + r.points, 0);
  ui.setScore(session.photos.length, session.photos.length, pts, dayOf(session.elapsed));
}

// ------------------------------------------------------------------ photo

function takePhoto() {
  if (!session || shotCooldown > 0) return; // previous photo still developing
  shotCooldown = DEVELOP_TIME;
  renderer.render(scene, camera); // guarantee a fresh frame in the buffer
  const shot = scoreShot(camera, session.spawner.animals, session.world.occluders);
  ui.flash();
  shutterSound();
  const day = dayOf(session.elapsed);

  if (!shot.subject) {
    const url = makePolaroid(renderer.domElement, 'Just scenery…', `Day ${day}`);
    ui.develop(url, DEVELOP_TIME);
    ui.toast('No animal in frame');
    return;
  }

  const subject = shot.subject;
  const points = computePoints(subject, shot.quality, shot.combo, shot.flying);
  const rec: PhotoRecord = {
    species: subject.def.id,
    order: 0,
    stars: shot.stars,
    points,
    sizeFactor: subject.size.factor,
    sizeLabel: subject.size.label,
    day,
    combo: shot.combo,
    flying: shot.flying,
    dataUrl: '',
  };
  const cap = captionFor(rec);
  rec.dataUrl = makePolaroid(renderer.domElement, cap.main, cap.sub);

  const tags: string[] = [];
  if (shot.combo > 1) tags.push(`×${shot.combo} combo!`);
  if (shot.flying) tags.push('in flight!');
  const tagText = tags.length > 0 ? '  ' + tags.join(' ') : '';

  const existing = session.photos.find((p) => p.species === subject.def.id);
  if (!existing) {
    rec.order = session.photos.length + 1;
    session.photos.push(rec);
    newSpeciesSound();
    ui.toast(`NEW — ${cap.main}!  ${'★'.repeat(shot.stars)}${tagText}  +${points} pts`);
  } else if (points > existing.points) {
    rec.order = existing.order;
    session.photos[session.photos.indexOf(existing)] = rec;
    ui.toast(`Better shot — ${cap.main}  ${'★'.repeat(shot.stars)}${tagText}  ${points} pts`);
  } else {
    ui.toast(`${cap.main}  ${'★'.repeat(shot.stars)} — your old shot was better`);
  }
  ui.develop(rec.dataUrl, DEVELOP_TIME);

  // the shutter spooks everyone who was in the shot
  for (const a of [subject, ...shot.extras]) {
    if (a.position.distanceTo(session.player.position) < a.def.fleeDist * 1.3) {
      a.spook(session.player.position);
    }
  }

  updateScore();
  autosave(snapshot(session));
}

// ------------------------------------------------------------------ input

const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const waterOverlay = document.getElementById('water-overlay')!;

// instructions overlay (title screen + pause menu)
const helpEl = document.getElementById('help')!;
for (const id of ['btn-help', 'btn-help2']) {
  document.getElementById(id)!.addEventListener('click', () => helpEl.classList.remove('hidden'));
}
document.getElementById('btn-help-close')!.addEventListener('click', () => helpEl.classList.add('hidden'));

// audio sliders (pause menu)
const musicSlider = document.getElementById('vol-music') as HTMLInputElement;
const sfxSlider = document.getElementById('vol-sfx') as HTMLInputElement;
musicSlider.value = String(Math.round(music.volume * 100));
sfxSlider.value = String(Math.round(sfxVolume * 100));
musicSlider.addEventListener('input', () => {
  music.setVolume(Number(musicSlider.value) / 100);
  music.start();
});
sfxSlider.addEventListener('input', () => setSfxVolume(Number(sfxSlider.value) / 100));
sfxSlider.addEventListener('change', () => shutterSound()); // preview the new level

// cheats submenu + species gallery
const cheatsEl = document.getElementById('cheats')!;
const galleryEl = document.getElementById('gallery')!;
document.getElementById('btn-cheats')!.addEventListener('click', () => cheatsEl.classList.remove('hidden'));
document.getElementById('btn-cheats-close')!.addEventListener('click', () => cheatsEl.classList.add('hidden'));
document.getElementById('btn-gallery')!.addEventListener('click', () => {
  galleryEl.classList.remove('hidden');
  // give the overlay a frame to paint its loading note, then render portraits
  setTimeout(() => {
    const grid = document.getElementById('gallery-grid')!;
    if (grid.querySelector('.gallery-card')) return; // already built
    const portraits = generatePortraits();
    grid.innerHTML = '';
    for (const p of portraits) {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const img = document.createElement('img');
      img.src = p.dataUrl;
      img.alt = p.name;
      const name = document.createElement('div');
      name.className = 'g-name';
      name.textContent = p.name;
      card.append(img, name);
      grid.appendChild(card);
    }
  }, 60);
});
document.getElementById('btn-gallery-close')!.addEventListener('click', () => galleryEl.classList.add('hidden'));

// easy mode: way more animals, closer, bigger
const easyBtn = document.getElementById('btn-easy')!;
easyBtn.addEventListener('click', () => {
  easyMode = !easyMode;
  if (session) session.spawner.easy = easyMode;
  easyBtn.textContent = `Easy mode: ${easyMode ? 'ON' : 'off'}`;
});

// zombie survival
document.getElementById('btn-zombie')!.addEventListener('click', () => {
  if (!session) return;
  cheatsEl.classList.add('hidden');
  ui.hidePause();
  state = 'playing';
  endZombieMode();
  zombie.begin(session.spawner);
  document.getElementById('zombie-hud')!.classList.remove('hidden');
  ui.toast('🧟 They can smell you. Swing with the shutter button. Survive.');
  if (!IS_TOUCH) canvas.requestPointerLock();
});

document.getElementById('btn-go-return')!.addEventListener('click', () => {
  endZombieMode();
  state = 'playing';
  document.getElementById('hud')!.classList.remove('hidden');
  ui.toast('Just a bad dream. The animals are back to normal.');
});
document.getElementById('btn-go-quit')!.addEventListener('click', () => {
  endZombieMode();
  if (session) autosave(snapshot(session));
  state = 'title';
  ui.showTitle(loadAutosave() !== null);
});

if (!IS_TOUCH) {
  canvas.addEventListener('mousedown', (e) => {
    if (state !== 'playing' || !session) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) shootOrSwing();
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
}

// -------------------------------------------------------- touch controls

let touchZoomFov = 70; // driven by the side slider

if (IS_TOUCH) {
  canvas.style.touchAction = 'none';

  // drag anywhere on the view to look around
  let lookId: number | null = null;
  let lookX = 0;
  let lookY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' && !e.isPrimary) return;
    if (state !== 'playing' || lookId !== null) return;
    lookId = e.pointerId;
    lookX = e.clientX;
    lookY = e.clientY;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId || state !== 'playing' || !session) return;
    // zoomed in = finer look control, like a real camera
    const sens = 2.6 * (camera.fov / 70);
    session.player.onMouse((e.clientX - lookX) * sens, (e.clientY - lookY) * sens);
    lookX = e.clientX;
    lookY = e.clientY;
  });
  const endLook = (e: PointerEvent) => {
    if (e.pointerId === lookId) lookId = null;
  };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  // joystick: relative to view — up = forward, push to the edge to run
  const stick = document.getElementById('joystick')!;
  const knob = document.getElementById('joystick-knob')!;
  let stickId: number | null = null;
  const KNOB_RANGE = 46;
  const setStick = (f: number, s: number) => {
    if (session) {
      session.player.analog.f = f;
      session.player.analog.s = s;
    }
    knob.style.transform = `translate(${s * KNOB_RANGE}px, ${-f * KNOB_RANGE}px)`;
  };
  const stickMove = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect();
    let sx = (e.clientX - (r.left + r.width / 2)) / KNOB_RANGE;
    let sy = ((r.top + r.height / 2) - e.clientY) / KNOB_RANGE;
    const mag = Math.hypot(sx, sy);
    if (mag > 1) {
      sx /= mag;
      sy /= mag;
    }
    setStick(sy, sx);
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (stickId !== null || state !== 'playing') return;
    stickId = e.pointerId;
    try {
      stick.setPointerCapture(e.pointerId); // keep tracking if the finger drifts off
    } catch {
      /* synthetic events have no active pointer */
    }
    stickMove(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) stickMove(e);
  });
  const stickEnd = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    setStick(0, 0);
  };
  stick.addEventListener('pointerup', stickEnd);
  stick.addEventListener('pointercancel', stickEnd);

  document.getElementById('t-snap')!.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'playing') shootOrSwing();
  });

  document.getElementById('t-book')!.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggleBook();
  });

  document.getElementById('t-cog')!.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state !== 'playing' || !session) return;
    state = 'paused';
    session.player.clearKeys();
    const pts = session.photos.reduce((a, r) => a + r.points, 0);
    autosave(snapshot(session));
    ui.showPause(`World ${session.seed >>> 0} · Day ${dayOf(session.elapsed)} · ${session.photos.length} species · ${pts} pts`);
  });

  const slider = document.getElementById('zoom-slider') as HTMLInputElement;
  slider.addEventListener('input', () => {
    touchZoomFov = Number(slider.value);
  });
}

/** The one action button: camera normally, hatchet while zombies roam. */
function shootOrSwing() {
  if (!session) return;
  if (zombie.active) zombie.trySwing(session.spawner, session.player);
  else takePhoto();
}

function toggleBook() {
  if (state === 'playing' && zombie.active) {
    ui.toast('No time for scrapbooking — they are COMING');
    return;
  }
  if (state === 'playing' && session) {
    state = 'book';
    session.player.clearKeys();
    aiming = false;
    ui.openBook(session.photos);
    if (!IS_TOUCH) document.exitPointerLock();
  } else if (state === 'book') {
    state = 'playing';
    ui.closeBook();
    if (!IS_TOUCH) canvas.requestPointerLock();
  }
}

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
    toggleBook();
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
    const depth = session.player.waterDepth;
    // zombies are drawn to noise regardless; noiseFactor only matters in normal mode
    session.spawner.update(dt, session.player.position, session.player.noiseFactor, depth);
    if (zombie.active) {
      zombie.update(dt, session.spawner, session.player, session.world);
      const hud = document.getElementById('zombie-hud')!;
      hud.textContent = zombie.hudText();
    }

    // wading: blue rises from the bottom of the screen with depth
    const waterPct = Math.min(48, Math.max(0, depth - 0.15) * 26);
    waterOverlay.style.height = waterPct > 1 ? `${waterPct}vh` : '0px';

    // camera zoom: slider on touch, right-click on desktop (no zoom on a hatchet)
    const targetFov = zombie.active ? 70 : IS_TOUCH ? touchZoomFov : aiming ? 40 : 70;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 10));
      camera.updateProjectionMatrix();
    }
    ui.setViewfinder(!zombie.active && camera.fov < 58);

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
  get fov() {
    return camera.fov;
  },
  get cooldown() {
    return shotCooldown;
  },
  get zombie() {
    return zombie;
  },
  swing: shootOrSwing,
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
