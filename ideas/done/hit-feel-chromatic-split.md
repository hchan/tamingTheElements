---
status: done
added: 2026-11-14
---

# Hit feel: chromatic split on the KO frame

Split from hit-feel-followups. A brief RGB offset on the KO peak (renderer-only, off under reduced motion, within the existing caps).

Done 2026-11-14: custom camera filter `src/game/fx/chromatic-filter.ts` (Phaser ships none) driven by `koSplitAmount` in `hit-feel.ts` from the shock layer's KO wash: red out, blue in, 0.3% of screen width at the edges, 260 ms, clean centre. Not started under reduced motion (EventFx never calls koWash). Frames: `tests/e2e/ko-fx-shot.spec.ts`.
