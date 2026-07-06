# Wildlife Polaroid — project conventions

## Commits
- A `prepare-commit-msg` hook (in `githooks/`, enabled via
  `git config core.hooksPath githooks` — re-run that after a fresh clone)
  appends a signature line with a random western nickname to every commit:
  `— Eric [Nickname] Serra`. Let the hook do it; never write the signature
  by hand and never pick the nickname yourself.
- Do NOT add any "Generated with Claude Code" line, "Co-Authored-By" trailer,
  "Claude-Session" line, or any other AI attribution to commits, PRs, or any
  repository artifact. Eric is the sole author.
- Commit author/committer identity: `Eric Serra <ericterrestre@gmail.com>`.

## Code style
- Write code comments in a playful, informal tone — keep them useful, but
  have fun with them.

## Build & test
- `npm run dev` to play locally; `npm run build` type-checks + builds;
  `npm run build:single` produces the self-contained one-file build in
  `dist-single/index.html` (this is the file delivered to players).
- Linting & formatting are checked via biomejs `npx @biomejs/biome check`.
- Headless smoke tests live outside the repo (session scratchpad); they drive
  the game via the `window.__game` debug hook in `src/main.ts`.
