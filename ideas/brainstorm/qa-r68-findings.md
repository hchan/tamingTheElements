---
status: idea
added: 2026-11-15
---

# QA r68 findings (HEAD 00247ae6)

## Verification list

- Idle player vs Hard AI at the wall: NOT fixed. Idle player x 480 -> 255 -> 30 -> 0 -> 9 (hp 8) in about 30 s; at the wall Sindarosa is half off screen (`vs-idle-8.png`) with Rokcore's hex touching/overlapping her. An active player also reached x 31-52 in a Tour and Versus fight (half off screen at x 0-52). Cornered is fine; half off-screen and touching is not. Suggest clamping the camera/arena so a wall-pinned hero stays fully visible, and a minimum gap in the Hard AI at a wall.
- Damage numbers at the drawn head: mostly good. "13", "20" and "157" sit directly above or beside the head of the hit hero. One stray "29" floated about 600 px left of Rokcore (`f-ko-00.png`), probably a number from an earlier hit before the foe was knocked back; not conclusive.
- Life-bar notches: good. Thin notches every 25 percent plus a red striped chip drain; HP-segmented, readable (`tour-3.png`). Bars are still the same length for 228 vs 455 HP.
- K.O. gap label: good. After a K.O. the bar header reads "Sindarosa K.O." greyed over an empty bar, with a red X on the portrait strip (`f-ko-18.png`). In the Tour, tag-in is automatic, so the gap is only about one frame ("PAX IN!").
- Round pips: bigger (gold check about 24 px with a WINS caption) and clearly visible in `f-ko-23.png`; could still be larger for a fighting-game feel.
- First-run card: good. "FIRST BLOOD" strip appears after the ROUND intro at x 376-904, y 588-628, ending 12 px above the action bar (y 640), and has a Got it button (`h-hint-b.png`). It does not appear in Tour fights (Versus only) which is probably fine. It is in the DOM during the loading screen, behind the loader.
- Tag slot text: WAIT on slots 3 and 4 in the round intro, "Tag 2s" cooldown, and "Tag" greyed on the K.O.'d hero. No STUN text seen on a Tag slot (not reproduced; needs a stunned active hero).
- Tour stage card Controls chips: good. Key chips (W A S D, 1, 2, C, 7, 8, 9, 3 4) with labels in two tidy lines; YOUR TEAM and the stage strip are no longer pushed off (`dbg.png`).
- Wispera portrait: still soft/pixelated on the splash (`i-splash.png`, `?seed=7`), clearly better than a blur but low resolution versus Sindarosa. The 'hi-res mist portraits' idea remains.

## New

- The Tour map card and fight agree within one launch (pinned seed). Process reminder: compare in one page or with `?seed=`.
- On a K.O. in a Tour the gold tag-in PAX IN! banner overlaps the damage number "20" on the new hero; minor.
- Stage 1 Tour opponents vary a lot between seeds (Echo, Pax, Lavax, Wispera, ...), so "Stage 1 of 9 / Easy" can look very different.

## Process

- Use `a.setHp(id, 1)` and attack to K.O.; setting 1 HP alone does not K.O. a hero in the Tour.
- Run vite from the worktree after `corepack pnpm install --frozen-lockfile --offline`.
