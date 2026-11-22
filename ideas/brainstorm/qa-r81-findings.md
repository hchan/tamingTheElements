---
status: idea
triaged: c (earth mirror readability open; rest fixed, dropped or noted)
added: 2026-11-16
---

# QA r81: findings (main 03449bfc)

Screenshots in .scratch/r81/shots/ of the QA worktree (agent-aed425986345e4924): stage-fire/water/earth/air.png, super-1/2.png, 2v2-before.png, tag-1/2.png, tag-clean-1/2.png, main/help/tour/versus/arcade-d1280.png and -p568.png, menu-port.png, versus-port.png, port-fight.png, tour-1.png. Scripts in .scratch/r81/*.cjs (adapted from the r80 scripts).

## Verification of r80 items

| Item | Result | Evidence |
|---|---|---|
| Portrait 390x844 fight layout | Still open (finding 1) | port-fight.png |
| First-blood hint covers the lower arena | Not reproduced in real time: e2e first-run-hint "slim strip above the bar and fades on its own" passes. In my manually stepped shots it stays because no wall-clock time passes; on phone it is still a large card (finding 2) | stage-fire.png, port-fight.png |
| Versus picker half-hidden roster at 1280x720 | Unchanged (finding 3) | versus-d1280.png |
| Earth stage flat yellow-green | Unchanged (finding 4) | stage-earth.png |
| Distinct E2E_PORT | Used 7931, no clash | n/a |

## Play-through evidence

- Four stages at 1280x720 (fire Sindarosa, water Curomo, earth Rokcore, air Echo, vs Pax, weather swapped in): distinct palettes, weather banner (SUN, RAIN, SAND, GALE) and buff/debuff chips.
- Super (Curomo): super-1.png shows 96 hit, fan burst, rings, foe chips TIDE / STUN / STONESKIN.
- 2v2 and tag: tag-clean-1.png ("TAG!", chevrons, Sindarosa benched with 2.7 s, Pax in). The scripted first attempt (tag-2.png) was blocked while stunned, as designed.
- Tour: Play picker with three heroes and "Start tour" (tour-d1280.png), then "Stage 1 of 9" screen with locked stages, continues and controls (tour-1.png). A full Tour run was not played.
- Menu, Help, Settings, Versus, Play, Online open at all five sizes; version stamp 03449bfc shown; no Classic/Arcade/ruleset/Capture words on the screens seen (Snag is used).

## New findings

1. Portrait 390x844 (open since r79): the arena is a ~390x120 strip with a huge black area above; the first-blood card (about 140 px tall, text not trimmed for touch) and the stick/buttons take more space than the arena itself. Suggest scaling the arena to the full width of the dead area, or a tall-arena layout, and a one-line hint on phones.
2. Phone hint card text is long ("Tap Cleanse ... Tap the Snag box ...") and sits between the action bar and the controls; shorten to one line or dismiss on first touch.
3. Earth mirror readability: Rokcore and Pax are both grey rock golems with similar silhouettes and the earth stage is flat sand, so the foe is hard to pick out when they overlap (stage-earth.png). A contrasting tint or outline for the AI side would help.
4. Versus picker at 1280x720 and 390x844: options take about half the screen before heroes show (Fire row cut, "More below" cue present). Tour picker is better (hero slots top, roster below).
5. Hero art and hit effects are flat next to SF/MvC: no screen shake or hit-stop was visible in stills; check feel in real time next round with a video capture.

## Gaps

Round-end screen and a full Tour run not played; hero art roster24 is hidden and was not assessed; lint, typecheck, vitest not run.

## Triage 2026-11-21 (code-checked)

Fixed: Versus picker roster cut at 720p (r119 triage, `src/ui/styles/main/10-picker-layout.css`); hit-stop confirmed working (r119 N4, `ideas/done/sf-hit-stop-juice.md`); first-blood hint fades on its own (`src/ui/styles/main/09-help-first-run.css:51`, e2e first-run-hint). Dropped (phone/portrait): findings 1 and 2 and the phone part of 4. Not a bug: hint staying in manual-step shots.
Open (low, needs a screenshot): Earth mirror readability (finding 3): Rokcore vs Pax grey golems on a flat sand stage; no AI-side tint or outline in `src/game/fx/hero-grade.ts` (only a Rokcore sunlit rim). Earth stage flat (from r80) is the same visual question; earlier lift in `src/game/fx/earth-light.ts`.
