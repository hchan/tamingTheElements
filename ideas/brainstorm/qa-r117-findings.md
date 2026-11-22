# QA r117 findings (ranked)

status: idea
triaged: c (2026-11-21; fixed: help chips, first-run hint, More-below pill, hit-stop exists. Plan in order: 1 view-only: smaller hit burst + target flash (pose-vfx.ts:232), super cut-in damage number depth vs sub-label, FIGHT banner offset when close; 2 HUD vs picker life scale (bars.ts:279 vs hero-info.ts:193); 3 water stage props (terrain-ambient.ts, needs art-director); 4 AI footsies approach, src/core/agents, sim+golden+balance impact, Opus plan first)
added: 2026-11-19

Desktop 1280x720 only, headless Chromium (SwiftShader), test build of local main (7343dc41). Screenshots under `.scratch/qa-r117/` (worktree). Driven with `__TTE__.arena.step` (manual stepping), so animation timing is read from sim positions, not wall clock.

## r116 items re-checked

1. First-run hint ("FIRST BLOOD ... Got it") covers the lower arena: STILL OPEN. It shows in every fresh Versus fight (fire, earth, air) and sits over the floor right where fighters brawl, 100+ ticks in (`07-fire-hit-5.png`, `23-stage-earth-hit.png`, `23-stage-air-hit.png`). It also repeats the controls line that Help and the action bar already show. Idea: dismiss on the first move or hit, or dock it into the footer strip above the action bar.
2. Help chips wrap unevenly: STILL OPEN. Rows are 4 / 1 / 4 with "Reading the arena" alone and centred (`20-help.png`). Idea: grid of equal columns, or one scroll row.
3. Fighters static: PARTLY. The AI foe stands still unless hit; in 2v2 and Tour both sides sit at opposite ends 700+ px apart after 150 ticks (`12-2v2-fight.png`, `19-tour-fight.png`). Idea: AI should close distance (footsies).
4. HUD life numbers vs picker "Life 100": STILL OPEN. HUD shows Sindarosa 286, Pax 690/591, Curomo 542, Echo 675; picker says Life 100. Idea: percent in HUD or the same scale in the picker.
5. Projectile bursts cover the target: FIXED 2026-11-21 (the 110 px starburst is src/game/fx/impact-view.ts IMPACT_SIZE, not pose-vfx.ts:232 which is the mote burst; now 72 px, alpha 0.8 fading out, impactAlphaAt; the target flash/recoil already exists in character-view.ts flash/recoil). Was: STILL OPEN. The starburst hit spark is about 110 px wide and hides the target's torso (`07-fire-hit-5.png`, `23-stage-air-hit.png`); the damage number is large and clear though. Idea: smaller burst at the contact point, plus a brief target flash/recoil so the body stays readable.

## New

6. Hit feel / hit-stop: from the sim probe, a connecting Fire Blast does damage (690 -> 661) and the foe is then shoved from x 640 to 745 over about 14 ticks with an eased slide (13, 13, 12, 11, 10, 9, 8, 7...). There is no frozen frame of any length on contact, so a hit has no "crunch". Idea: 3-5 tick hit-stop on both fighters (and a small screen shake on strong hits), SF-style. High value for feel.
   Note: hit-stop already exists in the Arcade sim (4-10 tick freeze by strength, 30 on KO; see `hitStop` in src/core/sim/systems/arcade/hit.ts). The QA slide measurement missed the hold: the victim stays at x 640 for 8 ticks before the 640 -> 745 slide. Pinned by a test in knockback.test.ts.
7. Super cut-in: the damage number "35" lands on top of the element sub-label ("FIRE") in the band and half hides it (`08-super-cutin.png`). The band also hides the top-bar status chips row behind it. Medium-low. Idea: damage numbers stay under the band, or the sub-label moves to the band's left.
8. FIGHT! banner overlaps fighters when they spawn close (water 1v1, `22-stage-water.png`): the banner sits on the heads. Low, only when close.
9. Water stage is the plainest: 0 terrain patches, no props; fire has 5 patches and chips, earth boulders, air patches (`22-stage-water.png` vs `23-stage-earth-hit.png`). Idea: add ice props/puddles so the water stage reads as an arena with features.
10. Tag swap feedback is good ("TAG!" call, portrait swap, ADREN chip; `14-tag-after.png`) but the "TAG!" call is placed top-left over the sky band, away from the incoming hero's body in this shot (the hero is at x 130-300, call at 140-260; fine) and the bench slot ("3.0s" / "2.6s" timer) is tiny. Low: the tag cooldown number is hard to read at 1280x720.
11. Versus picker: the explanatory copy at the bottom ("The arena starts on the element you pick ... call Weather in the fight to change it") is cut off by the sticky Fight footer, with a floating "More below" chip on top of the text (`02-versus-picker.png`). Same "More below" chip overlaps the ability text on the Tour setup (`17-tour-setup.png`, "Enter" key label clipped). Medium-low.
12. Tour fight HUD: team portraits both sides stacked under the timer read well (`19-tour-fight.png`); no first-run hint there, so the hint is inconsistent between Versus and Tour (probably intended).

## Player-facing words

No Classic, Arcade, ruleset or Capture seen in menu, Versus picker (all labels), Tour setup, HUD, Help top section (text dump checked). "Snag" is used. No console or page errors in the whole run. Note Help body text was only checked for the first section.

## Not covered

Online screen; phone viewports (owner dropped); live-clock feel (stepped manually, so no frame-time or audio judgement).

## Smoke

`pnpm e2e:smoke`: 15 passed, 0 failed (2m02s). e2e ran on: PC (job 20261119-093517-short-6f1e39, short lane) -> exit 0
