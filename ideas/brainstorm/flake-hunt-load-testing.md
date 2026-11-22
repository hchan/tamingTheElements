---
status: idea
added: 2026-11-22
---

# Flake hunt: repeat and load runs of e2e on the 4060 PC

Planner result (2026-11-22, read-only; numbers are measurements from the 2026-11-22 full run unless marked estimate). About 70% exists: `tools/ci/e2e-flake.ts` (repeat runs, pass table, `--summary-json`) and `pnpm e2e:flake` via the PC-only router. Missing: ledger, slice picker, nightly slot, etiquette line.

Ranked steps:
1. Run `pnpm e2e:flake --repeat 20` on the 5 current reds (idle-aura x2, online-result:229, playtest-replay:89, replay-input-display:9); fix or record per docs/TESTING.md. No code.
2. Ledger: `tools/ci/flake-ledger.ts` + `.json` merged from `--summary-json`, with a repo test (S, Sonnet).
3. `tools/ci/flake-hunt.ts`: slice = lowest pass rate, then slowest; PC only, refuses CI/Mac, `--budget-min`, `--dry-run`. Touches package.json and offload-routes.json (one agent at a time).
4. Nightly slice after the 23:00 full run (about 00:30, estimate), hard stop 06:30; skip on unhealthy probe, 80 C, free RAM under 4 GB, or a GPU job. Written behind `--dry-run`; coordinator enables it and adds the CLAUDE.md etiquette line.
