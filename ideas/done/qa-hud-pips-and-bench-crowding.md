---
status: done
added: 2026-11-14
---

# HUD: tiny ROUNDS pips and 2v2 bench crowding the SUPER segments

From qa-r9 (ideas/brainstorm/qa-r9-scorecard-and-status.md): "Pips/ROUNDS circles: still tiny" and "2v2 bench portraits ... still crowd the SUPER pips".

Done (presentation only):
- Round pips radius 8 to 11, thicker rim, centred at y 60, spacing 27 from 18 off the centre line (clear of the super meter by 4 px, a test pins it); the ROUNDS caption is 13 px (was 11) and sits under each side's pair.
- Bench chip row moved down 4 px (CHIP_Y 54 to 58) so it no longer touches the SUPER segments; tag-fx's repeated bar y follows.

Shots: ~/claudetmp/hud-pips/ (1280x720, 1v1 and 2v2). The TAG caption size is unchanged.
