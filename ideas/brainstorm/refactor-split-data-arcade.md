---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/core/data/arcade.ts`

- Current size: 569 lines (wc -l, 2026-11-21); no entry in `tools/ci/size-grandfather.json` (the 500-line limit in `tests/repo/file-size.test.ts` is the bar).
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) hit strength and hit-stop tables (`HitStrength`, `HIT_STOP_TICKS`, `hitStrengthFor`); (2) hit stun and juggle tables (`HIT_STUN_TICKS`, `hitStunFor`, `JUGGLE_*`); (3) charge and run-away constants (`CHARGE_*`, `RUN_*`, `ChargeEnd`, `RunEnd`); (4) snag constants and tables (`SNAG_*`, `ARCADE_SNAG_SLOT`); re-export from `data/arcade.ts` so imports do not change.
- Risk: High: src/core runs in the deterministic sim, so goldens, replays and the cross-browser hash are at risk. Opus (max effort) plans first, Sonnet builds; run golden/replay tests and `sim:match` before and after, and the determinism-reviewer.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
