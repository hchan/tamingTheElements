---
status: idea
added: 2026-11-14
---

# QA r20: Curomo Ice Shock visibility not verified

Three attempts to capture Ice Shock (attack command bit 1 via step) showed no projectile or icy halo and no hp change; the shot at step 110 still showed the FIGHT! ghost and the First Blood hint, so the attack may need the foe in range and facing, or the hint swallows input. Not judged. A follow-up should capture it in real time with keyboard presses after dismissing the hint, and consider an e2e shot test for the halo.
