---
status: done
added: 2026-11-15
---

# Glow and aura y anchor

WALL-3a re-centred glow and aura on the drawn body in x only (Q11 decision); for Q12 y was left unchanged. Revisit if the y offset is visible at the floor or ceiling.

Done: Arcade glow, halo and aura now anchor on the drawn body y (visual box top) as well as x; the 2x sprite grows up from the feet, so the sim top sat h(k-1) too low. Classic keeps sim anchors. View only, no SIM_VERSION change. Test: character-view.test.ts "centred on the drawn body in y".
