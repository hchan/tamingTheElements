# Repo map

Describes the tree as it exists today (the legacy Crafty.js game). New directories are added here by the WP that creates them.

ADR index: [docs/adr/README.md](adr/README.md)

## Top level

| Path | What it is |
|---|---|
| `war/` | Legacy web root (the old App Engine wrapper is retired). The playable game lives in `war/WEB-INF/private/` |
| `war/WEB-INF/private/src/` | The 24 legacy game scripts (see [legacy/INVENTORY.md](legacy/INVENTORY.md)) |
| `war/WEB-INF/private/lib/` | Vendored `crafty.js` and `SpriteColor.js` |
| `war/WEB-INF/private/bower_components/` | Vendored jQuery |
| `war/WEB-INF/private/css/` | `main.scss`, compiled `main.css` and a Sass cache |
| `war/WEB-INF/private/img/`, `war/WEB-INF/private/snd/` | Sprite sheets, backgrounds and `.ogg` sound |
| `imgWorkArea/` | Art working files: PNG and GIMP `.xcf` sources |
| `visio/` | Balance equation diagram (`.vsd` and `.png`) |
| `tools/` | Five Perl generators for the asset manifests (`generate*.pl`, `imgHelper.pl`) |
| `tools/gen/` | Node generators for `src/core` tables: `gen-luts.ts` writes `src/core/math/lut.generated.ts` (run with `pnpm exec tsx`) |
| `docs/` | Documentation: `BRANCHING.md`, this map, `docs/adr/`, `docs/legacy/` (incl. retired home page and to-do list) |
| `.github/` | CI workflow (`workflows/ci.yml`), Dependabot config and the PR template |
| `docs/adr/` | Architecture decision records, see the [ADR index](adr/README.md) |
| `docs/legacy/` | Legacy module inventory and known-bug table |
| `.claude/` | Claude Code project config |
| `src/` | New TypeScript port (see below) |
| `package.json`, `pnpm-lock.yaml`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts` | pnpm, TypeScript, Vite and Vitest project config |
| `CLAUDE.md`, `README.md`, `.gitignore` | Agent instructions, readme, ignore rules |

## New code (`src/` and `tests/`)

| Path | What it is |
|---|---|
| `src/core/` | Pure deterministic simulation code: no DOM, Phaser, Date or Math.random |
| `src/game/` | Phaser renderer and app glue (browser only); `src/game/app/` is the composition root |
| `src/game/platform/` | Leaf module for browser-platform glue (UI feature flags); imports only core via its index |
| `src/ui/` | DOM menus in vanilla TS |
| `src/testing/` | Test-only helpers; `src/testing/legacy/` holds the Crafty/jQuery/DOM stubs, fake clock and seeded random used to run the frozen legacy sources in `node:vm` |
| `tests/` | Cross-cutting tests (`tests/repo/`); unit tests are colocated in `src/` |

## Where do I put X

| Thing | Location today |
|---|---|
| A new decision record | `docs/adr/NNNN-<slug>.md`, and add it to `docs/adr/README.md` |
| Notes about legacy code or bugs | `docs/legacy/` |
| General documentation | `docs/` |
| Anything touching the running legacy game | `war/WEB-INF/private/src/`, but the legacy game is frozen as the parity oracle, so prefer not to edit it |
