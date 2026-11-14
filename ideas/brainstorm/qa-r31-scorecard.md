---
status: idea
added: 2026-11-14
---

# QA r31 scorecard (headless Chromium, SwiftShader, test build of main f125f0ce)

Scores 0-5 against Street Fighter / MvC.

- Fun: 3. Unchanged: tag, Snag, supers, hazards are varied; Rokcore hit feedback is weak and Sindarosa 272 vs Pax 727 life is lopsided.
- Graphics: 3.5. Stage art (fire, water, earth, air), menu and Versus picker look good; tag-in sprite missing, Rokcore sprites merge on hit.
- Readability: 3.5 (up from 3). Life bar text matches the bars, one weather chip, SUPER 3 MAX label legible on phone. Still: hint card over names on phone, Help Jump-to hidden on phone, chevron noise.

Verified visually:
- (1) Tour on 844x390: strip fades before FIGHT! and is gone by ROOTED, so it clears them; at round start it hides the name banners.
- (2) Rokcore hit: no mark or number (idea filed).
- (3) Help Jump-to on phone: hidden (0x0). Desktop fine.
- (4) SUPER full: label and pips good; no glow visible.
- (5) Settings: phone and desktop clean, no overflow, large rows.
- (6) Four stage hazards, tag swap, 2v2, menu (5 entries, no mode words), Versus picker: no console errors.

Screenshots: /Users/henry.chan/claudetmp/qa31/
