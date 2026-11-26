---
status: idea
added: 2026-11-26
---

# Procedural KO collapses for wispera, lavax, morblass, echo

Art session (tte-art-gpu-server, 2026-11-26), slot #3 rig-only KO stills for the 8 originals, art-director round 1: sindarosa APPROVE (4, still image); curomo, rokcore, ishimi REVISE (3, round 2 pending); wispera, lavax, morblass, echo REJECT (2), so they go procedural, render-only, like Fiara and Cyclonius (`src/game/fx/ko-collapse.ts`, `KO_COLLAPSE` table, DOM Web Animations on the result screen).

Planned looks (art session's wording):
- wispera: the orb fizzles and sparks out.
- lavax: cools to ash.
- morblass: splash, then a puddle.
- echo: the wind unwinds.

Work (small, light builder, no sim change): extend `KoCollapseSpec`/`KO_COLLAPSE` with a per-hero parameter set and any new particle kinds, keep `ko-collapse.test.ts` pinning the table, the gate (legacy heroes show always; others released-or-flag) and reduced-motion end state, one e2e per hero in `tests/e2e/victory-still.spec.ts` (test-tiers and e2e-durations entries), and a real-game screenshot each for the art-director. Later: sindarosa still wiring when its approved KO PNG is integrated (art session bundle), curomo/rokcore/ishimi after round 2.
