---
status: in-progress
added: 2026-11-16
---

# SUPER-AIR-1: super title contrast at the cut-out

QA r73 item 4: the pale Air super name faded with the band, and its dark rim faded with it, so it read about 1.1:1 over the pale Air floor.
Fix (view only): `titleAlpha(bandAlpha)` in `super-cinematic.ts` makes the name and sub text fully opaque (full rim) or gone (cut at 0.4).
`superFx()` now reports `nameAlpha` and `subAlpha`. Band, edges, glow and portrait keep `bandAlpha`. B2 (muting the Air band fill) is not done
unless the peak shot reads pale.
