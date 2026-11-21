---
status: idea
triaged: c (2026-11-21; mostly fixed or obsolete; open: Tour card art, matte halo, air moving clouds)
added: 2026-11-15
---

# QA r48 findings (ranked)

Screenshots under `~/claudetmp/qa-r48/s/`. Scores in qa-r48-scorecard.md.

1. Hero showcase cut-out edges are rough. At 2560x1440 the red dragon, rock backdrop and water golem show jagged dithered halos and a noisy dark outline on the rock (matting artefacts), and the left dragon is hard-cropped by the viewport edge. Re-matte with a soft feather and painted rim glow, or add vignette and bloom over the layer. Shots: `menu-qhd.png`, `menu-desk-late.png`.
2. Phone landscape (667x375): the title collides with the dragon wing and the golem head (golem cropped by the top edge), and the shadow dragon sits under the buttons. Buttons stay legible. Shrink or hide side figures and keep the title clear. Shot: `menu-pl.png`.
3. Entrance animation not observable: a shot about 150 ms after load is identical to the settled frame, so there is no visible fade or slide (or it is under 150 ms). Add a 400 to 600 ms staggered fade and a slow parallax drift; keep reduced motion static (it renders identically, which is correct). Shots: `menu-entr-early.png`, `menu-rm.png`.
4. Phone portrait (375x667): the showcase is nearly invisible; only a faint shadow dragon behind the logo and a tiny red dragon at the bottom right. Use one large figure in the lower half. Buttons readable. Shot: `menu-pp.png`.
5. Sticky Fight bar still covers the partner slot in the 2v2 picker; the partner (Echo) is invisible after selection and the detail pane shows an unrelated hero (Sindarosa "Add to team"). Reserve space for the bar, show the chosen partner in it, and make the detail pane follow the selection. Shot: `team2-picker-set.png`.
6. FIGHT! banner lingers into the first hits (tick ~110) on phone and overlaps the damage number. Shorten to about 0.6 s. Shots: `ph-hit9.png`, `tour-fight5.png`.
7. Hit feedback: impact is one generic white asterisk plus a number for every element and hero. Ideas: per-element contact mark (ember burst, water splash ring, wind slash arc, stone shards), 2 to 3 frame hit-stop with a brief sprite flash, screen shake scaled to damage, a heavier mark for super hits. Shots: `team2-tag-b.png`, `ph-super.png`, `tour-after1.png`.
8. Super VFX per element: the SIREN GALE banner (Air) looks good, but the burst under it is the same white starburst. Give each element a painted burst colour and shape, and tint the banner band by element. Shot: `ph-super.png`.
9. Art consistency: menu heroes are painted and detailed, in-fight sprites are smaller and softer with halo edges (Fiara orange outline, ghostly Wispera), and Tour card portraits are blurry sprites on flat purple. Reuse the painted showcase art for Tour cards and the picker. Shots: `tour-card5.png`, `team2-tag-b.png`, `menu-desk-late.png`.
10. Air stage floor reads as cracked ice, not wind, and is hard to tell from Water. Add drifting cloud shadows and a sky tint. Shot: `tour-fight5.png`.
11. Online page: framed card with Step 1 and Step 2, but host and join still need scrolling at 1280x720 and labels are large. Tighten type, place host and join side by side on wide screens. Shot: `online-1.png`.
12. Tour card is flat purple; the painted splash art is not used there. The ladder itself works (cleared / next / locked chips, difficulty diamonds, continues). Shot: `tour-card5.png`.
13. Desktop first-run hint strip ("FIRST BLOOD ... Got it") still overlays the arena bottom at the tag moment. Move it off the arena. Shot: `team2-tag-b.png`.
14. Life asymmetry persists (Echo 438 vs Morblass 359 in 2v2; phone 1v1 Wispera 795 vs Fiara 547). Confirm intended and show life in the picker. Shots: `team2-tag-b.png`, `ph-hit9.png`.

Working well: menu readability with the showcase on every viewport tested (`menu-desk.png`, `menu-pl.png`), tag swap presentation (`team2-tag-b.png`), super banner with element label (`ph-super.png`), phone Victory flow (`ph-result.png`), Tour ladder (`tour-card5.png`).

## Triage 2026-11-21 (code-checked)

Fixed: entrance animation (`src/ui/styles/menu-motion.css`, staggered, reduced-motion safe, `tests/e2e/menu-showcase.spec.ts:46`); picker bar vs partner and detail pane (`picker-bar.spec.ts:76,140`); FIGHT banner 0.6 s (`round-announcer.ts:20`); per-element hit marks and super bursts (`hit-mark.ts`, `super-burst.ts`); Air floor distinct from Water (verified r49); Online page rebuilt (`online-quick.ts`); life shown scaled in the picker.
Obsolete: phone landscape/portrait menu layout (phone/portrait/touch work was dropped by the owner (2026-11-18)); hint strip over the arena (leaves on tag/super).
Open (c): #1 showcase cut-out halo at 2560x1440 and the cropped left dragon (matte art, see r46 (b)); #9/#12 Tour card painted portraits on flat purple (see r47 #10); #10 Air stage moving cloud shadows (low, optional).
