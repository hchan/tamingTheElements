---
status: idea
added: 2026-11-13
---

# QA r6: cryptic floor labels, unlabeled HUD pips, flat life bars

Evidence: tourfight-1.png, tourfight-4.png, fight-a-1280.png, fight-a-1920.png (~/claudetmp/qa6/).

## Problems

- (DONE, see ideas/done/qa-r6-floor-labels-and-hud-pip-labels.md) Floor pads show text labels such as "AIR x2", "FIRE x2", "WATER +HP", "+ SAFE", "+ FADE 1s", "WEATHER 0%". They read as debug text, not as pickups, and "P1 Fire Bomb" overlaps the sprite.
- (DONE) Two small round pips and the super segments next to the timer have no label. A new player cannot tell rounds won from super charge.
- Both life bars are the same flat green regardless of element or health; there is no low-health colour change, no damage ghost (the trailing chip bar SF players expect).
- The crowd along the top is nearly invisible at round start at 1280.

## Suggested fix

- Replace text with icons plus a faint glow ring; show the text only on first encounter or hover (Help lists them).
- Label round pips with "Rounds" tooltip and use filled gems; label super with its key.
- Element-tinted life bars with a yellow chip trail and a red flash under 25%.
- Light the crowd (rim light, a subtle bob) so the arena feels alive.
