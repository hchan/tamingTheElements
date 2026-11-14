---
status: done
added: 2026-11-14
---

# Phone landscape fight uses about 660x330 of 844x390 (r19)

At 844x390 the fight canvas is pillarboxed with about 95 px dark bars each side and the HUD text (Life, SUPER, tag cards) is roughly 8-9 px. Street Fighter on a phone fills the width. Idea: let the touch layout stretch the arena to the full width (crop the crowd band) and scale the top HUD separately; the stick already sits in the bar area.

Progress 2026-11-14 (wide-phone-view): the side bars are gone in the panning fight. View only, no sim change: `enableWideView` (src/game/boot/viewport.ts, called by `mountArenaPan`) widens the game to the `#game` box's aspect, so 844x390 shows 1642 logical px of arena on an 844x370 canvas (was 658x370 at x=93) and 932x430 shows 1636 on 932x410 (was 729x410 at x=101); 1280x720 is unchanged. The top HUD and action bar keep their 1280x720 size, centred, with the stick over the extra arena on the left. Asserted in tests/e2e/touch-fight-layout.spec.ts; shots in ~/claudetmp/letterbox/{before,after}. Still open: the HUD text stays about 8-9 px (it could now grow into the spare side width), and online Arcade (no pan camera) keeps the bars. Status stays idea.

## Done (2026-11-14)

The wide view (r19) removed the side bars. The rest: SUPER label boost 1.45 to 1.7 and the ROUNDS caption scaled with `phoneBoost` (`src/game/scenes/Hud.ts`, `hud/round-view.ts`), so HUD text is now about 11-12 CSS px at 844x390.
