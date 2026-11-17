---
status: idea
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
