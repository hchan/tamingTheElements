---
status: idea
added: 2026-11-16
---

# QA r85 findings

Round r85 on main 089d234b (after PORTRAIT-POLISH). Headless Chromium, seed 7, shots in `.scratch/r85/` (gitignored, per worktree). No code changed.

## Changes since r84

- Tall portrait: gradient sky matched to the backdrop, 156px deck, zoom 1.143. Seam is smooth now. Super band sits cleanly between HUD and bar.
- Water and Air stages are now clearly distinct at 1280x720 (r84 P6 resolved).
- Tag swap verified (r84 P8 resolved, see Passed).

## Ranked findings

### P1. 390x844 spawn is still ~40% empty sky
At spawn about 280 of 630 CSS px of canvas is flat brown gradient above the crowd. Camera zoom 1.143, viewHeight 2066. Sindarosa is about 55px and Rokcore 70px wide on a 390px screen. 360x640 is fine, so the aspect-ratio rule does not scale to taller phones.
Shots: `.scratch/r85/t390-2-spawn.png`, `.scratch/r85/t390-3-close.png`, `.scratch/r85/tag-port-3v3-after.png`; compare `.scratch/r85/t360-2-spawn.png`.
Fix: cap viewHeight so the crowd/horizon sits higher (as at 360x640), or raise zoom with taller aspect and shift the camera so fighters sit in the lower 60%.

### P2. Touch targets under 44px
Skirt buttons are 39x83 at 390 and 36x80 at 360 (width under 44). In 3v3 portrait the Tag and Tag 2 buttons are 32x76. Strike1 bottom edge is 828 of 844, only 16px from the screen edge, tight against the iOS home indicator.
Shots: `.scratch/r85/t390-2-spawn.png`, `.scratch/r85/tag-port-3v3-before.png`.
Fix: widen skirt slots to 44px (fewer slots per row or two rows when over 8), add `env(safe-area-inset-bottom)` to the strike cluster, and widen Tag buttons.

### P3. Blast, Flame and Charge slots look live but do nothing on touch
On the left of the bar the first three slots render like buttons, but taps hit the canvas (no key). Strike buttons cover the function; there is no touch Charge control.
Shot: `.scratch/r85/t390-2-spawn.png`.
Fix: dim or hide those decorative slots in portrait, or make them real buttons (Charge is the missing control for melee heroes).

### P4. 3v3 portrait is crowded
11 bar slots with truncated labels ("Adrenaline"), team portrait thumbnails overlap the WINS label and cooldown text, and the left fighter (Pax) is clipped at the left canvas edge.
Shot: `.scratch/r85/tag-port-3v3-after.png`.
Fix: shrink bar labels to icons plus short text in 3v3, move bench cards clear of WINS, clamp the camera so both outer fighters fit.

### P5. HUD names truncate in portrait
"SINDAR..." at 390; the SAFE chips and the FIRE x2 chip sit tight under the HUD.
Shot: `.scratch/r85/t390-2-spawn.png`.
Fix: drop the "Life" text or stack name over bar at narrow widths.

### P6. First-run card state at tick 0 shows a plain dark ground
Before the intro starts the card screenshot has no lava or crowd art.
Shot: `.scratch/r85/t390-1-card.png`.
Fix: render the stage backdrop during the pre-intro tick, or accept (cosmetic, test-only with the stretched 2500ms timer).

### P7. Desktop: Sindarosa blends into Fire lava
Red dragon on orange-brown cracked ground; hazards also orange.
Shot: `.scratch/r85/d-stage-fire.png`.
Fix: darker ground tint or a rim light under fighters on the Fire stage.

### P8. Not re-checked this round
Tour at 390 portrait (bench cards under HUD names, r84 P5) and Tag 2 after the full cooldown in 3v3 were not re-checked. Carry over.

## Passed

- Tag swap works, with no manual-step key press. Real-time 1280x720 2v2: Digit3 swaps lead to Pax ("TAG!", cooldown 2.1s). 3v3 Digit3 swaps. Portrait 390 real touch tap on `#arcadeTag` swaps in both 2v2 and 3v3. Manual hold plus `stepLive(1)` also works. Digit4 in 3v3 3.5s after Digit3 did nothing, which is consistent with the shared tag cooldown (1.0s remaining) and not a bug; Tag 2 was not retested after cooldown (P8). Shots: `.scratch/r85/tag-desk-2v2-key3.png`, `tag-desk-3v3-key3.png`, `tag-port-2v2-after.png`, `tag-port-3v3-after.png`.
- Thumb reach: all 7 skirt buttons (Cleanse, Element, Trap, Weather, Dash, Guard, Super) fire the right keys (Equal, KeyV, KeyZ, KeyR, KeyE, KeyQ, KeyX) at both centre and the top, over-canvas part. Strike1 gives Digit1, Strike2 Digit2, the stick hit-tests correctly. The skirt owns x=116..388 over the bottom 83px; the canvas is hit everywhere else. The skirt does not steal arena taps (the arena has no tap action), and decos do not steal skirt taps.
- Super cut-in at 390 and 360 fits between HUD and bar. Shot: `.scratch/r85/t390-4-super.png`.
- 360x640 portrait reads well. Shots: `.scratch/r85/t360-2-spawn.png`.
- Desktop menu, Versus picker, four stages, 2v2 HUD and Help render with no console errors. Shots: `.scratch/r85/d-menu.png`, `d-select.png`, `d-stage-*.png`, `d-2v2.png`, `d-help.png`.
- Stable e2e subset ran three times, one at a time: 91, 91, 91 passed, 0 flaky.
