# Wildlife Polaroid — Development Plan

A 3D open-world browser game. The player explores a procedurally generated countryside in first person, armed with nothing but a polaroid camera and a photobook, trying to photograph as many real animal species as possible — an analogue Pokédex.

---

## 1. Core design pillars

1. **Non-violent exploration.** The only "weapon" is a camera. Tension comes from approaching skittish animals without spooking them.
2. **The photobook is the goal.** Every species photographed fills a page. Completing the book is the win condition.
3. **A world worth wandering.** Small towns connected by paths through fields and forests; the world is seeded so it can be regenerated identically from a save code.
4. **Zero-friction saves.** No accounts, no servers. Progress is a short shareable code.

---

## 2. Recommended tech stack

| Concern | Choice | Why |
|---|---|---|
| Rendering | **Three.js** | Best ecosystem for browser 3D, huge community, GLTF-first |
| Language / tooling | **TypeScript + Vite** | Fast dev loop, type safety for game state |
| World generation | **Custom, seeded simplex noise** (`simplex-noise` npm) | Deterministic worlds from a seed — essential for the save-code system |
| Physics / collision | **Simple custom collision** (heightmap sampling + capsule vs. AABB) | A walking sim doesn't need Rapier/Ammo; avoids ~2 MB of WASM |
| Animal models | **GLTF/GLB from CC0 sources** (Quaternius, poly.pizza, Kenney; Sketchfab CC-BY with credits) | Real animal species, free, animation clips included or added via Blender |
| UI (photobook, HUD) | **HTML/CSS overlay** (optionally React, but plain DOM is enough) | Crisp text, easy layout, accessibility — no need to render UI in WebGL |
| Photo capture | **Render-to-texture → canvas → JPEG data URL** | The polaroid is a real screenshot of what the player framed |
| Persistence | **Save code (URL-safe string) + IndexedDB for photo images** | Code alone restores world + progress on any machine; full-res photos persist locally |
| Audio | **Howler.js** or plain WebAudio | Ambient loops per biome, animal calls, shutter click |

No backend required for v1. Everything runs client-side and deploys as a static site (GitHub Pages / Netlify / Cloudflare Pages).

---

## 3. Architecture overview

```
src/
  main.ts               // bootstrap, game loop
  core/
    Game.ts             // state machine: exploring | aiming | photobook | menu
    Input.ts            // pointer lock, WASD, mouse, spacebar
    SaveCode.ts         // encode/decode save codes
  world/
    WorldGen.ts         // seeded generation orchestrator
    Terrain.ts          // chunked heightmap terrain + LOD
    Biomes.ts           // field / forest / town classification
    Towns.ts            // town placement + building layout
    Paths.ts            // path network between towns
    Vegetation.ts       // instanced trees, grass, rocks
  animals/
    Species.ts          // the species registry (data-driven)
    AnimalSpawner.ts    // biome/time-based spawning around player
    AnimalAI.ts         // wander / graze / alert / flee state machine
  photo/
    Camera.ts           // viewfinder mode, zoom, focus
    Shot.ts             // capture, subject detection, scoring
    Polaroid.ts         // composite the framed polaroid image
  ui/
    HUD.ts              // reticle, film counter, hints
    Photobook.ts        // spacebar book with pages of polaroids
    Menu.ts             // title, "enter save code", settings
  storage/
    PhotoStore.ts       // IndexedDB wrapper for photo images
```

### Game state machine

```
        ESC                 right-click / R          spacebar
 Menu ◄─────► Exploring ◄──────────────────► Aiming     │
                  ▲                                     ▼
                  └──────────────────────────────► Photobook
```

- **Exploring:** FPV movement (pointer lock), camera lowered.
- **Aiming:** camera raised to eye, slight zoom, vignette viewfinder overlay; left-click takes the shot.
- **Photobook:** spacebar opens/closes; while open, arrow keys / scroll flip pages.

---

## 4. World generation (seeded & deterministic)

Everything derives from one 32-bit **seed** so the save code can rebuild the identical world.

1. **Heightmap terrain.** 2–3 octaves of simplex noise → rolling hills. Chunked (e.g. 64×64 m chunks, ~9–25 chunks resident around the player) with 2 LOD levels. Far terrain fades into fog — fog is both aesthetic and the performance budget's best friend.
2. **Biome map.** A second, low-frequency noise channel + moisture channel classifies each cell: `field | forest | town-candidate`. Forests get dense instanced trees; fields get grass billboards and hedgerows.
3. **Town placement.** Poisson-disc sample ~4–8 town sites on flat-ish terrain, minimum distance apart. Each town is a handful of low-poly buildings (houses, a church/tower landmark, fences, lamp posts) arranged along a main street with a small plaza. Landmarks are visible from afar for navigation.
4. **Path network.** Connect towns with a minimum spanning tree + 1–2 extra edges for loops. Each edge becomes a spline that follows low terrain-gradient (cheap greedy descent, not full A*), flattening terrain slightly under it and clearing vegetation in a corridor. Paths also branch dead-ends into forests ("trailheads") to reward off-road exploration.
5. **Points of interest.** Ponds (water plane in noise depressions), clearings, a lookout hill — these double as spawn anchors for specific species.

**Determinism rule:** all generation randomness comes from a seeded PRNG (e.g. `mulberry32`), never `Math.random()`. Animal *spawning* may be non-deterministic; the *world* must not be.

---

## 5. Animals

### Species registry (data-driven)

Target **~20 species for v1**, each an entry like:

```ts
{
  id: "red_fox",
  name: "Red Fox",
  model: "fox.glb",
  biomes: ["forest", "field-edge"],
  timeOfDay: ["dawn", "dusk"],        // if day/night cycle ships in v1
  rarity: 0.3,                        // spawn weight
  fleeDistance: 18,                   // meters — how close you can get
  speed: 6,
  scale: 1,
  behaviors: ["wander", "sniff", "flee"],
}
```

Suggested roster by habitat — all real animals:
- **Fields:** rabbit, deer, pheasant, sheep, cow, horse, buzzard (circling overhead)
- **Forests:** red fox, wild boar, badger, squirrel, owl, woodpecker
- **Towns:** cat, dog, pigeon, chicken, house sparrow
- **Water/edges:** duck, heron, frog

Rarity tiers (common → rare) give the photobook its collection curve; the rarest 3–4 species (e.g. badger, owl, boar) only appear in specific biomes/conditions.

### AI: a small state machine is enough

`idle → graze/peck → wander → alert → flee`

- Animals spawn in a ring around the player (60–120 m), despawn beyond ~150 m. Max ~12–15 active animals.
- **Alert/flee** is the core mechanic: each species has a detection radius modified by player speed (sprinting doubles it, crouching halves it) and line of sight. Alerted animals raise their head (photo opportunity!) for 1–2 s, then flee. This creates the stalk-and-shoot gameplay without any complex AI.
- Animation: each model needs idle / walk / run clips minimum. Blend via `THREE.AnimationMixer`.

### Asset pipeline

1. Source CC0/CC-BY low-poly animal packs (Quaternius "Animated Animals" covers most of the roster in one consistent style — strongly recommended so the art style is coherent).
2. Normalize in Blender: consistent scale, origin at feet, clip names standardized (`Idle`, `Walk`, `Run`).
3. Compress with `gltf-transform` (Draco/meshopt) — target < 300 KB per animal.
4. A `CREDITS.md` tracks every asset's license.

---

## 6. The polaroid camera

### Taking a shot (point & click while aiming)

1. Render the current camera view to an offscreen `WebGLRenderTarget` (square crop, e.g. 640×640).
2. **Subject detection — no ML needed:** for each active animal, project its bounding box into screen space and check (a) inside the frame, (b) not occluded (single raycast to its center), (c) within max photo distance.
3. **Score the shot** 1–3 stars: subject size in frame + centering + facing the camera. The best-scoring animal in frame becomes the photo's subject.
4. Composite the polaroid on a 2D canvas: white frame, the captured image slightly desaturated/warmed (polaroid feel), handwritten-font caption with species name + in-game day, e.g. *"Red Fox — Day 3"*. Export as JPEG data URL (~30–60 KB).
5. Shutter click + flash-white transition + a little "photo ejects and develops" animation (the image fades in from milky white over ~2 s). This animation *is* the reward moment — worth polishing.
6. Optional friction knob: film is limited but refills in towns — encourages deliberate shots and gives towns a gameplay purpose.

### Photobook (spacebar)

- Full-screen DOM overlay styled as an open scrapbook; game pauses.
- Photos appear **in the order taken** — the analogue Pokédex. Each polaroid is taped/pinned onto the page; caption underneath; star rating; retaking a species keeps the best shot (or keeps both — flag for playtesting).
- A back-page checklist shows silhouettes of all species: filled when photographed, greyed when not — this is the "gotta catch 'em all" pull.
- Scroll / arrow keys flip pages with a CSS 3D page-turn.

---

## 7. Save system: the code

### What must survive in the code itself (works on any device)

| Field | Size |
|---|---|
| Version | 1 byte |
| World seed | 4 bytes |
| Player position (x, z quantized to 1 m; y derived from terrain) | 4 bytes |
| Player heading | 1 byte |
| In-game day/time | 2 bytes |
| Photographed-species bitmask (order taken not preserved here — see below) | 4–8 bytes (32–64 species) |
| Capture-order + star rating per species (6 bits each × 20) | ~15 bytes |
| Checksum (CRC-8) | 1 byte |

Total ≈ 32–35 bytes → **base32 (Crockford) ≈ a 52–56 character code**, chunked for readability:

```
WPX1-9K3F-A7Q2-MMZ8-4T6B-JH0C-XR5N-P2VD-K8LW-3FQY-7ZT4
```

Long-ish, but copy-pasteable, has a checksum so typos are caught, and is fully self-contained — no server, works across devices.

### What lives in IndexedDB (same device only)

The actual polaroid JPEGs (30–60 KB each — far too big for a code). Keyed by `seed + speciesId`.

**Cross-device rule:** entering a code on a new device restores the world, position, and the photobook's *pages* (species, order, stars, day taken) — but the photo slots show a stylized "faded polaroid" placeholder with the species illustration until re-photographed. On the original device, the real photos are still there. This is an honest, robust compromise; document it in the UI ("Your book traveled, but the photos stayed home — reshoot them!").

Also: autosave the code to `localStorage` continuously and show the current code in the pause menu with a copy button, so "give me a code" is always one click.

---

## 8. Performance budget (the make-or-break for browser 3D)

- **Instancing everywhere:** trees, grass, rocks, fences via `InstancedMesh` — thousands of draw-call-free instances.
- **Chunked world + fog:** only ~1 km² resident; fog hides the edge.
- **LODs:** 2 levels for trees/buildings; animals swap to lower-poly or billboard beyond 60 m.
- **Draw call target:** < 150. Triangle target: < 500 k. 60 fps on a mid-range laptop iGPU, 30 fps floor on older hardware.
- Low-poly / stylized art direction is not just charming — it's the only realistic way a solo/small team ships an open world in a browser.

---

## 9. Milestones

Estimates assume one experienced developer, part-time-friendly chunks.

### M0 — Walking skeleton (1–2 weeks)
Vite + TS + Three.js scaffold. Flat seeded-noise terrain, FPV controller with pointer lock, WASD, gravity/ground clamp, fog, sky. **Exit test:** walk around a hilly, seeded world at 60 fps.

### M1 — A world worth walking (2–3 weeks)
Chunk streaming, biome map, instanced forests and fields, town generator with buildings and collision, path network. **Exit test:** follow a path from one town through a forest to another town, no interruptions.

### M2 — Animals (2–3 weeks)
Species registry, 6–8 species integrated with animations, spawner, wander/alert/flee AI, footstep-noise detection. **Exit test:** stalk a deer; it lifts its head, then flees when you get too close.

### M3 — Camera & photobook (2 weeks)
Aiming mode, render-to-target capture, subject detection + scoring, polaroid compositing + develop animation, spacebar photobook with pages and checklist. **Exit test:** photograph 3 species and flip through them in the book, in order.

### M4 — Save codes (1 week)
Encode/decode with checksum, autosave, code display/copy, "enter code" on the title screen, IndexedDB photo store, cross-device placeholder behavior. **Exit test:** copy a code, hard-reload in an incognito window, restore to the same spot with the same checklist.

### M5 — Content & feel (2–3 weeks)
Full 20-species roster, rarity/biome tuning, ambient audio + animal calls + shutter sounds, day/night or fixed golden-hour lighting pass, title screen, onboarding hints, film-refill in towns. **Exit test:** a stranger plays 20 minutes unprompted and understands everything.

### M6 — Polish & ship (1–2 weeks)
Performance pass on low-end hardware, settings (render scale, view distance, invert-Y, sensitivity), Safari/Firefox testing, static deploy, `CREDITS.md`.

**Total: roughly 11–16 weeks of focused effort.** A playable vertical slice (M0–M3 with 5 species) lands around week 6–8 — build to that first and playtest before investing in content.

### Explicitly out of scope for v1 (v2 candidates)
Multiplayer/shared worlds, photo sharing/export to social, weather, seasons, quests/NPCs with dialogue, procedural animal behavior variety (mating displays, predator–prey), mobile touch controls, gamepad.

---

## 10. Key risks & mitigations

| Risk | Mitigation |
|---|---|
| **Animal assets** — hardest asset problem; inconsistent styles/rigs across sources | Standardize on one pack (Quaternius) for 90 % of the roster; budget Blender time for the rest |
| **Browser performance variance** (Intel iGPU, Safari) | Instancing + fog from day one; render-scale setting; test on weak hardware at every milestone |
| **Save-code length creep** | Freeze the binary format early with a version byte; anything that doesn't fit goes to IndexedDB |
| **Procedural world feels samey** | Hand-authored building/POI "prefabs" placed procedurally — generation arranges, humans author the pieces |
| **Scope creep** (day/night, weather, more species) | Vertical slice by week 8; v2 list above is the pressure valve |

---

## 11. First concrete steps

1. Scaffold: `npm create vite@latest -- --template vanilla-ts`, add `three`, `simplex-noise`.
2. Implement `Terrain.ts` (seeded heightmap, one chunk) + FPV controller → M0.
3. In parallel, download the Quaternius animal pack and validate 3 models in a Three.js test scene (scale, animation clips) — this de-risks the single biggest unknown before M1 begins.
