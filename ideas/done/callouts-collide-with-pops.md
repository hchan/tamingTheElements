---
status: done
added: 2026-11-16
---

# Defence call-outs (ROOTED, FREED, PARRY ...) can still print over white damage pops

DMGNUM-1 moves the grey HUD damage numbers clear of pops and call-outs, but the white pops (`shock-view.ts`) and the call-outs (`defence-view.ts`) are still placed independently of each other, so a call-out can sit on a pop above the same fighter. The call-out's r49 lift uses the sim box, not the drawn pose. Follow-up: give call-outs and pops one shared lane per fighter (or have the call-out read `POP_RECTS_KEY` and stack above it), with an e2e over a parry plus a plain hit.

Done 2026-11-17 (CALLOUT-POP-1, branch `callout-pop`): render-only. `defence-view.ts` now anchors a call-out above the drawn (scaled) head, lifts it to 8 px above any white pop rect in `POP_RECTS_KEY` (a ratchet, it never drops back while the word lives), keeps it under the HUD scrim and status chips, and slides it sideways (at most 120 px, 16 px margin) when the ceiling leaves no room above a pop. The pure solver is `defence-callouts.ts`; `Arena.overlays()` is the dev/test probe; `tests/e2e/callout-pop-lanes.spec.ts` covers rooted plus pop, charge, ceiling, slide and reduced motion at 1280x720 and 844x390 touch. Screenshots (worktree `.scratch/callout-pop/{before,after}`): before, the pops and call-outs share the head box; after, CHARGE! sits in its own lane above the white pop. Known limits are in [callout-pop-limits](callout-pop-limits.md).
