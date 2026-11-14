---
status: done
added: 2026-11-14
---

# QA r16 minor items: intro name contrast, locked Tour tiles

Two minor findings from `ideas/brainstorm/qa-r16-scorecard.md`, both renderer/UI only.

Done 2026-11-14:
- Round-intro name cards (`src/game/hud/round-view.ts`, `round-cards.ts`): the name colour is the element colour pulled 62% toward bone (`cardColorFor`) with a thicker dark stroke, so PAX on water or ROKCORE on earth no longer sits as the same hue as the floor. Unit test in `round-cards.test.ts`.
- Locked Tour tiles (`public/assets/css/tour-select.css`): the padlock icon is gone; the word "Locked" is the single cue (it stays for screen readers and tests). `tests/e2e/tour.spec.ts` asserts the tile has no `::after` icon.
