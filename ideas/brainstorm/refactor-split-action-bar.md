---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/hud/action-bar.ts`

- Current size: 695 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 695.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) pure label/tooltip logic (`slotTip`, `trapNote`, `elementalNote`, `tipPlacement`, `tipExpired`, `slotWord`) as `action-bar-tips`; (2) key labels and bindings (`labelsFromBindings`, `KeyLabels`, label constants); (3) icon/texture helpers (`gradedTexture`, `fitIcon`, `ACTION_ICON`, sheet constants) as `action-bar-icons`; (4) slot types and tints (`ActionSlot`, `KIND_TINT`, `ELEMENT_TINT`).
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
