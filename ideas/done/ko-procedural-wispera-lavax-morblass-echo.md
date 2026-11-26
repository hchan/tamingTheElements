---
status: done
added: 2026-11-26
---

# Procedural KO collapses for six originals (wispera, lavax, morblass, echo, rokcore, ishimi)

Art session (tte-art-gpu-server, 2026-11-26), slot #3 rig-only KO stills for the 8 originals, art-director round 1: sindarosa APPROVE (4, still image); curomo, rokcore, ishimi REVISE (3, round 2 pending); wispera, lavax, morblass, echo REJECT (2), so they go procedural, render-only, like Fiara and Cyclonius (`src/game/fx/ko-collapse.ts`, `KO_COLLAPSE` table, DOM Web Animations on the result screen).

Planned looks (art session's wording):
- wispera: the orb fizzles and sparks out.
- lavax: cools to ash.
- morblass: splash, then a puddle.
- echo: the wind unwinds.

Work (small, light builder, no sim change): extend `KoCollapseSpec`/`KO_COLLAPSE` with a per-hero parameter set and any new particle kinds, keep `ko-collapse.test.ts` pinning the table, the gate (legacy heroes show always; others released-or-flag) and reduced-motion end state, one e2e per hero in `tests/e2e/victory-still.spec.ts` (test-tiers and e2e-durations entries), and a real-game screenshot each for the art-director. Later: sindarosa still wiring when its approved KO PNG is integrated (art session bundle), curomo/rokcore/ishimi after round 2.

## Update (art session, round 2, 2026-11-26)

curomo APPROVE 4 (`.scratch/ko-orig2/curomo_ko.png` in the art worktree; nudge a few px down onto the shadow at integration). rokcore REVISE 3 and ishimi REJECT 2: rule 13 (two failed rig rounds) applies, so no more rig passes; both go procedural too:
- rokcore: crumbles and settles.
- ishimi: collapses into a flattened mass.
So the procedural set is six: wispera, lavax, morblass, echo, rokcore, ishimi. Final KO stills for originals: sindarosa (`.scratch/ko-orig/sindarosa_ko.png`, APPROVE 4) and curomo. Both need an in-repo integration script (copy to `public/assets/img/ko/`, CREDITS.txt, `tests/repo/ko-frames.test.ts` sha pin from approval.json) and adding to `KO_STILL_HEROES` with the `ko-still.test.ts` list; do that after the art session sends the bundle path (verdict files: `.scratch/ko-orig/approval.json`, `.scratch/ko-orig2/approval.json`).

## Progress (2026-11-26, builder)

wispera, lavax, morblass done (status stays idea: echo, rokcore, ishimi pending). `KoCollapseSpec` gained optional `mid` frame and particle kinds spark/ash/droplet (new `src/game/fx/ko-collapse-particles.ts`); gate = `KO_COLLAPSE_LEGACY` set (legacy heroes need no flag). e2e: the existing hero loop in `tests/e2e/victory-still.spec.ts` (long gate, ~7 s each) now covers the three. Screenshots in `.scratch/ko-procedural/` for the art-director.

## Progress (2026-11-26, builder, part 2)

echo, rokcore, ishimi added to `KO_COLLAPSE` (appended) and `KO_COLLAPSE_LEGACY`; all six procedural KOs are in, so this idea is done (ishimi's victory still is approved but its KO still is not). Art-director round on the first three: lavax APPROVE (unchanged); wispera REVISE 2 and morblass REVISE 2.5 retuned (end alpha 0.6 / 0.85, scaleY 0.5 / 0.4, pale cyan-white and deep teal tints, dark ground shadow alpha 0.3, resting particles via new optional `rest` and `shadow` spec fields and `mote`/`splat` kinds). Echo, rokcore and ishimi follow the same lessons (end alpha >= 0.6, shadow, resting motes or blobs). Reduced motion: end state and shadow, no particles. Fresh end-state screenshots in `.scratch/ko-procedural/`; they still go to the art-director.
