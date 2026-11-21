---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/ui/screens/arcade-versus.ts`

- Current size: 972 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 972.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) form helpers (`select`, `segmented`) as `screens/versus-controls`; (2) hero stats and life helpers (`heroLife`, `statsOf`, `shortName`, `avatarOf`, `raceLabel`); (3) `rosterView` (about 470 lines, the biggest function) into per-side picker pieces; (4) `arcadeResultsView` and the key-list hint blocks as `screens/versus-results`.
- Risk: Low: src/ui is DOM-only. Sonnet builds directly; run the dom vitest project and the touched specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
