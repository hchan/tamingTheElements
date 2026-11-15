---
status: idea
added: 2026-11-15
---

# Crowd control: AI reads CC, then retune before default-on

CB0-CB5 are merged with `withCrowdControl` off by default (`?ff=cc` turns it on in dev). Tournament (AI level 3, 16 seeds, flag on): Morblass 67.0 (limit 65), Pax 40.3, Echo 41.5, Curomo 41.5, Lavax 58.0, Cyclonius 55.1.

- Add AI observation fields (`selfCc`, `foeCc`) so the scripted AI quick-rises, mashes out of daze, cleanses silence and stops spamming into DR immunity.
- Re-run the tournament after the AI change, then retune durations (`DAZE_TICKS`, DR) until all races sit in band.
- Add a `ccResisted` (DR) case to the `arcade-cc` golden.
- Only then flip the default: SIM_VERSION bump, re-record goldens and baselines with the reason.
- View lane CA3-CA7 still to do (poses, overlay, strips).
