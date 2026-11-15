---
status: idea
added: 2026-11-15
---

# QA r49 scorecard (HEAD 352bc205, dev server, headless Chromium SwiftShader)

Scores 0-5 versus Street Fighter / Marvel vs Capcom (r48 was 3.5 / 3.5 / 3.5). Goal: mystic, luminous, painterly, not cartoony.
Screenshots: `~/claudetmp/qa-r49/s/`.

- Fun: 3.5 (=). 1v1 on all four stages, mixed 2v2 tag (TAG! call, bench cards, 2.8 s tag cooldown), Tour stages 1 to 7 and a phone match to Victory 2-0 all run with 0 page errors. Supers read as an event (banner, dim, tinted star). Still lacking: elemental contact marks and hit-stop feel (`st-Earth-super.png`, `team2-tag-b.png`), and the FIGHT! banner still glues onto the first hit (`st-Fire-hit.png`).
- Graphics: 4.0 (+0.5). Stage floors are now distinct per element (lava cracks, cyan ice, olive-ochre earth with boulder shadows, violet air with swirls: `st-Fire-start.png`, `st-Water-super.png`, `st-Earth-super.png`, `st-Air-super.png`), and supers use an element-tinted star and banner band. Held back by Wispera and Echo sprite halos (hard dither edges) and rough hero showcase cut-outs on the menu (`menu-desk-late.png`).
- Readability: 3.5 (=). Menu buttons are clear on 1280x720, 844x390, 390x844 and 667x375; hit numbers appear on every hit shot; Echo is now readable on the Air floor. Picker bars still hide the partner slot and the last row (`team2-picker-set.png`, `page-play.png`), and the first-run hint covers the arena.

## Coverage

Menu with showcase (1280x720, 844x390 and 390x844 touch, 667x375), Help (desktop and both phone sizes), Settings, Play (Tour team picker), Online page, 1v1 picker, 1v1 with hit and super on Fire, Water, Earth and Air, 2v2 picker and tag, Tour stages 1 to 7, phone 667x375 full match to Victory.

Not covered: two-browser Online handshake, 24-hero roster (still 12), Tour stage 8 and 9, real timing of the menu entrance animation.

## e2e

`E2E_PORT=7947 playwright test` (workers 1) on menu-showcase, app-flow, arcade-tag, arcade-super, hero-picker-layout, layout-r15, first-run-hint, help-controls: 36 passed (1.6 min), 0 failed, 0 flaky, no re-run needed. Port 7949 was held by a stale server from an earlier QA round (not mine, left running), so the dev server used 7948 and e2e used 7947.

## Regressions versus r47 and r48

None found. Fixed or improved since r48: Earth stage texture, Echo contrast on Air, Air floor distinct from Water, per-element super banner and star tint, phone portrait menu showcase, Tour chip thumbnails, hit numbers on all hits. Still open: FIGHT! overlap, picker bar covering the partner slot, first-run hint overlay, phone landscape title collision, showcase edge noise, blurry Tour portraits. Details in qa-r49-findings.md.
