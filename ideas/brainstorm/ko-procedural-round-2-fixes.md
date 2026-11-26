---
status: idea
added: 2026-11-26
---

# Procedural KO collapses: art-director round 2 fixes (echo, rokcore, ishimi, wispera, morblass)

Verdicts (art-director, 2026-11-26; end-state screenshots only, motion not judged; file `.claude/worktrees/agent-acadd305178cd3d9f/.scratch/ko-procedural/approval2.json`, screenshots in the same dir, contact crop `.scratch/ko-sheet.png`; those worktrees may be pruned, copy first). Parameters live in `src/game/fx/ko-collapse.ts` (`KO_COLLAPSE`), particles in `ko-collapse-particles.ts`.

Common fault on all five: the effect floats 30-60 px above its name label. Fix the floor anchoring in one place (end-state y offset relative to the label line / result card), then per hero:
- rokcore APPROVE 4.0, condition: move down ~22 px to rest on the label line.
- morblass APPROVE 4.0 conditional: move down 24 px to rest just above the label; keep the teal (the contact crop shows brown, the full screenshot teal).
- wispera REVISE 2.5 (spark ring reads as a glitch/orb, too small at 1280 wide): scale 1.7x; add a second wider fainter swirl ring ~35% alpha; cooler tint grey-lilac ~#a9b0c8, not white-hot; lower 30 px to the label line; add 8-10 dust wisps trailing along the floor.
- echo REVISE 3.0 (flat grey funnel disc, low contrast, floats): scale 1.3x; darker grey-blue base ~#7d8aa0 with the brighter core; squash disc to ~60% height; y 28 px above the label; thin ground-dust streak under it.
- ishimi REVISE 3.5 (reads as a hovering blade/boat, overlaps the dragon's wing): scale down ~20% width and ~30% height; lower ~45 px onto the label line; faint ripple ellipse beneath at ~30% alpha so it reads as pooled water; less pointed edges.
Then fresh end-state screenshots of wispera, echo, ishimi (and rokcore/morblass after the y shift) to the art-director. Render-only, tests pin parameters (`ko-collapse.test.ts`), e2e hero loop in `tests/e2e/victory-still.spec.ts` via the router. Lavax is APPROVED, unchanged.
