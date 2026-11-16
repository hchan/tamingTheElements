---
status: done
added: 2026-11-16
---

# SNAG / HEAL pops stop under the HUD scrim and the status chips (SNAG-CEIL-1)

QA r75: the floating "SNAG" word was half hidden by the "SNAGGED" / "STUN" chips. The pop is an Arena object; the Hud scene draws the scrim and the chips over it, so a pop rising from a high hero went behind them.

Done 2026-11-16: the Hud publishes the chips' un-popped rects (`tte.chipRects`); `ability-aura-view.ts` clamps each pop's top to `popCeil` (scrim bottom 102, or the lowest overlapping chip bottom plus 4), using `hudFrame(viewWidth)` so wide and left-handed views project correctly. Pure `popCeil` / `hudFrame` are unit-tested; `ability-fx.spec.ts` checks it at 1280x720, 844x390 and 844x390 left-handed (fails with the clamp off).
