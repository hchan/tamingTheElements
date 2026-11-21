---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/core/net/session.ts`

- Current size: 709 lines (wc -l, 2026-11-21); no entry in `tools/ci/size-grandfather.json` (the 500-line limit in `tests/repo/file-size.test.ts` is the bar).
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) option/stat/snapshot types (`LockstepOptions`, `UpdateResult`, `DesyncInfo`, `SessionStats`, `SessionSnapshot`) as `session-types`; (2) `TickBuf` and the log/trim caps as `tick-buf`; (3) hash history and desync compare (`recordHash`, `dropOldHash`, `compare`); (4) input-delay adaptation and frame advantage (`noteStall`, `raiseInputDelay`, `sampleAdvantage`).
- Risk: High: src/core runs in the deterministic sim, so goldens, replays and the cross-browser hash are at risk. Opus (max effort) plans first, Sonnet builds; run golden/replay tests and `sim:match` before and after, and the determinism-reviewer.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
