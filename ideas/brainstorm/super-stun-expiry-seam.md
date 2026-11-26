---
status: idea
added: 2026-11-26
---

# Super stun: the expiry seam and the plain-combo cut-short (slated for SIM_VERSION 119)

SIM_VERSION 118 caps overlapping super chains at `SUPER_COMBO_STUN_CAP_TICKS` 80 game ticks. Two seams remain; both are known limitations pinned by tests, with no behaviour change in v118.

1. **Expiry-tick restart.** `expireStuns` zeroes `comboStunTotal` when a stun ends, and `applyStun` starts a fresh combo when `stunUntil <= now`. A super landing on the exact expiry tick therefore starts a second combo with a new 80 budget, so an unbroken stun run can exceed 81 game ticks (measured longest: 1v1 79, 2v2 147).
2. **Plain combo into a rooting super.** A normal combo's stun counts toward the 80. Example: plain hits to 56, then a super opener (+8) and its root (+20) make 84 > 80, so the super's root triggers `recovered` (stunCap) and 20 invulnerable ticks instead of landing. Pinned in `stun.test.ts` ("a normal combo near COMBO_STUN_CAP_TICKS counts toward the super cap").

Candidate fixes (needs the sim slot, a re-record and a stated reason):

- Carry `comboStunTotal` across the stun-immune window, so a restart inside it continues the same combo.
- Shorten the last super stun to the remaining budget instead of recovering.
- Count the cap from the super start (a fresh super budget) instead of from the combo start.

Measure with `tools/sim/stun-lock.ts --roster released` (longest game-tick run, p90) and the 35-65% band test before and after.
