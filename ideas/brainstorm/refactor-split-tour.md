---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/ui/screens/tour.ts`

- Current size: 542 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 542.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) splash screen (`SplashMember`, `SplashSide`, `tourSplashView`, `tourStageChip`) as `tour-splash`; (2) pick screen (`TourPickOptions`, `tourPickView`) as `tour-pick`; (3) card and victory views (`tourCardView`, `tourVictoryView`) stay; shared types move to `tour-types`.
- Risk: Low: src/ui is DOM-only. Sonnet builds directly; run the dom vitest project and the touched specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
