---
status: idea
added: 2026-11-17
---

# QA r96 findings (main f0828a8a)

Scores are in [qa-r96-scorecard.md](qa-r96-scorecard.md). No code changed. Screenshots under `.scratch/shots/` (gitignored, QA worktree). Setup: Versus, tap the Options strip, pick the stage, Fight!, tap "Play anyway in portrait", step 95 and 295 ticks, at 390x844 and 360x640 (isMobile, touch). 8 stage runs plus Help, live 1v1, live 2v2 and an idle manual run; no console or page errors.

## Ranked findings

P1. Hard horizontal seam at the top of the portrait arena art. A flat dark block (cracked-texture visible on Fire and Earth) ends in a straight edge where the stage haze starts: y~545 device px at 390, y~200 at 360. Visible on all four stages (`m390-fight-Fire.png`, `m390-fight-Earth.png`, `m390-result-31.png`, `m360-fight-Water.png`). Repro: Versus, any stage, Fight!, Play anyway in portrait, look at the top third of the canvas. Suggest extending the mirrored tile or a gradient over the block instead of a flat fill.

P2. Crowd/haze step. A second, softer horizontal step sits above the crowd line (y~765 at 390, y~400 at 360) where the haze gradient jumps in brightness (`m390-live1-4.png`, `m390-result-31.png`). Same repro as P1. Fixing P1 and P2 together (one continuous gradient) is likely.

P2. Dark brown band under the floor when the camera is panned: about y 1315-1365 at 390, between the floor and the action bar (`m390-live1-5.png` shows the floor ending just above the bar; `-b` fight shots show the strip). Repro: Versus, Fight!, Play anyway in portrait, step 200 more ticks or move to an edge. The floor mirror below does not reach the bar.

P3. Help chip grid is even in columns but ragged in rows: "Choosing your heroes" wraps to two lines, row heights differ (61 vs 44 px) (`m390-help.png`, `m360-help.png`). Repro: open `#help` at 390x844 and 360x640.

P3. Versus Options strip: wraps to two lines, `aria-expanded` is null and stays null after tap, so no state is exposed to assistive tech; the "More below" chip overlaps the strip (`m390-versus.png`, `m390-versus-opts.png`, `m360-versus-opts.png`). Repro: open `#versus` at either size, tap `Options:`.

P3. 2v2 on phone: camera tight, two-row action bar covers part of the floor, HUD portraits tiny, "NO TAG" labels small (`m390-live2-1.png`..`-6.png`). Repro: Versus, Options, 2v2 tag team, Fight!.

P3. Match-end screen: portrait and name alignment slightly off, plus carried items from earlier rounds (rotate overlay, super banner) (`m390-live1-end.png`).

## What worked

- Stage-correct sky on all four stages (lava orange, teal, violet, olive) at both sizes; the r95 P1 (Fire art on every stage) is fixed.
- HUD readable at 390 and 360: names, health, super bar, timer, win pips; status chips (STUN) and the hits/damage counter are legible.
- Strike buttons respond to taps; ability bar labels and cooldowns legible.
- No console or page errors across all runs.

## Not done

- Phone round-result card: the idle manual run (`m390-result-3`..`-39`) was still mid-round at the last frame (timer 44), so the card was never captured. Re-check by stepping until a KO or timeout, at 390 and 360.
- 360x640 live 1v1 and 2v2 were not run; only the stage, Help and Versus shots exist at 360.
- Landscape and desktop were out of scope.
