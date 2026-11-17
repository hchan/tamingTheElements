---
status: done
added: 2026-11-15
---

# Confirm the Water 77 ghost is gone

An earlier QA pass saw a stray "77" near the Water hero. Re-check with real-game screenshots after WP-HC1 and close this if it no longer shows.

Done 2026-11-16.

## Findings

No stray "77" (or any stray number) near the Water hero. Checked headless (Playwright, Chromium SwiftShader, test build, 1280x720) with Curomo (Water) in the arena (`/?hero=curomo&foe=<foe>&manual=1&seed=<seed>&ff=arcade`), 8 shots per seed (spawn, round start, three mid-fight steps, close-range hits, super cast, after super), 48 shots in all:

| Seed | Foe |
| --- | --- |
| 3 | Rokcore |
| 14 | Pax |
| 25 | Lavax |
| 36 | Fiara |
| 47 | Treenoc |
| 58 | Echo |

Viewed in full: s3 rokcore spawn / mid1 / hits / super, s14 pax hits, s25 lavax after-super, s36 fiara hits, s47 treenoc after-super, s58 echo mid2. The only numbers near the Water hero were the HUD (Life 542/542, Super %, round timer 90 down to 85) and the "WATER +HP" puddle labels; none read 77.

Limits: manual stepping, so each fight covered only a few seconds of round time and the Water hero took no damage (so no damage numbers on it). The round timer would read 77 later in the round, which is a likely innocent source of the original sighting. Scratch spec and shots were in `.scratch/` (gitignored).
