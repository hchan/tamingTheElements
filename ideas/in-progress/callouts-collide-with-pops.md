---
status: in-progress
added: 2026-11-16
---

# Defence call-outs (ROOTED, FREED, PARRY ...) can still print over white damage pops

DMGNUM-1 moves the grey HUD damage numbers clear of pops and call-outs, but the white pops (`shock-view.ts`) and the call-outs (`defence-view.ts`) are still placed independently of each other, so a call-out can sit on a pop above the same fighter. The call-out's r49 lift uses the sim box, not the drawn pose. Follow-up: give call-outs and pops one shared lane per fighter (or have the call-out read `POP_RECTS_KEY` and stack above it), with an e2e over a parry plus a plain hit.
