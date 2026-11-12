---
status: idea
added: 2026-11-12
---
# AI combo: Snag into its own trap

Only 13 of 9262 Snag roots (0.14%) were followed by a trap hit during the root: the AI never plans it. Idea: when a trap is armed near the foe,
throw Snag; or lay a trap under a rooted foe (the root lasts 1.2 s). Measure with `tools/sim/snag-trap-teams.mts snag 24`; aim for a few percent
and check it does not make the Snag races (curomo, echo, treenoc, wispera) too strong (they win 52.4% of matches where they snag).
An AI change needs a SIM_VERSION bump and Arcade baseline re-record with a stated reason.

Source: [snag-trap-and-team-modes-findings.md](snag-trap-and-team-modes-findings.md).
