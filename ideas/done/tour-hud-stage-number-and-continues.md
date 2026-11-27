---
status: done
added: 2026-11-15
---

# Tour HUD stage number and continues count

Show the Tour stage number and the remaining continues in the fight HUD, not only on the stage card.

## Progress

- 2026-11-26: already fixed on main by WP-T1 (commit 54ddacda1). `tourStageChip` (src/ui/screens/tour.ts) is appended to the fight host in src/game/app/tour.ts and shows "Stage N of 9" and "N continues left" bottom-left. Covered by the stage chip test in src/ui/screens/tour.dom.test.ts. Closed, no code change.
