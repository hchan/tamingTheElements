# QA r115 findings (ranked)

status: idea
added: 2026-11-18

1. Super cut-in overlaps the combo counter and a status badge. In .scratch/qa-r115/16-super-freeze.png the "3 HITS / 60 DMG" text sits on top of the HELLFIRE LANCE band and covers a "SAFE" badge at top-left. Fix: hide or shift the combo counter and badges during the super freeze.
2. Earth stage shows no visible ROCK patches in .scratch/qa-r115/08-stage-earth.png (100 ticks after the swap) though the terrain probe reports 5 patches, alpha 1, labels ROCK. Fire, air and water show labelled patches. Possibly a fade/transition-timing or draw-order issue; re-check with a longer wait.
3. 2v2 Tag key press (3, held 3 ticks in manual mode) did not swap the lead in .scratch/qa-r115/14-tag-in-5.png (Sindarosa stays in, no TAG! call). Unverified: may be the manual-step keyboard polling in my script, not a game bug. Needs a human or e2e check.
4. Projectile bursts hide the target. In .scratch/qa-r115/13-2v2-exchange.png and 17-super-mid.png the Fiara sprite is covered by overlapping fire bursts and the 39-point damage number; hard to read who is hit, unlike SF clean hit sparks.
5. HUD life numbers (Life 297/297, 560/560) disagree with the picker's "Life 100" and are large, hard-to-compare numbers. A single bar with percent or the picker showing the real in-fight value would read better.
6. First-run hint "FIRST BLOOD ... Got it" stays over the lower arena in every stage shot (e.g. 04-stage-fire.png) and covers play space.
7. Versus picker: the explanatory paragraph is cut under the sticky Fight! footer ("More below") at 1280x720 (.scratch/qa-r115/02-versus-picker.png). Menu Online button is gold-highlighted with no focus, reads as hovered.
8. Help jump chips wrap to three uneven rows (.scratch/qa-r115/30-help.png).
9. Pacing: in the stage shots the heroes barely move; the arena feels static compared with SF footsies. Idea: more AI movement, pushback on hit.

No console or page errors in any run. Player-facing text check: no Classic/Arcade/ruleset/Capture seen in menu, picker, HUD, Tour, Help top. (URL flag ff=arcade is dev-only.)
