---
status: done
added: 2026-11-14
---

# Overlapping banners and floaters

K.O., SINDAROSA IN!, SNAG, AIR x2 and damage numbers stack in the middle of the screen (t0-desk-r1-ko-final-a.png). The ROUND 2 banner ghosts behind the round result panel (t0-phone-r1-result.png). Queue the banners, or fade older ones when a new one starts. Also the FIGHT! banner lingers in manual-stepping shots (may be a stepping artifact, unverified).

## Progress

- 2026-11-14: lanes in src/game/hud/banner-lanes.ts: the super cut-in hides the round banner, the intro ROUND banner hides behind the result card, X IN! and SNAG/HEAL pops wait (max 2 s) while the centre is busy. Damage numbers were already dimmed under the banner. The lingering FIGHT! is now hidden under the super cut-in.
