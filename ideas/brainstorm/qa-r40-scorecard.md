---
status: idea
added: 2026-11-14
---

# QA r40 scorecard (headless Chromium SwiftShader, test build of main 5d0ac987, port 7933)

Scores 0-5 vs Street Fighter / MvC (r39 was 3.5 / 3.5 / 4).

- Fun: 3.5 (=). Hits land with a big bold damage number (38 on a Pax special), white-orange burst, stun tag on the foe. The foe visibly reacts; the attacker barely moves in still frames, and hit-stop cannot be judged from stills. Super (Curomo glacier rings plus ice burst) still the best moment.
- Graphics: 3.5 (=). Four stages distinct (lava, rain-blue, sand, gale); terrain chips (FIRE x2, WATER +HP, AIR x2) now read clearly on all four including the pale gale floor. Earth stage spawn zones are clear: Rokcore starts with a single crystal prop beside it, not on top. Tour card still the best menu screen.
- Readability: 4 (=). Chips, life numbers, "Life 598/598" legible on desktop. New phone issues in qa-r40-phone-and-tour.md (Strike 1 clipped at the right edge at 667x375, first-run hint covers mid-arena, Tour card label collisions).

Verified, 0 page errors across: menu, Help, four stages, 2v2 with TAG swap (IN Pax / BENCH Sindarosa, TAG 2.3s, then IN Fiara / TAG READY), super, Tour card, phone 667x375 and 844x390 (menu, picker, 1v1, 2v2, Help, Tour card).
Screenshots: ~/claudetmp/qa-r40/s/*.png (menu, stage-{fire,water,earth,air}-hit, 2v2-start, tag-*, super-*, hit-*, tour-card1, ph-fight1, ph-fight2, p2-fight, p2-tourcard, ph-tour-card).
e2e (E2E_PORT=7934): touch-fight-layout, versus-layout, tour, tour-card, arcade-tag, first-run-hint, hit-juice-shot = 49 passed (4.0 min), run 1.
