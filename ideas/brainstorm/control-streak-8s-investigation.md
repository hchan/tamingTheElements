---
status: idea
added: 2026-11-12
---
# Longest no-control streak is 8.4 s: find what stacks

Per-fighter streaks of root or hit-stun reach 419 ticks (8.4 s; 2908 of 47 070 streaks are over 3.6 s) although the combo stun cap is 3 s
(`COMBO_STUN_CAP_TICKS` 150). Find the stacking: root plus combo plus post-cap recovery, hit-stop counted in the streak, or a real loop.
Log the event sequence of the longest streaks (the harness keeps only the maximum). Possible fix: one control-window cap across all sources, or
control immunity after any capped control.

Source: [snag-trap-and-team-modes-findings.md](snag-trap-and-team-modes-findings.md).

## Findings (2026-11-16, SIM_VERSION 85; analysis only, no src/core change)

Harness: `tools/sim/control-streaks.mts` (`tsx tools/sim/control-streaks.mts 24 180 8`; 1584 Arcade 1v1 matches, Normal AI, same pairings and seeds as
`snag-trap-teams.mts snag`). It logs, per fighter, every streak of `rootUntil` or `stunUntil` beyond the game tick, with the `hitConfirmed`, `snag`,
`recovered` events and the remaining root/stun at each, in wall ticks (hit-stop included) and game ticks (frozen clock excluded).

- The 8.4 s (419 tick) figure was measured at SIM_VERSION 36. At version 85 the same harness gives a longest streak of **329 wall ticks (6.6 s)** and
  593 streaks over 3.6 s (`snag-trap-teams.mts snag 24`: 26 871 streaks of at least 1.2 s, p50 98 ticks in that file's units, p99 193).
  Of the 602 streaks of at least 180 wall ticks: 507 (84%) contain a Snag root, 95 do not.
- It is not a loop and not a bug in the stun cap. Three things add up:
  1. **Hit-stop is counted.** The game clock freezes on every hit (`hitStop`), but the harness (and any player) sees control the whole time. Mean
     wall length 199 ticks vs mean game length 151 ticks: hit-stop adds about 24%. The 329 tick record is only 217 game ticks (4.3 s).
  2. **Root is outside the combo budget.** `COMBO_STUN_CAP_TICKS` (150) caps only `comboStunTotal` (stun.ts `applyStun`); a Snag root (60 ticks, `snag.ts`)
     neither counts into it nor is blocked by it. Typical record sequence: a stun chain of 100 to 150 ticks (frequently ending on the `recovered` cap
     event, reason 1 or 2) -> Snag lands during the chain or in the 20 tick `RECOVERY_INVULN_TICKS` window (invulnerability does not stop a root) ->
     root 60 ticks -> on the tick the root ends (`snag reason=3`) the owner hits again, a fresh combo starts (`until <= g` zeroes `comboStunTotal` and
     `juggle`), and a second chain of up to 150 ticks follows. The victim, which cannot walk or dash while rooted, always sits where the follow-up lands.
     Example (curomo vs cyclonius seed 12): 43-tick stun hit, 23, snag (root 59 + stun 15), root runs to g2159, next hit at root 0 gives stun 47, then a
     73-tick super stun and another 48: 217 game ticks, 329 wall ticks.
  3. **The 3 s cap applies per combo, and each combo ends in a free restart.** After a cap, `recover()` gives 20 ticks of invulnerability, then a new
     combo may start with a fresh 150 tick budget and juggle count. Stun-only streaks (no Snag) reach 171 game ticks (239 wall); the 150 cap plus the
     post-hit or recovery gap explains the overshoot.
- Root-immunity (`SNAG_IMMUNE_TICKS` 75) protects against a second root only, not against the next stun combo.

### Proposed fix (not implemented; needs a SIM_VERSION bump, golden and balance re-record with a stated reason)

One control window across all sources, per fighter:

- New `ArcadeE` field `ctlStart`: the game tick the current control run began (set when a stun or root starts on a fighter that is free, cleared by
  `expireStuns` / root end when both are over for more than a tick).
- In `applyStun` and `snag.ts`: if `g - ctlStart >= CONTROL_WINDOW_CAP_TICKS` (propose 180 game ticks = 3.6 s, just above the 3 s combo cap so ordinary
  combos are unaffected), do not stun or root; call `recover()` instead (damage still lands, 20 ticks of invulnerability, `ctlStart` reset). A
  Snag landing in that state is a `snag` event with a new reason (wasted, like the guard case).
- Cheaper alternative: let a Snag root count into `comboStunTotal` (add its ticks to the budget) and refuse to root a fighter whose `comboStunTotal` is
  above 60, which removes the chain-then-root pattern (84% of long streaks) without a new state field.
- Expected effect: longest streak about 4 s of game time (about 5 s with hit-stop) instead of 6.6 s; stun-only streaks (16% of the long ones) unchanged
  unless the first option is chosen. Re-run `tools/sim/snag-trap-teams.mts snag 24` and `balance:compare` after; Snag races (curomo, echo, treenoc,
  wispera) are the ones whose win rate will move. Pair it with a Known-Bugs-free note: this is a balance rule, not legacy parity.
- Open question for the owner: is a 6.6 s lock acceptable as a payoff for landing a Snag plus a full combo? If yes, the only change worth making is
  showing the remaining control window on the HUD (no sim change).
