---
status: idea
added: 2026-11-15
---

# QA r55 scorecard (HEAD 31bc0882, dev server port 7967, headless Chromium SwiftShader)

Nothing new landed on main since r54 (`git log 31bc0882..main` is empty; only the r54 QA docs commit), so this round re-verifies r54 and views the r54 screens not yet looked at. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r54 was 3.5 / 4.2 / 3.6). Screenshots: `~/claudetmp/qa-r55/s/` (89 files). E2E used port 7966.

- Fun: 3.5 (=). Four 1v1 stages with hit and super, 2v2 tag swap (TAG!, "TAG 2.8s", Echo in for Fiara), full 9-stage Tour, phone landscape and portrait all ran with 0 page errors. Same limit as r54: stills cannot show hit-stop, motion or audio, and CC still has no body feedback.
- Graphics: 4.2 (=). Stage floors, super banners (PHOENIX RISE, PHANTOM SQUALL, SIREN GALE), idle auras and the Void stage 9 (purple obelisks, vortex) hold up. Menu matte noise and Wispera's dithered halo unchanged.
- Readability: 3.6 (=). HUD, tag portraits and chips are clear on desktop and phone landscape. Phone portrait is still unusable.

E2E subset (port 7966, 1 worker): idle-aura, status-fx, arcade-tag, first-run-hint, 27 of 27 passed.
