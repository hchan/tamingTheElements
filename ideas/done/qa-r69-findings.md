---
status: done
triaged: obsolete or fixed (e2e flakes fixed, banner calls fixed, rest cosmetic or phone)
added: 2026-11-15
---

# QA r69: findings

Build main 31cf781c, headless only. Screenshots in ~/claudetmp/qa-r69/, e2e logs in ~/claudetmp/qa-r69/e2e/.

## e2e results

Stable subset (app-flow style set, 48 tests): 48 passed.

Focus specs, three runs (responsive 2560x1440 and all other responsive tests passed every time):

- hit-mark-element "hit mark colours stay apart per attacker element": failed 3/3, same value every run. fire vs earth mean mark colour 29.23 / 29.23 / 29.27 against a threshold of 30. REAL near-regression (deterministic, just under the threshold). Likely the HF1 element-colour or mark change; raise the mark separation or lower the threshold on purpose.
- versus-stage-pick: Water and Earth failed in run 1 (stage 0 instead of 2/3), Water and Air in run 2, Earth in run 3 (3 expected, 0 received). Different stage each time, Fire passed every time. FLAKE: terrain().stage reads 0 (not yet set) after step(95), so the spec races the stage being applied; the machine was also loaded by the long responsive spec (a 48 s test seen in run 3). Worth a wait on terrain().stage instead of a fixed step count.
- idle-aura: sindarosa "fire aura is clearly visible in pixels" failed once (run 2, changed pixels 155 vs 2500 required, noise 185); "an undisturbed hero is not dimmed and carries a front layer" failed once (run 3, Expected > 0, got 0). Both passed in the other runs: FLAKE under load (shown-vs-hidden same-frame pixel diff is timing sensitive). Not a regression of the aura ghost fix.

## Visual findings

Good:
- Picker "More below" tab is small, on the top edge of the bar, legible on phone.
- ROUND banner is bone on a dark feathered band, readable everywhere.
- Life bars are equal length, the number carries the HP.
- TAG! call sits clear above the head and combo (flash-t1.png), large and bone white.
- Super cut-in (super-cutin.png) is strong: blue band, speed lines, GLACIER CRASH / WATER.
- No aura ghost above the crowd wall (aura-top-Fire.png, aura-top-Air.png).

Weak:
- PAX IN! / SINDAROSA IN! call is huge, hugs the left edge (x 16 to 424) and overlaps the damage number "30" (tag-swap-t3, ko-pax-in-t1).
- TAG! is hidden for about 15 view ticks while FIGHT! is up, so a swap right after the round start gets no call.
- Swap flash on the life bar goes pale for a few ticks, easy to read as a dimmed Pax bar (flash-t1, flash-t2).
- Hero names are faint and clipped at the edge while the round banner slides (round-banner-t5).
- Floating orange triangle aura glyphs on fire heroes look odd (aura-top-Fire.png).
- Tour fight shows the enemy bar pale blue and the player bar orange, easy to confuse with element colours.
- Portrait phone (390x844) shows only the rotate overlay by design; "Play anyway" was not offered in the arcade test path (phone-play-anyway.png is the overlay), landscape 844x390 2v2 is playable (phone-landscape-2v2.png) but the HUD plus tag chips take the top fifth of the screen.

## Suggested follow-ups

1. Fix or retune hit-mark fire vs earth separation (29.2 vs 30).
2. Make versus-stage-pick wait for terrain().stage; add retry guard to idle-aura pixel tests.
3. Shrink and re-anchor the IN! call, keep it off the damage numbers.
4. Show TAG! after the FIGHT! banner clears instead of dropping it.

## Triage 2026-11-21 (code-checked)

Fixed: hit-mark separation (the spec now measures marks hidden vs shown on the same frame, commit bf05de0ca, `tests/e2e/hit-mark-element.spec.ts`); versus-stage-pick race (`expect.poll` on the drawn stage, commit 33c836b11); idle-aura flake (settle frames, same commit); TAG! dropped during FIGHT! (`BANNER_WAIT_TICKS` in `src/game/hud/banner-lanes.ts`); PAX IN! over the damage number (`ideas/done/qa-r34-pax-in-overlap.md`). Dropped (phone): portrait/landscape HUD size and "Play anyway". Not re-reported in later rounds, dropped as stale: pale swap flash, faint hero names during the round banner, fire aura glyphs, enemy/player bar colours.
Open: none new; the e2e fixes are covered by the nightly full run.
