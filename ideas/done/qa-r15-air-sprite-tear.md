---
status: done
added: 2026-11-14
---

# Possible torn Pax sprite on the air stage (r15)

One hit frame of Pax on the air stage (12-air-after.png) showed a split, torn sprite. Not reproduced in the animation strip (30-pax-sheet.png), so low confidence: check the Pax hurt frame for a cell boundary or filter seam on the bright backdrop.


Outcome (2026-11-14): tear not reproducible in headless shots; real flaws were opaque black pits on the far arm and detached wisps at the ragged edge. Fixed in portrait-rig prep (matte.alphaCut, pits repaint), Pax sheet re-baked, checked on all 4 stages with tools/assets/portrait-rig/bright-check.py.
