---
status: idea
added: 2026-11-27
---

# Wall hold: ouroth, vortigal, pax, echo still overlap

MEASUREMENT (v121 wall-pin probe, level 4, 16 seeds): after the allowance, ouroth's median wall gap did not move (141 -> 141) and its drawn overlap stays 86% (84.6 -> 86.1), so the hold is not what limits it; a bigger extra alone is unproven. Find the cause. Vortigal is unchanged (overlapAtWall48 34.3 -> 34.6, gap P50 101 -> 101). Pax and echo overlapAtWall48 are still 9.3 and 6.0 (from 17.7 and 19.5).

Next: trace which command path moves these heroes into the wall gap (approach, dash, attack step) and whether it bypasses `wallHold`.
