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
