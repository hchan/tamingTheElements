---
status: idea
added: 2026-11-14
---

# QA r20 scorecard (r20)

Headless Chromium on a test build of the worktree (SIM_VERSION 55), seed 7, 1280x720 and phone 844x390 touch. Shots in ~/claudetmp/qa-r20/. Full sweep on fire, water, earth and air stages (intro, fight, stage swap, warn, strike, super, KO, after) for both viewports. No console errors.

Scores vs Street Fighter / MvC (0-5): fun 3.5, graphics 3.5, readability 3.5 (unchanged from r19). Atmosphere is good (cracked lava, arena crowd) and creature sprites are painterly, but hazards and text fx still read flat.

Findings: qa-r20-ai-hazard-dodge-not-observed, qa-r20-water-tide-telegraph-faint, qa-r20-air-gale-band-low-contrast, qa-r20-fire-strike-strip-edge-only, qa-r20-ko-text-ghosted-behind-number, qa-r20-phone-letterbox-and-tiny-hud, qa-r20-ice-shock-visibility-unverified.

Not covered: AI dodge over many seeds, Ice Shock frames, Firefox and WebKit, 2v2.
