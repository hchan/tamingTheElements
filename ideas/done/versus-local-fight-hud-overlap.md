---
status: done
added: 2026-11-12
---

# Local Versus: fight HUD problems found by a headless playthrough

Found 2026-11-12 driving `#arcade` (two players, 3v3) headless at 1280x720; screenshots were in `~/claudetmp/pvp/`.

- The "Player 1 / Player 2 keys" help text at the bottom-left overlaps the action bar slots (Trap, Cleanse) and is clipped.
- Only Player 1 gets an action bar and touch/number buttons; Player 2 has none, so P2 cannot see their own cooldowns, Tag or Super readiness (the HUD top shows only the Tag/Bench chips).
- The key hint line is tiny and runs under the HUD; fade it after a few seconds or move it into the pause menu.
- Hero select works: both players can pick the same hero (Echo, Cyclonius); decide if that is intended (mirror matches are fine in SF/MvC).
- Unchecked: a few seconds of fight with 800 ms of movement and 6 attacks left both at 100%, so the heroes started far apart; consider a closer start or auto-approach for a quicker first exchange.

## Outcome (2026-11-13)

- Key hint now sits above the action bar, fades after 8 s, and is hidden in windows up to 1100 px wide (touch buttons wrap there); e2e `arcade-local.spec.ts` checks no overlap with either bar and the fade.
- Player 2 has a small mirrored readout (bottom-right) via `ActionBarView` mirror mode; hook `actionBar2Screen`.
- Same hero for both players: intended (mirror matches are fine, as in SF/MvC); no change.
- Not done: closer start / auto-approach for a quicker first exchange (sim change; see versus-local-closer-start.md), and the P2 readout is covered by wrapped touch buttons in windows under 1100 px wide.
