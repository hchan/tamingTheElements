---
status: done
added: 2026-11-13
---

# Lavax and Pax look alike; dark heroes vanish on dark stages

Severity: high (readability). Both are dark cracked lava rock with near-identical silhouettes. On the water and fire stages the hero is dark on dark and the foe is hard to pick out (water1-3mid.png, f-6-b.png).

Fix: team-coloured rim light or outline, a distinct silhouette or palette per hero, a lower-contrast stage floor under fighters.

Screenshots: ~/claudetmp/qa/r3/water1-3mid.png, stages.png.


Outcome (2026-11-14): tear not reproducible in headless shots; real flaws were opaque black pits on the far arm and detached wisps at the ragged edge. Fixed in portrait-rig prep (matte.alphaCut, pits repaint), Pax sheet re-baked, checked on all 4 stages with tools/assets/portrait-rig/bright-check.py.
