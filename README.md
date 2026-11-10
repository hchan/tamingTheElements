# Taming the Elements

[![CI](https://github.com/hchan/tamingTheElements/actions/workflows/ci.yml/badge.svg)](https://github.com/hchan/tamingTheElements/actions/workflows/ci.yml)
[![Pages](https://img.shields.io/badge/pages-live-brightgreen)](https://hchan.github.io/tamingTheElements/)

A real-time 1v1 elemental arena game with monster capture. Pick an elemental, fight in a 1280x720 arena, gain XP, capture
weakened opponents into your garrison (from chapter 2) and swap garrison members mid-battle. Chapter 4 ends with the
Eternal Void boss.

**[Play it in your browser](https://hchan.github.io/tamingTheElements/)**

## The game

- **Four elements** plus void. Fire beats air, air beats earth, earth beats water, water beats fire (x1.25 damage; the
  reverse is divided by 1.25). Void is neutral.
- **12 playable races**, each with its own abilities. Full tables are in [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md).
- **Capture** unlocks in chapter 2; the Eternal Void cannot be captured.
- **Four chapters** with XP caps and objectives (chapter 5 is post-game).

## Status

The game is being ported from a legacy Crafty.js version to Phaser 4 + TypeScript + Vite. The legacy game is still in
`war/` and serves as the parity oracle for the port (see [docs/PARITY.md](docs/PARITY.md)); it is preserved at the git tag
`legacy-crafty-1.0`.

## Quickstart

Requires Node 22 (see `.nvmrc`) and corepack, which provides the pnpm version pinned in `package.json`.

```sh
nvm use              # reads .nvmrc
corepack enable
corepack pnpm install
corepack pnpm dev      # dev server (Vite)
corepack pnpm build    # typecheck, then production build into dist/
corepack pnpm preview  # serve the production build
```

## Scripts

Run as `pnpm <name>` (or `corepack pnpm <name>`).

| Script | What it does |
|---|---|
| `dev` | Vite dev server |
| `build` | `tsc -b` then `vite build` |
| `preview` | Serve the production build |
| `typecheck` | `tsc -b` |
| `lint` | ESLint over the repo |
| `test` | Vitest `core` and `repo` projects (unit, rules, guards, golden replay) |
| `test:legacy` | Vitest `legacy` project: characterization tests that run the frozen legacy sources in `node:vm` |
| `test:browser` | Vitest `browser` project: cross-engine determinism check |
| `e2e` | Playwright end-to-end tests |
| `e2e:pages` | Playwright smoke test of the build served under the Pages subpath |
| `depcruise` | dependency-cruiser layer boundaries for `src/` |
| `golden:record` | Re-record the golden replay after an intended sim change |
| `sim:match` | Headless AI-vs-AI matches for balance work |
| `sim:net` | Headless networked bot match over the fake lockstep link ([docs/NETCODE.md](docs/NETCODE.md)) |
| `assets:build` | Copy manifest images and sounds from the legacy tree into `public/` |
| `docs:gen` | Regenerate the generated tables in `docs/GAME-DESIGN.md` |
| `format` | Placeholder, exits 1 ("not yet") |

## Project structure

Short version; the full map is [docs/REPO-MAP.md](docs/REPO-MAP.md).

| Path | Contents |
|---|---|
| `src/core/` | Deterministic simulation in plain TypeScript (no DOM, no Phaser) |
| `src/game/` | Phaser renderer, input, audio and app glue |
| `src/ui/` | DOM menus in vanilla TypeScript |
| `src/testing/` | Test-only helpers, including legacy stubs |
| `tests/` | Cross-cutting, legacy, browser, e2e and Pages tests plus fixtures |
| `tools/` | Asset, generator and match-runner tooling |
| `docs/` | Documentation, see [docs/README.md](docs/README.md) |
| `war/` | Legacy Crafty.js game (parity oracle) |
| `imgWorkArea/`, `visio/` | Art sources and design diagrams |

## Architecture

A fixed 50 Hz simulation in `src/core` owns all game state; Phaser only renders it and feeds input back as commands.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DETERMINISM.md](docs/DETERMINISM.md).

```mermaid
flowchart LR
  Input[Keyboard input] --> Cmd[Commands]
  Cmd --> Core["src/core sim (50 Hz)"]
  Core --> View[RenderView and events]
  View --> Phaser["src/game (Phaser)"]
  Menus["src/ui (DOM menus)"] --> Phaser
```

## Testing

Vitest for unit, legacy characterization and browser determinism; Playwright for end-to-end. See
[docs/TESTING.md](docs/TESTING.md), the legacy parity checklist in [docs/PARITY.md](docs/PARITY.md) and the balance tooling
in [docs/BALANCE.md](docs/BALANCE.md).

## Deployment

Pushes to `main` that pass CI deploy to GitHub Pages. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Contributing

Trunk-based development with small branches ([docs/BRANCHING.md](docs/BRANCHING.md)). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the checks to run and the Definition of Done. Agent rules are in
[CLAUDE.md](CLAUDE.md). Security reports: [SECURITY.md](SECURITY.md).

## License

To be decided. No license file exists yet.
