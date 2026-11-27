---
status: done
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/views/pose-layer.ts`

- Current size: 966 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 966.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) timing constants and the `PoseState`/`Ghost`/`SheetDrawn` types into `views/pose-types`; (2) event consumption (`consume`, `start`, `castPulse`) as a `pose-events` module; (3) per-character pose solving (`character`, `abilityMotion`, `backingNow`); (4) sheet frame choice and probe (`sheetFrame`, `sheetProbe`) plus ghost trails.
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).

Done 2026-11-27: nine modules split out of `pose-layer.ts` (`pose-layer-types.ts` 95 lines with the clock, probe types and `posePivot`, `pose-slots.ts` 38, `pose-ghosts.ts` 155, `pose-projectiles.ts` 116, `pose-melee.ts` 73, `pose-motion.ts` 71, `pose-depth-state.ts` 69, `pose-shake.ts` 23, `pose-probe.ts` 42); `PoseState` and `SheetDrawn` are re-exported from `pose-layer.ts`; `pose-layer.ts` 966 -> 499 lines; grandfather cap removed (the `longFunctionFiles` entry stays: `character()` is still over 120 lines). Pure refactor, no behaviour change.
