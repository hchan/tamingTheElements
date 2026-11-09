# tamingTheElements

A legacy Crafty.js browser game (in `war/`) being ported to Phaser 4 + TypeScript + Vite, tested with Vitest and Playwright.
The target design is a deterministic 50 Hz simulation in plain TypeScript (`src/core`, no Phaser imports) with Phaser as a thin
renderer on top.

## Rules

- **Trunk-based development** per [docs/BRANCHING.md](docs/BRANCHING.md): branch from current `main`, one work package per
  branch, about 400 lines of code and under a day, unfinished work behind a default-off flag, `git merge --no-ff` with subject
  `Merge <what it does> (<WP id>)`, revert first if `main` goes red.
- **NEVER run `git commit` or `git push`** unless the user explicitly asks for it in that message. A previous blanket approval
  for a session may exist; do not rely on it. The coordinating session does the commits.
- **Scratch and temp files** go under `~/claudetmp/`, never `/tmp/`.
- **Do not delete legacy code or art** without explicit approval for that specific retirement.
- **Credentials:** `war/WEB-INF/user.properties` has committed plaintext credentials. Flag it if relevant, but never read,
  handle or print its values.
- **Determinism in `src/core`:** never use `Date`, `Math.random` or transcendental `Math` functions (`sin`, `cos`, `atan2`,
  `pow`, `exp`, `log`, `hypot`) once it exists. Time comes from the fixed step, randomness from a seeded PRNG.
- **Keep responses and diffs small.**

## Where things live

- `war/` - the legacy Crafty.js game (web root, assets, `WEB-INF`).
- `tools/` - build and helper tooling.
- `imgWorkArea/` - working art sources.
- `visio/` - design diagrams.
- `docs/` - project documentation, including [docs/BRANCHING.md](docs/BRANCHING.md).
