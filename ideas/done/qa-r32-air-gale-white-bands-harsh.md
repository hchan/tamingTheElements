---
status: done
added: 2026-11-14
---

# Air Gale active shows two hard white bands plus a chevron grid

Rain chevrons are now small and sparse (good, st-water-active.png), but the Gale strike draws two full-width pure-white lines plus a chevron grid, which is the loudest thing on screen and crosses the fighters. Soften the lane edges to about 40% alpha and thin them.

Shots: ~/claudetmp/qa-r32/st-air-active.png vs st-water-active.png.

## Resolution (2026-11-14)
Gale edge bars and glow toned down (2px, 0.22 alpha, 0.06 glow) and the impact flash softened for the air gale only (src/game/fx/hazard-view.ts). Not verified with a real-time gale screenshot.
