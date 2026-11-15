---
status: done
added: 2026-11-15
---

# Nightly fun gates fail on round length

Found by the fading Fire Blast planner (measured on SIM_VERSION 68, 8 seeds): the Arcade 1v1 median round is 29.94 s against a 30-55 s band, and 2v2 is 41.5 s against 50-85 s. The last green nightly was at v51, so the next nightly will likely be red regardless of other work.

Decide: lengthen rounds (life totals, damage, cooldowns) or re-fit the gate bands to the intended Street Fighter pace. Needs the sim slot (one sim-changing agent at a time); check after the Fire Blast fade and CC work land, since both move round length.

## Result (SIM_VERSION 78, FG-RL)

2v2 life x1.3 (`ARCADE_2V2_LIFE_SCALE_PM`, 2v2 only): round median 44.32 -> 62.18 s (band 50-85), p90 83.7 s, time-over 0, stalemate 0. 1v1 at v77 measured 31.96 s and passes, so it is unchanged. Ready lever if 1v1 slips under 30 s: a size-1 life scale of 1150 (37.12 s, stalemate 0.002 against the 0.003 ceiling, race shifts at most 0.08); it moves the 1v1 baseline and goldens, so it is its own WP. 3v3 not changed (65 s median, 4.2% time-overs; x1.3 would be 100.8 s, 28.7% time-overs). See docs/BALANCE.md.
