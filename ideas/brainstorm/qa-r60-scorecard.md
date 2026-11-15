---
status: idea
added: 2026-11-15
---

# QA r60 scorecard (HEAD 30a27dea, dev server port 7967, headless Chromium SwiftShader)

New since r59: the picker Fight bar (PB1) and FIGHT! pins merged. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r59 was 3.7 / 4.2 / 3.6). Screenshots: `~/claudetmp/qa-r60/s/` (about 45 files).

- Fun: 3.7 (=). Same loop. This round I landed real hits (see findings), and a hit reads well: big damage number, radial spark burst and ring. Supers and tag swaps unchanged. No new playable content.
- Graphics: 4.2 (=). Four stage floors, the menu art and the super band stay strong. Fiara is still a rough fire blob with triangle markers.
- Readability: 3.8 (+0.2). The picker now has one scroll region over a separate Fight/Back bar with a "More below" cue on desktop and phone, so Fight! is always reachable. Phone portrait fight, the WEATHER box and FIRST BLOOD card are unchanged.

E2E subset (port 7966, 1 worker; picker-bar, hero-picker-layout, cc-fx, first-run-hint, hud-labels-sf, arcade-tag, arcade-super, tour-card, touch-fight-layout, menu-phone-row, ghost-bar-shot): 82 passed, 1 failed, the known `touch-fight-layout.spec.ts:267` (tag call does not hide the first-run card). ghost-bar-shot passed this run.

Page errors: none in any scripted run.

r59 open items fixed: 1 of 6 plus partial on 1 (see findings).
