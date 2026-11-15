---
status: idea
added: 2026-11-15
---

# QA r64 scorecard (HEAD e571c860, SIM_VERSION 78, dev server port 7974, headless Chromium SwiftShader)

Coverage: Versus 2v2 live match (about 80 s, 14 frames), 1v1 Fire (Fiara v Rokcore) and Earth (Rokcore v Curomo), a Tour fight, menu at 1280x720 and 812x375, Help desktop. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r63 was 3.7 / 4.2 / 3.8). Screenshots in `~/claudetmp/qa-r64/s/` (about 35 files), script `~/claudetmp/qa-r64/scripts/b.mjs`. No page errors. Port 7964 was already held by another agent's preview server, so this round used 7974 (killed by pid only).

- Fun: 3.8 (+0.1). The bigger 2v2 life pools (Sindarosa 297, Pax 591, Fiara 540) let a round last about 55-60 s against the AI with a 100 s timer, so a hit trade has room to develop; the 214 hit-number pop and tag-out cross-out card read as a real beat. Still no single-key-combo depth.
- Graphics: 4.2 (=). Fire and Earth floors are rich; Earth is the brightest and readable, the Tour air floor reads cold and clean. Wispera remains a grainy sprite.
- Readability: 3.8 (=). Life numbers, HURT / LOW tags and the TAG roster cards read well; the life bar is the same length whatever the max life, so the new larger values are invisible in the bars.

Per area: 2v2 round pacing 4.0, life bars 3.0 (length does not scale, numbers do), Fire 1v1 4.2, Earth 1v1 4.3, Tour fight 4.0, menu 1280 4.2, menu 812 4.0, Help 3.5 (unchanged).
