---
status: idea
added: 2026-11-14
---

# QA r41 scorecard (headless Chromium SwiftShader, test build of main fa8757d3, port 7941)

Scores 0-5 vs Street Fighter / MvC (r40 was 3.5 / 3.5 / 4).
- Fun: 3.5 (=). Super and tag swap still the best beats; hits readable but anticipation not visible in stills.
- Graphics: 3.5 (=). Four stages distinct; ghost trail and chip fade look right; Fiara sprite noisier than other heroes.
- Readability: 4 (=). Phone Strike and hint docking fixed (+), but 2v2 phone HUD is now the crowded spot (see qa-r41-phone-followups.md).

Covered with 0 page errors: menu, Help, four stages, 2v2 with tag swap (IN Pax / BENCH Sindarosa then IN Fiara), super (Curomo), Tour pick and card, phone 667x375 and 844x390 (menu, picker, 1v1, 2v2, Help, Tour).
e2e (E2E_PORT=7942): touch-fight-layout, tour-card, first-run-hint, ghost-bar-shot, hit-juice-shot = 35 passed (3.9 min).
Screenshots: ~/claudetmp/qa-r41/s/*.png.
