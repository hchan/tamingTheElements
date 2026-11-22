---
status: done
triaged: a (fixed, dropped or art-only)
added: 2026-11-15
---

# QA r60 findings (HEAD 30a27dea)

Screenshots under `~/claudetmp/qa-r60/s/`, scripts in `~/claudetmp/qa-r60/scripts/`. Headless Chromium SwiftShader, dev server port 7967; no page errors. Roster24 heroes not reported (hidden).

## r59 findings: fixed or still open

- Hero picker at 667x375, Fight bar covering the lower third: FIXED in structure. The Fight!/Back bar is now its own row under one scroll region with a "More below" cue (`pl-picker.png`, `pp-picker.png`, `picker-fire.png`). At 667x375 the bar plus the option rows still use the whole viewport: no hero grid is visible until you scroll (only Opponent/Team/Arena and the You/Computer cards show). Playable, but a first-time phone-landscape user sees no heroes. Open follow-up: compact the option rows at short heights.
- Phone landscape menu title overlapping Echo art: PARTIAL. The five buttons are now a row and the Echo figure moved up, but the right end of "Elements" still touches Echo's head (`pl-menu.png`).
- Phone portrait black top half: NOT fixed (`pp-hit.png`: arena is a thin strip behind the rotate overlay; "Play anyway" leads to the same layout).
- FIRST BLOOD card covers the arena bottom: NOT fixed on desktop (`fire-1v1-hit.png`) or landscape phone (`pl-hit.png`, covers the upper-left arena).
- Hero scale and CC on-body marker: not re-checked (roster24 hidden; no CC in scripted fights). Treat as open.
- WEATHER 0% box at the arena top centre: NOT fixed (visible in every 1v1 shot).
- Fiara sprite rough with triangle aura markers: NOT fixed (`fire-1v1-close.png`, `pl-super.png`). Sindarosa now reads clean and detailed in the close-up.

## Hit sparks (the r59 test gap, closed)

Landing hits needed `Cmd` 16 (Sindarosa's ranged Fire Blast) with the pair 80 px apart; melee bit 32 and 1/2 did not hit at that range. Result on all four stages (`fire|water|earth|air-1v1-hit.png`): a large white damage number (29, or 58 on a crit), orange radial spark rays, a bullseye flash and an expanding ring, all legible on every floor. The STUN status chip lights in the top bar. Weakness: the hit effect sits on the overlapped fighters so the victim is hard to identify in that frame, and the damage number is large enough to cover the sprite.

## Other notes

- Super band (HELLFIRE LANCE) readable on all stages and on phone landscape, covers the middle of the arena for the freeze; the slide-in cuts the name mid-frame at the right edge (`air-1v1-super.png`), expected mid-animation.
- 2v2: TAG! call with swirl, chevrons and bench cards is clear (`2v2-tag-a.png`). Tour: stage card scannable, opponent portraits low-res on flat purple (`tour-stage.png`), in-fight 3v3 strips legible (`tour-fight2.png`). Help is a long readable page.
- Test hooks: `arena.place`, `arena.step(n, [cmd, 0])`, `characters()` hp and `setMeter` are enough to script real rallies; `cmd` 16 is the ranged primary.

## Coverage

Menu at 1280x720, 667x375, 390x844; Versus picker at 1280x720, 667x375, 390x844; 1v1 on Fire, Water, Earth, Air (intro, close, hit, super, after-super); 2v2 with tag swap; Tour; Help; phone landscape and portrait fights; e2e subset.

## Triage 2026-11-21 (code-checked)

Fixed: picker structure (own Fight bar row and cue), WEATHER box position (`weather-view.ts:43,53`), first-hint card. The hit-number-covers-victim point is generic combat-text sizing (`src/game/hud/combat-text.ts`), tuned in ideas/done/qa-r17-super-band-hides-first-hit-number.md and not re-raised since r62. Dropped by owner decision (2026-11-18, no phone/portrait/touch work): every phone, portrait, 667x375 and 812x375 item, plus the touch-fight-layout e2e specs (deleted).
Art-only, noted: Fiara sprite and aura markers.
