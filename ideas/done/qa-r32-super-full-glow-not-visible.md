---
status: done
added: 2026-11-14
---

# SUPER full glow is not obvious in a still

At SUPER 3 MAX the label and pips are clear and the Super slot gets a faint gold outline, but the bar itself does not glow and the slot barely differs from Dash/Guard in a still (stills use manual stepping, so a pulse may be missed). Make the glow brighter or add a persistent rim on the life bar.

Shots: ~/claudetmp/qa-r32/meter3-full-1280-1.png, super-ready-1280.png.

## Resolution (2026-11-14)
Action-bar super slot: wider gold halo, steady solid rim, stronger wash; readyGlow floor 0.55 to 0.75. Verified at 1280. The life-bar gold rim (steady edge + breathing halo, steady under reduced motion) is now drawn in Hud.ts drawSuperRim; shots ~/claudetmp/super-rim/.
