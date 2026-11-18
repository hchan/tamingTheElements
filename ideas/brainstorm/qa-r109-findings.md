---
status: idea
added: 2026-11-18
---

# QA round 109 findings

Build main a25cc33f. Headless Chromium, 1280x720, 390x844 and 844x390. Ordered by value. Shots in `.scratch/shots109/`.

## 1. Call-outs collide with the Weather chip (medium)

"PARRY" sits at the same spot as the "WEATHER n%" chip top centre and is half hidden behind it (`11-fire-fight.png`, `11-air-fight.png`: reads "PA..." or "...ARRY"). Parry is a key MvC-style feedback word. Move the chip up or off-centre, or lift call-outs above it.

## 2. Long stuns remove agency (medium)

In every 1v1 and 2v2 run the player got a STUN chip soon after the first exchange; while stunned the Tag box reads "STUN", a pressed Tag is refused ("Can't swap: stunned") and a ready Super (3 pips) cannot fire (`22-2v2-tag-150.png`, `24-super-400.png`). In SF a stunned fighter can mash out; a visible struggle (mash to shorten) or a shorter stun, plus a stun timer on the chip, would keep it fair and readable.

## 3. Run has no home outside Help and the Controls row (medium)

Help Controls now lists Run Away / Run Towards for P1 (backquote or Tab) and P2 (slash). Gaps: the "How to fight" numbered list and its action-bar key grid have no Run step; the tour stage card CONTROLS block (Move, Strike, Special, Snag, Dash, Guard, Super, Tag) has no Run; the Gamepad and Touch tables have no Run row. Add a line to each, or say it is keyboard only.

## 4. Phone Key Bindings overflows (low-medium)

At 390 wide the Key Bindings page is wider than the viewport (464 px) and the Alternate key column is clipped to "A / k" (`04-keybind-phone.png`). Stack key and alternate per row, or let the table scroll with a visible cue.

## 5. Phone portrait arena is a thin band (low-medium)

After Play anyway the arena shows heroes about 40 px tall in a band under a large empty sky, with HUD names and Super percent at about 6 px (`36-portrait-play2.png`). Strike buttons are good. Consider a taller crop around the fighters, bigger HUD text, or a stronger push toward landscape.

## 6. Tour stage label overlaps the bar in phone landscape (low)

"Stage 1 of 9 / 3 continues left" at bottom left overlaps the first action slot (Blast) at 844x390 (`34-tour3-landscape.png`). Move it to the top left or hide it after a few seconds.

## 7. Clash halos hide heroes (low)

Fire and Earth clashes stack the foe's guard ring, spike ring, damage numbers and a big vortex over both heroes so neither silhouette reads (`11-fire-fight.png`, `11-earth-fight.png`). Fade or thin rings on the defender while the attacker's effect plays.

## 8. Menu footer (info)

The menu shows `v0.1.0 (a25cc33f)` under the buttons in this dev build; confirm it is hidden or intended in production.

## Smoke e2e

`pnpm e2e -- --grep @smoke` routed to the PC (job 20261118-195430-short-eb69fd, sha a25cc33) but ended with exit 93: "job lost (process gone, no final status)", no results.json. Not one of 94/95/96; reported, not worked around, not rerun. No smoke pass or fail result for this round.

## Reproduction

`corepack pnpm exec vite --port 7941`, Playwright Chromium with SwiftShader flags. Versus: Team, Arena, race selects by label, Fight!. Super: `__TTE__.arena.setMeter(0, 3000)` then key 9. Phone: `isMobile`, `hasTouch`, tour via Play, Start tour, Fight, Play anyway.
