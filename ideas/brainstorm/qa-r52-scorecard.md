---
status: idea
added: 2026-11-15
---

# QA r52 scorecard (HEAD 2719227d, dev server port 7953, headless Chromium SwiftShader)

Scores 0-5 versus Street Fighter / Marvel vs Capcom (r51 was 3.5 / 4.0 / 3.5). Screenshots: `~/claudetmp/qa-r52/s/` (76 files). E2E used port 7952.

- Fun: 3.5 (=). Every flow ran with 0 page errors: 1v1 on Fire, Water, Earth and Air with a hit and a super each, a 2v2 tag swap (TAG! call, bench cards, "TAG 2.8s"), Tour stages 1 to 9 (stage 9 Eternal Void reached and fought), a phone (667x375) match to "Victory! Rounds 2-0". The FIGHT! banner no longer sits on the first hit, which removes the biggest feel nit from r47 to r51. Still no hit-stop judgement possible from stills.
- Graphics: 4.0 (=, small polish gains). Super banners are now fully opaque at 14 ticks (PHOENIX RISE, SIREN GALE), Help page is clean, Void stage 9 has its own swirl floor. Hit marks are ripple, shard or slash by attacker element in code and e2e; in stills they read as a cyan ring with green rays for the water attackers I used. Idle auras are better (soft white pool under Echo) but still faint on Fiara and Morblass in the first frames.
- Readability: 3.5 (=). HUD, CC chips (SNAGGED 2s, STUN, SAFE), ROOTED pop clear of the damage number. Versus 2v2 picker still hides the partner slot behind the Fight bar, and the first-run card still sits over the lower arena.

## Coverage

Menu (1280x720, 2560x1440, 375x667, 667x375, reduced motion, 844x390, 390x844), Help, Settings, Online, Play picker, Versus 1v1 and 2v2 picker, four stages, 2v2 tag, Tour stages 1 to 9 cards and fights, phone full match. Playwright (1 worker, Chromium): app-flow, hit-mark-element, idle-aura, first-run-hint, floor-backgrounds, hit-feel-capture, 33 of 33 passed in 2.7 min. Not covered: two-browser Online, Firefox and WebKit, real-time hit-stop (stills only).

## Versus r51

Fixed: Help orb, super banner hold, FIGHT! banner overlap, ROOTED over damage number (r51 #1, #6, #11, #12). Improved: hit marks (#2), idle auras (#3). Open: #4 (2v2 picker), #5 (first-run card), #7, #9, #10. See qa-r52-findings.md.
