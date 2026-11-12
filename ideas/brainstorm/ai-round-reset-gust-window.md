---
status: idea
added: 2026-11-12
---
# Scripted Arcade AI: reset the Gust follow-up memory between rounds

Found by the determinism review of WP 39f (no determinism break). `resetRound` clears traps, but the scripted agent keeps its memory across rounds.
At round start the AI's own Gust count drops from n to 0, so `gusts < m[15]` fires and opens a 45-tick press window; `m[14]` can also carry a
leftover window from the previous round (`src/core/agents/scripted-ai/arcade.ts` ~301-307). Result: a spurious Normal/Hard rush at the start of a round after a Gust was live.
Fix: reset `m[14]`/`m[15]` at round start, or only open the Gust window when the foe actually moved. AI change: bump SIM_VERSION, header-only golden change.
Nits: `ARCADE_AI_PRESS_*_TICKS` comment says "game ticks" but compares with `view.tick` (counts through hit-stop); orphaned comment "1000 keeps the value exact." in
`src/core/sim/systems/arcade/hit.ts`; import order in `trap.test.ts`. Do it after the Cyclonius/Rokcore tuning merges (same SIM_VERSION bump).
