---
status: done
added: 2026-11-15
---

# AI cornering an idle player

An idle player pressed against a wall gets cornered by the AI with no way out. Done in WALL-2 (SIM_VERSION 84): Arcade corner pushback (the knockback a wall swallows becomes a lunge away for the attacker, within 240 px) and Hard AI never standing inside its foe (step apart unless the foe is stunned or rooted).

Measured with `pnpm ai:wallpin` (48 matches, fiara/sindarosa vs rokcore/fiara/curomo/pax, Hard AI): an idle player is still cornered (at the wall 51% of the time after first contact: SF-correct, it never leaves), the mean centre gap after the wall is 172 px, box overlap is 34% (12.6% with the foe free to act; the rest is Hard attacking a stunned foe, by design). Normal-AI defender vs Hard: at wall 13%, max stuck 2.1 s, swallowed 342 px.
