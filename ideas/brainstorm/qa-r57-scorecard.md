---
status: idea
added: 2026-11-15
---

# QA r57 scorecard (HEAD fe84ba90, dev server port 7941, headless Chromium SwiftShader)

New since r56: CC overlay view (CA4: mired ring, stun/gust bands, break-out crack, lazy `cc-view` chunk), tester panel polish (God mode state line, Snag wording). Scores 0-5 versus Street Fighter / Marvel vs Capcom (r56 was 3.6 / 4.2 / 3.6). Screenshots: `~/claudetmp/qa-r57/s/` (about 90 files; menu, picker, 1v1 in four arenas, 2v2 tag, CC, phone 667x375 and 390x844, roster24 heroes).

- Fun: 3.6 (=). Content is unchanged apart from CC feel: the victim now gets a mired ring under the feet and a stun chip, but a still cannot show hit-stop or audio, and the 1v1 loop is as in r56. Four roster24 heroes still add variety.
- Graphics: 4.2 (=). Arenas, super banners (SIREN GALE, ROCKFALL) and 2v2 TAG! call are strong. The CC body cue is very faint (a thin ring and a few motes), so it adds little to the image.
- Readability: 3.7 (+0.1). Status chips are better: MIRED, STUN and DAZED now carry an icon and a coloured border and stack cleanly in 2v2 (`team2-tag-b.png`, `ov-mired-1.png`). Phone portrait is unchanged (black top half, tiny arena), which caps the score.

E2E subset (port 7940, 1 worker): cc-fx, first-run-hint, idle-motif, roster24-b1-shot, status-fx, tester-mode, 29 of 29 passed. The known touch-fight-layout.spec.ts:267 failure was not run.

Page errors: none in any scripted run.
