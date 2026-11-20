---
status: in-progress
added: 2026-11-15
---

# FIGHT! banner: cut it short on first contact

The FIGHT! banner now shows for 30 ticks (0.6 s, `FIGHT_BANNER_TICKS`). Idea: end it early when the first hit lands so it never sits over the action. Sim-neutral (HUD only).

## Progress

2026-11-20: verified not done (only the super cut-in drops FIGHT!). `RoundAnnouncer.consume` now shortens the banner to `FIGHT_CUT_TICKS` (6) after the first `hitConfirmed` while FIGHT! is up. Test in `round-announcer.test.ts`.
