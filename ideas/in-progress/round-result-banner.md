---
status: in-progress
added: 2026-11-13
---

# Round result banner (YOU WIN / YOU LOSE / DRAW)

Owner request: after a round, a brief verdict with the score, what happened and a sound.

Done (presentation only, no sim change, SIM_VERSION unchanged):
- `src/game/hud/round-result.ts`: pure tally of events (damage dealt/taken, longest combo, hits, snags, traps, supers) and the card text.
- `src/game/hud/round-result-view.ts`: dark slab under the banner, ash serif, tone accent bar; about 2 s from `roundEnded`, inside the round-end pause and the next intro; reduced motion = no slide or fade. Match end uses the same card, held until the results screen.
- Cues `youWin` (rising) and `youLose` (falling plus rumble) in `arcade-cues.ts`, plain stingers (mute, volume and voice pool as before); a draw keeps `roundEnd`.
- Live region: the round announcer appends the summary.
- Tests: unit (tally, card, cues, announcer), e2e `tests/e2e/round-result.spec.ts`.

Left: AI-vs-AI screenshot with non-zero damage numbers; per-element accent; the match card is not yet screenshotted against the results screen hand-off.
