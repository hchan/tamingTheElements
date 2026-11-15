---
status: idea
added: 2026-11-15
---

# QA r54 findings (HEAD 42576d52)

Screenshots in `~/claudetmp/qa-r54/s/`. Scripts in `~/claudetmp/qa-r54/*.mjs`. Scorecard: qa-r54-scorecard.md.

## Fixed since r53

- CC HUD chips and cues landed (`?ff=cc`): chips DAZED, ICED, DOWN, SILENCED with icon and countdown in the lane under the life bars. A real "DOWN 1s" chip appeared in a Pax Ground Shock fight (`cc-Downed-groundshock-1.png`); the others via `grantStatus` (`ccg-*-{Daze,Iced,Down,Silence}-{a,b}.png`). Audio cues (ccDaze, ccIce, ccDown, ccSilence, ccShatter) now exist in `src/game/audio/arcade-cues.ts` (r53 #1 had none).
- Idle motifs and auras landed: Fiara, Morblass, Echo, Rokcore, Pax all show a standing aura (`idle-*`, `st-*`). Tag swap and the Phoenix Rise banner (with element label) still work.

## Still open

1. First-run FIRST BLOOD card still sits over the lower arena (r53 #5). Suggest anchoring it below the HUD or in a corner, and auto-dismiss on first input.
2. Wispera's dithered halo (r53 #7) is still visible. Suggest a smooth radial gradient.
3. Grey contour noise around the left dark silhouette on the main menu. Suggest cleaning the alpha matte.
4. 2v2 picker: the partner slot may still sit behind the Fight bar; r53's "More heroes below" pill is the only mitigation. Suggest a sticky partner row above the Fight bar.
5. Tour stage 9 script error after the forced KO is a harness artifact (undefined arena handle), not a game error.

## New

1. CC has chips but no body feedback. With forced statuses there is no frost tint on ICED, no lying-down pose on DOWN, no dizzy stars on DAZED, and silenced action-bar slots are not locked or greyed. The chip is the only signal. Suggest: blue tint plus crack overlay for ICED, stars over the head for DAZED, a prone pose or squash for DOWN, a padlock overlay on silenced slots.
2. Phone portrait (390x844) in-match is unusable. The rotate overlay blocks the match until "Play anyway". After that the arena is a ~390x230 strip, the action bar (two rows, Ember and Cleanse on the second) overlaps the arena, the first-run card is huge and covers the lower area, and the super banner is hidden behind the action bar (`pport-match.png`, `pport-super.png`, `pp-hit3.png`). The touch pad and Strike buttons are fine. Suggest: in portrait, collapse the action bar to one scrollable row, scale the arena to full width with the camera on the fighters, shrink the first-run card, and raise the super banner above the bar. Phone landscape (`ph-hit3.png`) looks good.
3. CC chip lane has low contrast over the crowd band, and the chips share a colour family so only the icon differs. Suggest per-status accents (cyan ICED, yellow DAZED, brown DOWN, purple SILENCED) and a darker backing plate.
4. Real-match repro: only DOWN was reproduced by hit script. Daze (tornado), iced (ice blast, icicles, ice shock) and silence (Ember prime) were verified only via `grantStatus`. A deterministic e2e per rider would close this gap.

## Coverage

Menu (desktop, QHD, phone), hero select, 1v1 in Fire, Water, Earth, Air (intro, start, hit, super), tag swap, super, 2v2, Tour, Help, phone landscape and portrait in-match, CC chips for Fiara and Morblass, idle auras for Pax and Rokcore. Not judgeable from stills: motion feel, hit-stop, audio.
