---
status: idea
added: 2026-11-14
---
# Menu and picker polish (r11)

- Versus picker still shows "1 of 1 picked" and "Add to team" with a stale hero detail (r10 open).
- Ishimi tile label overlaps its icon on the Play picker (desktop).
- Enter on the main menu does nothing; keyboard-first players expect it to activate the focused entry.
- "Play in portrait anyway" button exists in the DOM on desktop; hide it or make it inert off touch.
- Lavax sprite is too dark on the dark floor; Cyclonius life bar is flat.
- Hero stats show "Alignment Evil" with no explanation.

triaged: 2026-11-21, still real. Plan: (1) arcade-versus.ts:340 "N of M picked" counter and Add to team label vs stale detail; (2) Enter on the main menu (check src/ui/menu-keys.ts); (3) explain Alignment in hero-info.ts, character-details.ts, race.ts; (4) Lavax floor contrast and Cyclonius life bar are art/HUD, split out. "Play in portrait anyway" is gone from src; Ishimi tile overlap unverified.
