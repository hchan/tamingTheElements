---
status: idea
added: 2026-11-14
---

# QA r36 scorecard (headless Chromium SwiftShader, test build of main 4946965f)

Scores 0-5 vs Street Fighter / MvC (r35 was 3 / 3.5 / 4).

- Fun: 3. Streak counter ("3 HITS / 155 DMG"), big damage numbers and the hit burst read well; plain hits still lack screen shake and recoil weight next to SF.
- Graphics: 3.5. Four stages are distinct (lava, ice-blue water, olive earth, pale air); fighters still sit flat on busy floors. The super cut-in (GLACIER CRASH over a dim) is a good moment.
- Readability: 4. Kit-named action bar, SUPER %, tag portraits and HURT tags help. Phone name truncation and the first-run card over the fight are the open spots.

Verified: menu, Versus select (2v2), 1v1 on all four stages, real-time fights, tag swap, KO swap, super, Help, 667x375 and 844x390. Console clean. e2e touch-fight-layout (19), first-run-hint, arcade-juice: all pass.
Screenshots: ~/claudetmp/qa36/ (menu-1280, select2v2-1280, stage-*-idle, rt-*, t2-*-swap*/ko*, super2-*, phone-*-t*, help-*).

r35 re-check: see qa-r36-r35-recheck.md.
