---
status: done
added: 2026-11-15
---

# TAG! call position on the wide view

On the panned wide camera the TAG! call can sit away from the incoming hero. Anchor it to the drawn head in screen space, as the damage numbers are (WP-HC1 C).

## Progress (2026-11-26)

Head anchoring in the Hud frame already shipped (DMGNUM-1: `hudFrame` projection, `placeCall`). Remaining defect fixed: the combo-avoid slide used a fixed 640 centre; it now uses the real frame centre (`placeCall` `centreX`).
