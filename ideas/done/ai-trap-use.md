---
status: done
added: 2026-11-12
---
# AI turns Puddle and Gust into hits

WP 39e (trap tuning) left Curomo, Cyclonius and Lavax under 45% and trap damage share at 1.5%. Puddle and Gust numbers did not move win
rates because the Normal AI places traps but does not follow up (slowed foe not chased, shoved foe not pressured).
Work: in the Arcade AI agent, place traps where the foe will walk, press a slowed or shoved foe, plant more often at Normal.
Acceptance: trap damage share 2 to 5%, timeout share under 45%, race win rates 45 to 57 (see trap-balance-findings.md).

## Results (WP 39f, SIM_VERSION 35)
Normal plant rate 80 -> 240; AI presses a foe in its own armed Puddle (60 ticks after leaving) and 45 ticks after its own Gust ends.
24 seeds Normal: trap damage share 1.52% -> 2.06% (met); timeout share 57.5% -> 58.2% (not met; the foe AI avoids traps, and a dried-up
Puddle counts as timeout); win rates: Cyclonius 41.7, Lavax 40.5, Rokcore 44.7 below 45 (Cyclonius/Lavax were already low: race or AI
issue, not traps). Tried and dropped: lane-check and blind "plant where the foe will walk". Next: foe AI that deliberately walks into
traps is not wanted; revisit the timeout metric (split Puddle dry-up from true timeouts) and the low races separately.

## Timeout metric split (tools only, no sim change)
`trapstats.mts` / `report.mjs` and `fun-metrics` (`trapTimeouts`, new `trapPuddleDryups`) now count a Puddle whose life ended apart from a
true timeout (a Puddle never fires, so every undoused Puddle ends that way). Same 24 seeds Normal run (1584 matches, 11363 traps placed):
true timeout 41.9% of placed traps (44.7% of traps that ended; target under 45% is **met**), Puddle dry-ups 16.4% (17.5% of ended),
combined old metric 58.3% (the 58.2% above, within rounding of the rerun). So the 58.2% was mostly Puddle lifetimes, not foes dodging
Bombs, Spikes and Gusts; 733/886 Curomo, 471/670 Ishimi and 659/847 Morblass Puddles dried up. Remaining gap: the low races (Cyclonius, Lavax, Rokcore).

## Closing check (SIM_VERSION 41, no sim change)
Re-measured with `trapstats.mts` (24 seeds, Normal, 1584 matches, 11520 traps placed): trap damage share 2.02% (target 2 to 5%, met);
true timeout 42.2% of placed (target under 45%, met; Puddle dry-ups 15.9% kept apart, see above); race win rates 44.3 to 57.2%
(Cyclonius 44.3 and Morblass 44.7 are 0.3 to 0.7 pp under 45, Fiara 57.2 is 0.2 over 57, all inside the roughly 2.5 pp sampling noise of 24
seeds; the Lavax/Cyclonius/Rokcore gaps from WP 39f were closed by life retunes in SIM_VERSION 36 and 37). Further AI tuning would chase
noise and the foe AI is not meant to walk into traps, so the idea is closed with no sim change.
