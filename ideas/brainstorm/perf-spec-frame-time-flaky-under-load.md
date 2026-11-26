---
status: idea
added: 2026-11-20
---

# perf.spec frame time bound flaky under nightly load

Nightly full e2e (commit 9f44b4c8): `tests/e2e/perf.spec.ts` "stepped battle frame time under SwiftShader stays within a very generous bound" measured 38 ms against a 35.5 ms limit. The spec already measures windows to ride out load bursts, so this is treated as load noise on the shared machine (P2 polish, does not block pushes).

Next: stress it with `pnpm e2e:flake --repeat 20 --grep "stepped battle frame time"` (PC only). Never fails = could not reproduce; fails some repeats = flaky, fix the test's windowing. The bound is not loosened here.

Same night: `match-end.spec.ts` "winner, result word, reachable buttons" (#arcadeRematch bottom 1259.8 > 720) did not reproduce on current main (short lane, PC, 5 passed). Watch the next nightly run.

## Progress (2026-11-26)

Scope here was the vitest side only (the e2e perf.spec repeat run on the PC is still open, so this idea stays in brainstorm). Per file, alone vs cause: nightly-fix-land-real-git (1.9-2 s per test), nightly-push-real-git and pc-snapshot (about 23 s for the 3 files): `beforeEach` builds real git repos and hit vitest's default 10 s hookTimeout under load; fixed with `hookTimeout: TEST_TIMEOUT_MS` (240 s) in vitest.config.ts. gpu-ctl-py: 32 s alone (53 python tests spawning subprocesses), 242 s once, near its 240 s spawn limit; limits now named 900 s / 960 s hang guards. sim-perf: 0.35 s alone, about 10x margin on the bound; the wall-clock test alone is skipped with a printed reason when load1 > 4x cores. bake-rig: one 40 s `assets:bake --check` test, already inside the 240 s testTimeout, no change. See docs/TESTING.md.
