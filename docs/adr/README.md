# Architecture Decision Records

Status: all accepted. Format: Context, Decision, Consequences.

- [0001](0001-phaser4-ts-vite-toolchain.md) Phaser 4 + TS strict + Vite + Vitest + Playwright + pnpm/corepack
- [0002](0002-deterministic-sim-50hz.md) Deterministic 50 Hz plain-TS sim; Phaser is a thin renderer
- [0003](0003-sfc32-rng-streams.md) sfc32 streams, not mulberry32
- [0004](0004-no-transcendentals-in-core.md) No transcendental Math in core; LUTs + integer dirs
- [0005](0005-aabb-no-arcade-physics.md) AABB in the sim, no Arcade physics
- [0006](0006-fixed-arena-1280x720-fit.md) Fixed logical arena 1280x720 + FIT scaling
- [0007](0007-dom-menus-vanilla-ts.md) DOM menus in vanilla TS, no jQuery
- [0008](0008-agent-controller-interface.md) Agent/Controller interface
- [0009](0009-events-carry-stable-ids.md) Events carry stable ids
- [0010](0010-saves-localstorage-then-idb.md) Saves: same localStorage key, additive v1, then IndexedDB + export/import
- [0011](0011-valibot-save-validation.md) valibot for save validation (small, tree-shakable)
- [0012](0012-hash-router-route-table.md) Hash router with an explicit route table (for Pages/itch iframes)
- [0013](0013-trunk-based-wps-and-flags.md) Trunk-based WPs and typed default-off flags; sim flags in the replay header
- [0014](0014-legacy-as-parity-oracle.md) Legacy as parity oracle; aggressive gated retirement
- [0015](0015-known-legacy-bugs-policy.md) Known legacy bugs: reproduce for parity, lock with `it.fails`, fix on purpose (simVersion bump)
- [0016](0016-art-sources-in-git-lfs.md) Art sources in Git LFS; runtime = exported PNG/atlases
- [0017](0017-dependency-cruiser-eslint-boundaries.md) dependency-cruiser + ESLint for layer boundaries
- [0018](0018-colocated-unit-tests.md) Colocated unit tests; tests/ for cross-cutting suites
