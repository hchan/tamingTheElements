---
status: idea
added: 2026-11-15
---

# QA r61 scorecard (HEAD 25c8c697, dev server port 7982, headless Chromium SwiftShader)

New since r60: HoT/DoT work (Mending, Venom, douse, AI cleanse; OT2-OT5). Mostly sim-side; the visible changes are status chips (SAFE, STUN, ADREN, EMBER timers) and the Cleanse slot on the bar. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r60 was 3.7 / 4.2 / 3.8). Screenshots: `~/claudetmp/qa-r61/s/` (46 files), scripts in `~/claudetmp/qa-r61/scripts/`.

- Fun: 3.7 (=). Same loop; hits, super band and tag swap still land well. The new DoT/HoT riders were not visible in my scripted fights (no Venom or burn applied), so I cannot credit them yet.
- Graphics: 4.2 (=). Four stage floors, menu art, hit sparks and the super band stay strong. Fiara is still a rough fire blob with triangle markers, Echo/Wispera tour portraits are low-res.
- Readability: 3.8 (=). Picker with its Fight bar is stable. Unchanged problems: WEATHER 0% box, FIRST BLOOD card over the arena bottom, black phone portrait.

Page errors: none in any scripted run (menu, 4 stages, 2v2, Tour, Help, phone portrait and landscape).

E2E subset (port 7983, 1 worker; same 11 specs as r60): 82 passed, 1 failed, the known `touch-fight-layout.spec.ts:267` (tag call does not hide the first-run card), unchanged from r60.

r60 open items fixed: 0 of 7 (see findings).
