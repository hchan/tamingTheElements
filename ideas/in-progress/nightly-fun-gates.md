---
status: in-progress
added: 2026-11-12
---

# Tight nightly gates

FUN-DESIGN WP 25 `WP-arcade-gates-tight`: nightly fun:compare bands, Arcade balance compare, visual-state checks, latency marks.

## Status

- Done: `tools/ci/fun-gates.ts` (`pnpm fun:gates`) plays all Arcade pairings for 1v1 and 2v2 (8 seeds) and exits 1 outside the bands, plus a latency mark (wall ms per sim second). Draft workflow `.github/workflows/nightly-fun-gates.yml` (not pushed). Tests: `tests/repo/fun-gates.test.ts`.
- Bands are calibrated to the measured Arcade AI, not the aspirational FUN-DESIGN targets. Measured at SIM_VERSION of this commit: 1v1 median combo hits 1 (target 2), race win rates 0.36 to 0.64, stalemate rate 2.1% in both team sizes (target 0). Tighten as tuning lands.
- Open: visual-state checks need Playwright and stay in `visual.yml`; the Arcade balance compare stays report-only in `nightly.yml`.

## Noise study, 2026-11-12 (`pnpm fun:noise`, 4 blocks x 8 seeds, all pairings, level 1)

Bands in `tightGates` hold at aiLevel 3 (the gated level); no recalibration. Spread across blocks (min / max):

- 1v1 ai3: round median 44.2 to 45.2 s, time-over 0.001 to 0.003, stalemate 0, first hit 1.50 to 1.82 s, combo p90 4, worst race 0.398 to 0.432, best race 0.602 to 0.625. All blocks in band.
- 2v2 ai3: round median 75.6 to 75.8 s, time-over 0.015 to 0.021, combo median 2, combo p90 6 (band max 7), best race 0.682 to 0.705, worst race 0.148 to 0.273: 1 of 4 blocks under the 0.15 floor, so 8-seed runs of that gate are noisy at the low edge (spread 0.12); use 16+ seeds or widen the floor to 0.12 if it flakes.
- aiLevel 2 (not gated, Easy AI) is far out of band: 1v1 best race 0.73 / worst 0.18, stalemate 0.005; 2v2 round median 88 s, time-over 0.26, best 0.92 / worst 0.10. Do not gate it with these bands.
