---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/fx/super-view.ts`

- Current size: 569 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 569.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) band window maths (`BandWindow`, `bandWindow`, `windowOf`, `bandExt`, `sweptSpan`) as `super-band`; (2) portrait/title placement (`portraitCx`, `bigTitleBox`, `portraitRect`, `portraitSide`, `nameHalfWidth`, `fitTitlePx`) as `super-layout`; (3) the Phaser mount code (glow, dim, lines, burst) left in `super-view.ts`.
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
