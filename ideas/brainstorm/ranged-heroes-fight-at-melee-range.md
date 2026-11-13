---
status: idea
added: 2026-11-12
---

# Ranged heroes land their hits at point-blank range

Found with `pnpm range:probe` (`tools/sim/range-probe.ts`, docs/TESTING.md): Arcade 1v1, all 66 pairings, 4 seeds, scripted AI level 3, hits by centre-to-centre distance at the moment of `hitConfirmed`. The playfield is 1920 px wide and projectiles never expire inside it (3.8 to 7.7 s to cross).

## Numbers (ranged hits only, share of a hero's ranged hits)

| hero | hits | <120 px | 120-320 px | >320 px |
| --- | --- | --- | --- | --- |
| cyclonius | 3130 | 86% | 12% | 1.5% |
| morblass | 3534 | 83% | 14% | 0.6% |
| ishimi | 2390 | 87% | 10% | 3% |
| lavax | 2409 | 78% | 20% | 2.6% |
| fiara | 4211 | 86% | 13% | 0.5% |
| rokcore | 2949 | 69% | 30% | 0.5% |
| sindarosa | 1334 | 72% | 25% | 3% |

Median hit distance over all hits: 32 px (wispera) to 123 px (sindarosa); p90 111 to 381 px. Melee heroes' boxes are 240 px wide (curomo, echo, wispera) or 120 to 360 px (treenoc), but 80 to 90% of their hits land under 120 px, so melee heroes hardly use their reach either.

## Reading

- With a 1920 px field, shots that could cross it are almost only fired from touching distance: ranged and melee heroes play the same fight. The ranged identity (zoning, chip damage, Snag lines) is not visible in the data. Part of it is the AI (the ranged bots close in, the melee `chase` starts a dash at 160 px), part is the arena scale and straight bullets that only hit when the victim stands on the firing line.
- Rokcore is the most "mid-range" ranged hero (p10 44 px, p50 106 px), sindarosa and lavax have the widest tails (p90 335 to 381 px): their slower shots or higher damage seem to be fired earlier.
- 'other' hits (Charge, supers, traps) are 15 to 35% of every hero's hits, so the above excludes a large share of damage.

## Ideas

- AI: let ranged heroes keep a preferred spacing (a band 300 to 600 px) and retreat when closer (check what the Arcade AI spacing in `src/core/agents/scripted-ai/arcade.ts` already does); measure with this probe (target: at least 25% of ranged hits beyond 320 px).
- Design: shorten the field for ranged zoning, or give projectiles a finite range so close-range and far-range have different value.
- Add a per-hero "distance of first hit" metric to `tools/sim/fun-metrics.ts` once the AI work lands, and gate the share beyond 320 px.
