---
status: idea
added: 2026-11-27
---

# Wall hold is switched off by the staleness gate (durrok)

MEASUREMENT (v121 wall-pin probe, level 4, 16 seeds, idle P1): the Hard AI melee wall hold is gated off by `view.tick - hpChangeAt >= ARCADE_AI_STALE_TICKS` (400 ticks) in `arcade.ts` (about line 453). Near-wall ticks 1070, of which 232 stale; durrok's overlap ticks 196, of which 170 (87%) stale. Durrok never damages an idle pinned P1, so hp never changes and the hold turns off after 8 s; while hp changes the hold works (26 overlap ticks of 838).

Fix options: fix the staleness gate, or exempt the wall hold from it. Needs the sim flow and a SIM_VERSION 123 or later (121 is the allowance, 122 is reserved). Probably a probe artefact of an idle P1, so also check against a live opponent first.
