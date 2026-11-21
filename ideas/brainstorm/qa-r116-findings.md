# QA r116 findings (ranked)

status: idea
triaged: c (2026-11-21; r116 items all repeat in r117, see that file. Fixed: help chip grid help.css:26-31, first-run hint fades on input or 2.5 s first-run-hint.ts:23,347-356, More-below pill in bar 10-picker-layout.css:85, hit-stop view hit-feel.ts:212. Still open: AI footsies in src/core, HUD Life 286 vs picker 100 scale (bars.ts:279, hero-info.ts:193), hit burst size, water props. Plan: see qa-r117-findings)
added: 2026-11-19

Desktop 1280x720 only. Screenshots under `.scratch/qa-r116/`.

## r115 findings re-checked

1. Super cut-in over combo text and badge: NOT reproduced. With a live 2-hit combo (58 and 47 damage numbers) the HELLFIRE LANCE band sits lower and the numbers stay above it; the SAFE and STUN badges stay in the strip above the band (`13-super-after-combo.png`, `10-super-cutin.png`). The one remaining overlap: in the 2v2 TITAN SLAM cut-in the "ADREN 3s" and "SAFE" badges sit inside the band area at the left (`10-super-cutin.png`); they stay readable. Low.
2. Earth ROCK patches: FIXED. Two boulder props are visible on the earth stage (`04-stage-earth.png`, `05-earth-late.png`); the terrain probe reports 4 patches labelled ROCK. Note the "ROCK" label chip was not visible in the shot; only boulders are.
3. Tag key: WORKS. Key 3 gave `tag().call === 'TAG!'`, lines `IN Pax / BENCH Sindarosa 100% / TAG 3.0s`, portraits swapped, TAG! text over the arena (`08-tag-swap.png`, `09-tag-swap-after.png`). The r115 miss was the script.
4. Hit visibility: PARTLY. Damage numbers (58, 47) are large and clear, but the flame projectile bursts still cover the target sprite, so it is hard to see the hit reaction (`12-hits-combo.png`).

## New or still open

5. First-run hint "FIRST BLOOD ... Got it" still sits over the lower arena in fights (`12-hits-combo.png`). Medium-low. Idea: auto-dismiss after the first move or first hit.
6. Help jump chips wrap to three uneven rows (4 / 1 / 4) with the lone "Reading the arena" centred (`16-help.png`). Idea: even grid or a horizontal scroll row.
7. Pacing: fighters stay far apart and static until a script places them (`04-stage-*.png`); SF-style footsies and pushback are not visible in AI-vs-idle play. Idea: more AI approach, hit pushback.
8. Life numbers: HUD shows 286/286 for Sindarosa while the picker said Life 100; mixed scales (591, 519). Idea: show percent or one common scale.
9. Hero select (Versus picker) is text-dense; the explanatory copy is still near the sticky Fight footer (`02-versus-picker.png`).

Player-facing words: no Classic, Arcade, ruleset or Capture seen in menu, picker, HUD, Tour or Help top. No page errors.
