---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r93 findings (main 2eca0a0e)

Scores are in [qa-r93-scorecard.md](qa-r93-scorecard.md). No code changed. Screenshots under `.scratch/shots/` (gitignored).

## Fixes verified

- Match-end result word: VICTORY! (yellow), DEFEAT (pale pink) and DRAW are readable on a dark plate at 1280x720 and 390x844 (`d-end-win.png`, `d-end-loss.png`, `d-end-draw.png`, `p390-end-*.png`).
- Loss now shows the player's own hero large with the foe beside it; draw shows both portraits at equal size (r92 P2s).
- First-run card: not present after a super (checked 20, 60 and 150 ticks after, desktop, p390 and m390); it waits (`firstRunWait`, zero height) through ROUND 1 and FIGHT! banners, then shows under the HUD strip at y=130 and fades by itself (`m390-card-2.png`). No overlap with the ROUND banner seen.
- Menu, Play, Versus, Help, Settings, Online text: no Classic, Arcade, ruleset or Capture wording.
- No console or page errors across all runs.

## Ranked findings

P2. Phone portrait entry: on a first fight at 390x844 a full "Rotate your device to landscape" overlay covers the arena and the first-run card; the player must find "Play anyway" before seeing the fight (`m390-f0.png`). Also shown for non-mobile narrow viewports. Repro: Versus, Fight! at 390x844.

P3. Match-end win and loss screens are near-identical in layout (same yellow-ringed own hero, same buttons); only the word and tint differ. A loss has no distinct mood. `d-end-win.png` vs `d-end-loss.png`.

P3. Match-end "Rounds N-N" appears twice (chip and summary sentence). Summary sentence also starts "Sindarosa (fire) against the AI's Pax (earth), AI Normal", which is robotic.

P3. Match-end at 1280x720: the own-hero card touches the top edge (y=8) and the large empty band above/below; on 390 the lower half of the screen is empty backdrop. Foe portrait is a small upscaled sprite and looks pixelated in the draw (`d-end-draw.png`).

P3. Draw shows a yellow selection ring on both portraits, so the ring no longer means "you" (`d-end-draw.png`).

P3. Play (tour pick) at 390: tile label wraps to "Hero / 1 / (lead)" over three lines (`p390-play.png`).

P3. Help at 390: jump chips wrap ragged with inconsistent sizes and offsets (`p390-help.png`; carried from r92).

P3. Super cut-in is still a thin banner versus an MvC slam; portrait arena keeps its empty sky band (both carried).

Test note: a draw is reachable in manual mode only by double KO through sudden death (match was 3-3 at the end); setHp 0 on both fighters never ends the match in one round.

## Triage 2026-11-21 (code-checked)

Fixed: Rounds shown twice (r94), draw ring no longer means you (`src/ui/styles/match-end.css:77`), win/loss told apart by ribbon and tone (`src/ui/screens/arcade-versus.ts:946-956`). Dropped (phone/portrait): rotate overlay, 390 tile label wrap, Help chips at 390, sky band. Design, tracked: super cut-in banner (`ideas/brainstorm/sf-super-cinematics.md`).
Open: none.
