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

- **30 real species** — fox, roe deer, wild boar, pig, badger, heron, swan,
  kingfisher, barn owl, both squirrels, three cat colours, a farm dog,
  villagers, and fish — each living in its own habitat: fields, forests,
  towns, or water. Fish only appear while you're wading.
- **Temperaments:** shy animals freeze for a heartbeat (your photo window)
  and bolt if you get close or approach fast — sneak up on them. Friendly
  ones (cats, dogs) trot over to say hello.
- **Every animal rolls a size**, from teeny-tiny to beyond-real-life MASSIVE,
  on a bell curve — the extremes are rare and worth far more points.
- **Photo scoring is all about framing:** centering + how much of the frame
  the subject fills (get closer, or zoom). Tiny specimens score almost
  entirely on centering. Three stars are hard. Extra animals in the same
  shot add a combo bonus (the closest one gets the album page), and birds
  photographed in flight earn 1.5×.
- Photos take a couple of seconds to **develop on screen** — no second shot
  until the polaroid is done.
- You can **swim across lakes and ponds**; the deeper you wade, the higher
  the water rises up the screen — and that's when the fish come out.
- The **photo book** (`Space`) shows your polaroids and a Field Index of every
  species — the ones you haven't found yet are just `???`.
- Chill **generative ambient music**, synthesized in-browser (royalty-free by
  construction); toggle it in the pause menu.

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
  photo.ts     subject detection, framing/combo/flight scoring, polaroid compositing
  save.ts      zip save/load (fflate) + localStorage autosave
  music.ts     generative ambient music (WebAudio, no samples)
  ui.ts        HUD, photo book, menus
  noise.ts     seeded PRNG + value noise (world determinism)
```

Worlds are fully deterministic from their seed — type a seed on the title
screen to revisit (or share) a world. See `PLAN.md` for the design document.
