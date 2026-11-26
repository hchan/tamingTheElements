---
status: done
added: 2026-11-17
---

# Call-out placement limits left by CALLOUT-POP-1

Accepted limits of the call-out placement in `defence-view.ts` (see [callouts-collide-with-pops](../done/callouts-collide-with-pops.md)):

- A call-out lifted to clear a pop snaps up in one frame instead of easing.
- Call-outs pinned at the HUD ceiling can still overlap each other.
- Flat (reduced motion) call-outs still move when gold numbers appear.
- A pinned call-out whose sideways slide finds no free spot can still overlap a pop.
- `popLaneLift` counts live pops rather than finding a free lane.
- The ability-aura HEAL and SNAG word pops (`ability-aura-view.ts`) avoid neither the pop rects nor the call-out rects.
- In the after shot of the slide scenario a CHARGE! call-out slid under the TAG portrait at the top of the HUD (the portrait is not in the chip rects).

## Progress

2026-11-26: render-only. Already handled before this pass (code check): the lift eases (`easeUp`), pinned call-outs avoid each other (obstacle list), and `popLaneLift` already finds the lowest free lane. Fixed: the bench row (tag pill and benched portraits, the "TAG portrait" shot) is now a ceiling obstacle via `benchRects` in `pop-lanes.ts`, used by `defence-view.ts` `ceilAt`; unit test in `pop-lanes.test.ts`. Still open: flat call-outs moving when gold numbers appear, a slide with no free spot, HEAL/SNAG aura word pops avoiding pop and call-out rects. No screenshot taken (load).
