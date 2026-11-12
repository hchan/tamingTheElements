---
status: done
added: 2026-11-12
---

# Make Snag damage independent of the holder's damagePm

From docs/ABILITY-AUDIT.md finding 2. Snag is 11.6% of all Arcade damage (2x any other non-super) and its 30 base damage is multiplied by each holder's damagePm (Curomo 1560, Echo 1530, Wispera 1400, Treenoc 1270), so results by holder run 87.5, 60, 57, 34%. Try a flat Snag damage (or a per-holder table) and re-run the Arcade tournament. Related: snag-ability, curomo-arcade-nerf. SIM_VERSION bump and design approval needed.

Done 2026-11-12: not needed. The Curomo damagePm cut (1560 -> 1250) already scales Snag down with it and brought the race to 60%; flat Snag damage was not tried and stays open as an option if Snag holders diverge again.
