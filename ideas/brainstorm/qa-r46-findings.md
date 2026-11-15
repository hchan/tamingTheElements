---
status: idea
added: 2026-11-14
---

# QA r46 findings (headless Chromium SwiftShader, dev server of eb1c44c0)

Screenshots: ~/claudetmp/qa-r46/s/*.png. Script helpers: ~/claudetmp/qa-r46/{m,p,f,t}.mjs.

Ranked:

1. Picker shows 12 heroes, not 24, and the grid is 3 columns at every size. `.heroTile` count is 12 at 1920, 1280, 667 and 390 (Water 3, Air 3, Fire 3, Earth 3). The "24-slot / 6-column" layout of WP 0.5 cannot be judged yet; the roster is not there. Screenshots: ~/claudetmp/qa-r46/s/pick-v-1920-a.png, pick-p-1280-a.png.
2. Phone 667x375 picker clips hero names to "Cyclon", "Echo", "Wisper", "Sinda", "Rokcor", "Treen" (Play tab, detail panel eats half the width). With 24 heroes this gets worse. Idea: drop the name to a second line or hide the portrait frame at <=700 px, or show the name only in the detail panel. Screenshot: ~/claudetmp/qa-r46/s/pick-p-667-b.png.
3. Desktop picker wastes space and tiles are small: at 1920x1080 Versus the grid stays about 650 px wide with 11 px names while the detail panel and empty margin fill the rest (the badge icon is about 12 px). Idea: scale tiles with the viewport, use 6 columns once the roster grows. Screenshot: ~/claudetmp/qa-r46/s/pick-v-1920-a.png.
4. Phone first-run hint still covers the arena upper-left (r45 leftover, still open): a 250x45 px box with a "Got it" button over the first 1.5 s of the fight area, plus the Strike buttons and the opponent at the right edge. Suggest auto-dismiss on first stick move. Screenshot: ~/claudetmp/qa-r46/s/ph-idle.png. (Desktop strip is fine: Echo-idle1.png.)
5. Hit feedback is uneven. Echo hurricane (Echo-atk3.png) and Wispera steal (Wispera-atk3.png) get a big damage number, impact burst and STUN chip, which is the SF/MvC feel wanted. Fiara vs Ishimi (Fiara-atk3.png) and Morblass vs Lavax (Morblass-atk3.png) show no number or spark in the sampled frame, and when two fighters overlap on one spot (Morblass-atk3.png) they merge into one blob. Check overlap push-apart and a contact flash for all strikes.
6. Wispera sprite is crunchy: blocky stair-stepped edges and speckles around the body vs the painterly Cyclonius next to it (Wispera-idle1.png). Fiara has a hard jagged orange outline (Fiara-atk3.png). Both read cartoon-cutout, not painterly.
7. Echo is low contrast on the Air stage: pale grey-blue ghost on a pale ice floor, easy to lose during a fight (Echo-idle1.png). Needs a darker rim or shadow.
8. Earth stage props (flat vector boulders) look cartoony against the painted floor (Wispera-idle1.png).
9. Reduced motion: respected (no extra camera shake seen), and the super still shows a clear starburst and SAFE/STUN chips (rm-super-sb.png, phrm-super-sb.png). In rm-hit.png five strike steps left Pax at 690/690, so reduced motion may hide a hit; not confirmed (overlapping fighters, 5 manual steps), worth a targeted check.
10. Menu: Settings and Online first view is plain form text with no framing next to the polished menu (click-Online.png, click-Settings.png); the Online page is a wall of unstyled labels, fine functionally. Help is good (click-Help.png). Menu itself (menu.png) is polished: gold title, rune emblem, big focus ring on Play, dragon backdrop; the Rokcore backdrop shows halo artefacts around the golem outline.

Verified good: all five menu entries navigate (#play, #versus, #online, #settings, #help); melee/ranged badge has icon, word ("Ranged" in the detail card) and accessible text ("Curomo (water, Melee)"); Fight bar stays on screen at 390x844 (pick-v-390-a.png); no horizontal overflow seen; page errors 0 across all runs; phone touch HUD (stick, Strike 1/2, Pause) is clear and uncluttered (ph-super-sb.png).
