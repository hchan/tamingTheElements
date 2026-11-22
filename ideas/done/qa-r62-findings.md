---
status: done
triaged: a (fixed, dropped or art-only)
added: 2026-11-15
---

# QA r62 findings (HEAD 9b3a7d2c)

Headless Chromium SwiftShader, dev server port 7962, screenshots under `~/claudetmp/qa-r62/s/`. Same script as r61 (Sindarosa vs Fiara, Cmd 16 for hits), with Fire and Earth 1v1 only plus 2v2 on Water and three phone sizes. No page errors.

## r61 findings: fixed or still open

- Picker at 667x375 shows no hero grid until scrolled: FIXED (`pl-picker.png`). Options are packed into two rows, You/Computer cards sit side by side, a hero row and the Sindarosa info card are visible, Fight/Back bar below, "More below" cue. Same at 812x375 (`pw-picker.png`).
- Phone landscape menu Echo on the title: PARTLY (`pl-menu.png`, `pw-menu.png`). Echo sits at top right; at 812 it clears "Elements", at 667 the head still touches the end of the title.
- Phone portrait black top half behind the rotate overlay: NOT fixed (`pp-hit.png`; arena squashed into a dim strip, top 40% black). A "Play anyway" button is clear.
- FIRST BLOOD card over the arena bottom (1v1 `fire-1v1-hit.png`, 2v2 `2v2-tag-a.png`): NOT fixed. On phone landscape the hint card is upper-left and covers Sindarosa's head (`pw-hit.png`).
- WEATHER 0% box at the arena top centre: NOT fixed; still collides with the TAG! call (`2v2-tag-a.png`).
- Fiara sprite rough with triangle aura markers: NOT fixed (`2v2-fight.png`, `pw-hit.png`).
- Hit effect hides the victim and the damage number covers the sprite: NOT fixed (`fire-1v1-hit.png`: "58" is larger than the sprite).

## New observations

- Phone portrait picker (390x844, `pp-picker.png`) was not part of PB2 and is a long scroll: Opponent, Team, AI level, Arena each stack as separate labelled rows before the You/Computer cards reach the Fight bar; hero grid is two screens down. Fine for portrait but a compact grouping like landscape would help.
- Landscape picker is dense (every option chip is on screen at once) but legible; touch targets stay large.
- 2v2 TAG! call overlaps the benched hero card at the top and the WEATHER box (`2v2-tag-a.png`), as in r61.
- Earth super: the HELLFIRE band is cut off at the right while sliding in (expected), readable on the olive floor (`earth-1v1-super.png`).
- Retune effect: 2v2 lead life 228 (Sindarosa) vs 286 in 1v1; the status chips (ADREN 3s, SAFE, EMBER 5s) are still tiny.

## New regression (likely PB2)

- `tests/e2e/touch-fight-layout.spec.ts:166` ("2v2 picker (QA r41): Your partner label is whole and Swap up / Clear clear the Fight! bar", small phone landscape) fails at line 176, `expect(m.clipped).toBe(false)` received true. Passed in r61. The compact landscape layout appears to clip the partner label in 2v2. Not seen in my screenshots (I only shot the 1v1 picker); worth a 2v2 picker shot at 667x375. Error context: `test-results/touch-fight-layout-small-p-e5179-p-Clear-clear-the-Fight-bar-chromium/`.
- Also still failing: the known `touch-fight-layout.spec.ts:267` (tag call does not hide the first-run card). Full run: 512 passed, 2 failed, 47.9 minutes.

## Process notes

- Worktree had no node_modules; symlinked the main checkout's (untracked, not committed).
- Full `corepack pnpm e2e` is 514 tests, about 48 minutes at 1 worker on this shared machine.

## Coverage

Menu at 1280x720, 667x375, 812x375, 390x844; Versus picker at 667x375, 812x375, 390x844; 1v1 on Fire and Earth (intro, close, hit, super, after-super); 2v2 on Water with tag swap; phone fights portrait and landscape. Not covered this round: Tour, Help, Water and Air 1v1.

## Triage 2026-11-21 (code-checked)

Fixed: picker density (r62 itself); WEATHER box vs TAG! call (r119 N3 shows the tag call clean). The 2v2 picker e2e regression (`touch-fight-layout.spec.ts:166`) was a phone spec and was deleted with the phone work. Dropped by owner decision (2026-11-18, no phone/portrait/touch work): every phone, portrait, 667x375 and 812x375 item, plus the touch-fight-layout e2e specs (deleted).
Art-only, noted: Fiara sprite, hit-effect clarity.
