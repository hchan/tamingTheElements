---
status: idea
added: 2026-11-15
---

# QA r53 scorecard (HEAD eb78e4cc, dev server port 7953, headless Chromium SwiftShader)

Scores 0-5 versus Street Fighter / Marvel vs Capcom (r52 was 3.5 / 4.0 / 3.5). Screenshots: `~/claudetmp/qa-r53/s/`. E2E used port 7952.

- Fun: 3.5 (=). All flows ran with 0 page errors: four 1v1 stages with hit and super, 2v2 tag swap (TAG!, "TAG 2.8s"), Tour stages 1 to 9, phone (667x375) match to the results screen. The `?ff=cc` crowd control changes nothing visible yet (findings #1), so no new fun to score. Hit-stop still unjudgeable from stills.
- Graphics: 4.2 (+0.2). Stage 9 Void now has a horizon band (obelisks, watchers, purple braziers) and a spiral boss with dashed turning rings; the menu has an entrance (dim buttons and black cut-out silhouettes resolve to the full menu in under 400 ms).
- Readability: 3.5 (=). HUD, SAFE, STUN, SNAGGED chips, TAG! and ROOTED lanes all clear. The 2v2 picker now shows a "More heroes below" pill, but the partner slot is still behind the Fight bar. The faded Fire Blast is easy to lose on the dark fire floor.

## Coverage

Menu (1280x720 plus 5 entrance frames, 2560x1440, 375x667, 667x375, reduced motion, 844x390, 390x844), Help, Settings, Online, Play picker, Versus 1v1 and 2v2 picker, four stages, 2v2 tag, Tour stages 1 to 9 (stage 9 fought), phone match, Fire Blast over six ages, `?ff=arcade,cc` with Cyclonius Tornado, Pax Ground Shock, Ishimi hits and Fiara Ember. Playwright (1 worker, Chromium): app-flow, menu-showcase, floor-backgrounds, hit-mark-element, arcade-tag: 30 of 30 passed in 1.4 min. Not covered: two-browser Online, Firefox and WebKit, real-time motion.

## Versus r52

Fixed: #1 stage 9 horizon and rings, #3 menu entrance, Fire Blast fade. Improved: #4 (hint pill only). Open: #2 (Void cast bar tint), #4, #5 (first-run card, seen again over the arena in `st-Earth-hit.png`), #7, #9, #10. New: CC has no view. See qa-r53-findings.md.
