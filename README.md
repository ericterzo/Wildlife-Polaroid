# Wildlife Polaroid 📷

A 3D open-world browser game. Wander a procedurally generated countryside in
first person — small towns, winding paths, fields, forests and ponds — with
nothing but a polaroid camera and a photo book. Stalk real animals, frame the
shot, and fill your book: an analogue Pokédex of every species you can find.

Built with Three.js + TypeScript. No backend, no accounts — everything runs in
the browser and your save is a zip file.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` produces a static site in `dist/` (deployable to GitHub
Pages/Netlify/any static host).

## How to play

| Input | Action |
|---|---|
| Click | Take a photo (and lock the mouse the first time) |
| Right-click (hold) | Raise the camera — zoom viewfinder |
| `WASD` / arrows | Walk |
| `Shift` | Run (animals hear you from much further) |
| `C` | Sneak (get closer before they spook) |
| `Space` | Open / close the photo book |
| `←` `→` | Flip book pages |
| `Esc` | Pause menu (save / load / quit) |

### The game

- **16 real species** — fox, roe deer, wild boar, badger, heron, barn owl,
  red squirrel, hedgehog, and more — each living in its own habitat: fields,
  forests, towns, or water.
- Animals **wander, graze, and flee**. Get too close, too fast, and they'll
  freeze for a heartbeat (your photo window) and bolt. Sneak for close-ups.
- **Every animal rolls a size**, from teeny-tiny to MASSIVE, on a bell curve —
  the extremes are rare and worth far more points.
- **Photo scoring:** 1–3 stars for framing (fill the frame, center the
  subject) × species rarity × size-extremity bonus = points. Only your best
  shot per species is kept, pinned into the book in the order you first
  photographed each animal.
- The **photo book** (`Space`) shows your polaroids and a Field Index of every
  species — the ones you haven't found yet are just `???`.

### Saving

Your save is a **zip file** (pause → "Save trip"): it contains
`manifest.json` (world seed, your position, scores) plus every polaroid as a
real JPEG. Load it from the title screen on any device to continue in the
same world, at the same spot, with your whole book. The game also autosaves
to the browser (`Continue last trip`), but the zip is the portable one — and
the photos inside are yours to keep.

## Project layout

```
src/
  main.ts      game loop, state machine, input, photo flow
  world.ts     seeded terrain, biomes, towns, paths, vegetation, collision
  animals.ts   species registry, procedural low-poly models, AI, spawner, size rolls
  player.ts    FPV controller (walk/run/sneak, head-bob, water & building collision)
  photo.ts     subject detection, star scoring, polaroid compositing
  save.ts      zip save/load (fflate) + localStorage autosave
  ui.ts        HUD, photo book, menus
  noise.ts     seeded PRNG + value noise (world determinism)
```

Worlds are fully deterministic from their seed — type a seed on the title
screen to revisit (or share) a world. See `PLAN.md` for the design document.
