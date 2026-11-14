---
status: done
added: 2026-11-14
---

# QA r20: Curomo Ice Shock visibility not verified

Three attempts to capture Ice Shock (attack command bit 1 via step) showed no projectile or icy halo and no hp change; the shot at step 110 still showed the FIGHT! ghost and the First Blood hint, so the attack may need the foe in range and facing, or the hint swallows input. Not judged. A follow-up should capture it in real time with keyboard presses after dismissing the hint, and consider an e2e shot test for the halo.

## Findings (2026-11-14)

Probe with real key input (Curomo vs Rokcore, hint dismissed, foe 100 px ahead, Digit1 held, `stepLive`): Ice Shock works. The foe lost about 19 HP, a "19" damage number appears and the ice spear sprite with shatter debris is clearly visible over the foe. The earlier misses were the sim-step attack bit, the First Blood card and range, not a rendering fault. Pinned by `tests/e2e/ice-shock-fx.spec.ts` (hit lands; shot to `$SHOT_DIR/ice-shock.png`).
