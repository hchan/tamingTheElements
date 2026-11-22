---
status: done
triaged: superseded (art items noted, rest fixed or dropped)
added: 2026-11-16
---

# QA r74: findings (main e7c19b97)

Screenshots: ~/claudetmp/qa-r74/ (f-*, k-* banner/swap/KO at 3 sizes, p-* played fights, s-* supers, sup-p667-*, sup-p844-*, tag-*). Scripts (fight, ko, play, sup2, tag) in the same folder. Dev server on port 7923.

## r69 / r73 items re-checked

| Item | Result |
|---|---|
| r69 PAX/SINDAROSA IN! huge, hugging the left edge, over the damage number | FIXED (small gold call, whole on screen at 1280, 844, 667) |
| r69 TAG! hidden during FIGHT! | Not re-tested separately; TAG! shows on a swap after the banner (tag-1.png, k-1280-swap-2.png) |
| r69 swap flash pale on the life bar | FIXED (rim and glint) |
| r69 hero names faint and clipped in the round banner | FIXED (large, bone, full width) |
| r69 hit-mark fire vs earth too close | FIXED visually (orange-yellow vs teal-green) |
| r73 #3 floor chips clip at the edge and sit behind heads | FIXED in every shot taken |
| r73 #1 first-run hint card over the super band at 844x390 | STILL THERE (sup-p844-morblass-near-3.png) |
| r73 #2 Pause button over the band's right end on phones | STILL THERE (667x375 shots) |
| r73 #4 Air super text pale on pale as it fades | Not re-checked |
| r73 #5 Earth round-intro Treenoc pale with a halo | Better, still ghosted (f-rokcore-treenoc-intro.png) |
| r73 #6 Portrait shows only the Rotate overlay | Not re-checked |
| r73 #7 "P2 Fire Bomb (arming)" debug-looking label | Not re-checked |
| r73 #8 Wispera is a plain orb | STILL THERE (f-morblass-wispera-fight.png) |

## New or remaining problems

1. Damage numbers pile up in busy fights: "72" with a small "16" jammed against it, "45" with "10" and "<1" (p-rokcore-cyclonius-5.png, p-lavax-treenoc-4.png). The big number reads, the small ones collide. Offset or fade the secondary numbers.
2. On a KO entrance the fallen hero's sprite still shows under the incoming one for a few ticks (k-1280-ko-1.png: dragon overlapped by Pax with the buff arrows). Fade the KO'd sprite faster or delay the entrance by a few ticks.
3. The far-side floor chip is very faint ("WATER +HP" at about 30% alpha, p-ishimi-fiara-3.png), while the near-side chip is solid. Same chip, two looks; the faint one is hard to read.
4. Top status chips can hide a floating label: "SNAG" is half hidden behind "SNAGGED 1s / STUN" (f-morblass-wispera-fight.png).
5. On a first-run 2v2 the "First blood" hint card pops up on the first swap and sits over the lower floor (k-1280-swap-2.png). Fine, but it was not dismissed with the usual path because the intro card never showed; the game should show it once.
6. Wispera orb, and Echo/Cyclonius icons being similar, are unchanged since r73.

## Not a bug

- Fiara looked idle in manual-step shots: the harness steps the sim without live AI input timing, not a game fault.

## Triage 2026-11-21 (code-checked)

Fixed: damage-number collisions (verified r78, `numberBoxes` probe, DMGNUM-1); KO ghost under the incoming hero (verified r76); SNAG label behind chips (`ideas/done/snag-pop-under-status-chips.md`, verified r77); floor chips clipped or behind heads and faint far chip (FLOOR-TAGS-1 merged: `chipCentreX`/`chipOwner` in `src/game/fx/terrain-fx.ts`, used at `src/game/fx/terrain-view.ts:248`; the chip eases down only by design while a fighter stands near). First-run 2v2 hint on the first swap: one-shot card in `src/game/app/first-run-hint.ts`, cosmetic. Not a bug: Fiara idle in manual-step shots.
Art only, noted: Wispera plain orb; Echo and Cyclonius icons similar (`ideas/brainstorm/qa-r127-tour-foe-scale-wispera.md`).
Open: none.
