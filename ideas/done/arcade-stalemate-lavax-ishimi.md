---
status: done
added: 2026-11-12
---

# Arcade stalemates concentrate on Lavax and Ishimi pairs

From docs/ABILITY-AUDIT.md finding 6. 13 of 264 Arcade tournament matches stall (5%): Lavax 7 (vs Sindarosa 2, Pax 2, Morblass, Rokcore, Treenoc), Ishimi 4; mean round 5345 ticks, longest 10 600 to 12 500 (Fiara vs Wispera, Treenoc, Pax). Wide or slow projectiles cancel (Crimson Fire 80x40 at 18 ticks, Circus speed 5). Try a different cooldown offset or stalemate break (see ARCADE_COOLDOWN_TICKS) and re-run the tournament. See balance-outliers.

## Outcome (2026-11-12)

The nightly 2.1% (1v1 and 2v2, 8 seeds, all pairings) was not Lavax or Ishimi: nine to ten pairings of melee heroes (Fiara, Pax,
Rokcore, Treenoc, Curomo, Echo, Morblass) stalled from tick 0 at 1500 ticks. Both AIs returned `Cmd.charge` on the intro ticks and
kept the bit held; the sim reads charge as an edge, so the press expired unused and a held bit never made a new one. Fix
(`ArcadeTactics.apply`, AI only, no sim change, so no SIM_VERSION bump): drop the charge bit for a tick after it was held. Measured
stalemate rate 0.021 -> 0.002 (1v1 and 2v2); the single remaining match is Lavax vs Wispera (1v1) or Lavax vs Rokcore (2v2),
two fighters overlapped in a wall corner where melee boxes never hit. `tightGates` stalemate band is now max 0.01 for both sizes.
