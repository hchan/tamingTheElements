---
status: idea
added: 2026-11-15
---

# QA r66 scorecard (HEAD 52b3ade7, dev server port 7966, headless Chromium SwiftShader)

Coverage: menu, Versus picker, 1v1 in Fire / Water / Air / Earth stages, a 2v2 tag attempt, a super (Curomo, Glacier Crash), the Tour (map, splash with teammate bench, in-fight chip), Help (collapsible sections), phones at 812x375 and 390x844, and an idle-player Hard probe (about 80 s). Scores 0-5 versus Street Fighter / Marvel vs Capcom (r65 was 3.9 / 4.2 / 3.8). Screenshots in `~/claudetmp/qa-r66/s/`, scripts in `~/claudetmp/qa-r66/scripts/`. No page errors in any run. `pnpm e2e` subset (first-run-hint, help-controls, arcade-tag, arcade-super): 22 passed.

- Fun: 3.9 (=). The AI still closes at once and kills an idle Fiara in about 25 s, but still pins her to the left wall.
- Graphics: 4.2 (=). Four stage floors read as distinct; the new Tour splash is a clear step up; Wispera is still a grainy blob.
- Readability: 3.9 (+0.1). The "Can't swap: stunned" notice, the "Stage 1 of 9 / 3 continues left" chip and the labelled ROUNDS pips help; the equal-length life bars and the wall crop remain.

Per area: menu 4.2, Versus picker 4.0, Fire 1v1 4.0, Water 1v1 4.2, Air 1v1 4.0, Earth 1v1 4.0, super 4.1 (banner great, caster cropped), tag swap 4.0, Tour splash 4.3, Tour map 3.8 (Controls fact is a wall of text), Tour fight 4.0, Help 4.1, phone 812x375 3.9, phone 390x844 picker 3.7 ("More below" fade hides the hero cards).
