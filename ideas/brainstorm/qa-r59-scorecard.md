---
status: idea
added: 2026-11-15
---

# QA r59 scorecard (HEAD fcfda4be, dev server port 7963, headless Chromium SwiftShader)

New since r58: roster Batch 3 heroes (Ouroth, Abyssor, Vortigal, Umbrel) behind `?ff=roster24`, hidden and not scored. The visible game is unchanged from r58, so scores are flat. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r58 was 3.7 / 4.2 / 3.6). Screenshots: `~/claudetmp/qa-r59/s/` (about 45 files: menu at three sizes, picker, 1v1 on all four stages with super, 2v2 with a tag swap, Tour, Help, phone portrait and landscape).

- Fun: 3.7 (=). Same loop: supers (HELLFIRE LANCE band), tag swap (TAG! call), weather charge and terrain chips give variety; Tour adds structure. No new playable content visible.
- Graphics: 4.2 (=). Four stage floors are distinct and atmospheric, super banners and the menu art are strong. The Fiara sprite and the triangle aura markers look rough next to the arenas.
- Readability: 3.6 (=). Desktop HUD, life bars, action bar and terrain chips are clear. The phone portrait black-top layout, the center-top WEATHER box over the arena and the FIRST BLOOD card are still the weak points.

E2E subset (port 7962, 1 worker): cc-fx, first-run-hint, hud-labels-sf, hero-picker-layout, arcade-tag, arcade-super, tour-card, versus-stage-pick, touch-fight-layout, menu-phone-row: 63 passed, 1 failed, the known pre-existing `touch-fight-layout.spec.ts:267` (a tag call hides the first-run card). Run was slow because other agents were also running Playwright.

Page errors: none in any scripted run.

r58 open items fixed: 0 of 6 (see findings).
