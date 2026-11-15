---
status: idea
added: 2026-11-15
---

# QA r48 scorecard (HEAD c4ce86f7, dev server, headless Chromium SwiftShader)

Scores 0-5 vs Street Fighter / MvC (r47 was 3.5 / 3.5 / 3.5). Goal: mystic, luminous, painterly, not cartoony.
Screenshots: `~/claudetmp/qa-r48/s/`.

- Fun: 3.5 (=). Mixed 2v2 (Fiara + Echo vs Morblass + Wispera) tags cleanly (TAG! call, SAFE chip, 2.8 s cooldown). Tour stages 1 to 5 clear through with 0 page errors. Phone match plays to Victory 2-0. Hit numbers now appear on phone (`ph-super.png`), but the FIGHT! banner still sits on the first hit (`ph-hit9.png`).
- Graphics: 3.5 (=). The menu hero showcase is a real step up in first impression (red dragon, shadow dragon, water golem painted in one dark-fantasy style) but cut-out edges are rough (jagged dithered halos, dark rock outline noise) at 2560x1440. Stage floors are strong; the Air stage reads as cracked ice.
- Readability: 3.5 (=). The five menu buttons stay readable over the showcase on all five viewports tested. Online page is better (framed card, Step 1 / Step 2) but still scrolls. The sticky Fight bar still covers the partner slot in the picker (`team2-picker-set.png`).

## Coverage

Covered, 0 page errors in every run: menu showcase at 1280x720, 2560x1440, 375x667, 667x375 touch, reduced motion; Online page; mixed 2v2 versus incl. tag; Tour stage cards 1 to 7 and fights 4 to 5; phone 667x375 full match to Victory.

Not covered: two-browser Online handshake, a 24-hero picker (still 12), Tour stage 9 Void, real entrance animation timing (a shot at 150 ms already looked final, so the animation is very short or absent).

## r47 open items

- Super starburst generic white: persists (same white asterisk on the phone hit, `ph-hit9.png`); per-element supers not re-shot this round.
- Sticky Fight bar covers partner slot: persists (`team2-picker-set.png`).
- FIGHT! lingering: persists (`ph-hit9.png`).
- Online page unframed: improved (card with steps), `online-1.png`.
- Tour card portraits blurry on flat purple: persists (`tour-card5.png`).
- Roster still 12.
