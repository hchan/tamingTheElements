---
status: idea
added: 2026-11-15
---

# QA r66 findings (HEAD 52b3ade7)

Headless Chromium SwiftShader, port 7966, screenshots in `~/claudetmp/qa-r66/s/`. Status of the r65 items first, then new ones.

## r65 items

- **Left-wall pin: still present.** Hard idle probe: player x 390 -> 2 -> 0 within 16 s, AI at x 76-80 beside it until the KO, repeated next round (`passive-Hard-3.png`: Fiara half off the left edge, the "22" hit number clipped).
- **Super punch-in cropping: still present.** `super-a.png`: Curomo at x=300 is half off the left edge under the GLACIER CRASH banner.
- **Tag key with no notice: fixed for stun.** `tag-after-1.png` shows "Can't swap: stunned" bottom-left. The "too healthy" case was not re-checked. The notice is small and low contrast.
- **Life bars the same length whatever the max life: still present.** Tour fight 198/228 vs 478/478 and the 2v2 bars all draw full width (`tour-fight-1.png`, `tag-after-1.png`); Help now says "read the number, not just the bar".
- **Round pips: improved, still small.** The four circles now carry a ROUNDS label but are about 16 px and empty at 1280x720.
- **First blood overlap: not reproduced.** No FIRST BLOOD hint overlapped the action bar in the Tour fights this round (first-run-hint e2e passes).

## New

- **Tour first-run Controls fact is a wall of text.** On the stage card (`tour-map.png`) Controls is a 7-line bold paragraph that nearly fills the card and pushes the stage strip to the bottom edge at 1280x720. Break it into key chips or two short lines. **Fixed (WP T2):** key chips in two rows (three at 667 px wide), card fits the viewport.
- **Tour splash is good** (`tour-splash.png`): "Stage 1 of 9", arena name, You / Opponent with a teammate bench each. Wispera's portrait is a blurry pixel blob next to Sindarosa. **Fixed (WP T2):** smooth scaling on a lit plate, and Wispera's strip alpha lifted; a true fix needs hi-res mist art (see hi-res-mist-portraits). The "Stage 1 of 9 / 3 continues left" chip bottom-left of the fight is readable but tiny.
- **Tour fight tag cards**: two TAG cards per side plus two Tag slots (3 and 4) in the action bar; clear enough, but the on-bar slot order is not obviously the card order.
- **Phone 390x844 Versus picker**: the hero cards are cut by a "More below" fade over the Fight bar, so the pick is below the fold (`phone-p-picker.png`).
- **Phone 812x375 2v2** (`phone-2v2-1.png`): crowded but legible; the Tag 2s cooldown shows on the key; the touch Pause button sits near the HITS readout.
- **Help**: sections are collapsible with a jump bar; Controls open is long but within the e2e height budgets.
- **Hard vs Normal** feel was not re-tested.

## Process

- `node_modules` came from `pnpm install --offline` in the worktree; the scripts import Playwright from the main checkout. After a KO `__TTE__.arena` is undefined while the next round loads, so the passive probe's "Got it" click timed out after about 67 s (script issue, not a game error).
