---
status: done
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/hud/action-bar.ts`

- Current size: 695 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 695.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) pure label/tooltip logic (`slotTip`, `trapNote`, `elementalNote`, `tipPlacement`, `tipExpired`, `slotWord`) as `action-bar-tips`; (2) key labels and bindings (`labelsFromBindings`, `KeyLabels`, label constants); (3) icon/texture helpers (`gradedTexture`, `fitIcon`, `ACTION_ICON`, sheet constants) as `action-bar-icons`; (4) slot types and tints (`ActionSlot`, `KIND_TINT`, `ELEMENT_TINT`).
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).

Done 2026-11-27: four pure modules split out of `action-bar.ts` (`action-bar-types.ts` 37 lines, `action-bar-tips.ts` 82, `action-bar-cooldown.ts` 55, `action-bar-strike.ts` 47) and re-exported from it; `action-bar.ts` 695 -> 496 lines; grandfather cap removed. Pure refactor, no behaviour change.
