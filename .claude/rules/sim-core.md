---
paths:
  - "src/core/**"
---
# src/core rules
- No `Date`, `Math.random`, or sin/cos/tan/atan2/exp/log/pow/hypot/cbrt/`**` (ESLint enforces). Time is the tick; randomness is seeded sfc32 (`src/core/rng`); use LUTs and integers.
- `SimState.team` is per ENTITY; `SimState.teams` is the per-TEAM block (`TEAM_STRIDE`/`TeamField`); `SimState.abil` is per CHARACTER. All `Int32Array`.
- Sim changes bump SIM_VERSION and need a stated reason before re-recording goldens/baselines. One sim-changing agent at a time.
- Legacy bugs: replicate, record in docs/legacy/KNOWN-BUGS.md with an `it.fails` test.
