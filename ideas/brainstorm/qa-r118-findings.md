# QA r118 findings (desktop 1280x720, headless, main 43a2899d)
status: idea
triaged: c (most items fixed or dropped; one real left, see plan at end)
added: 2026-11-19

Method: test build, Playwright headless Chromium (SwiftShader) at 1280x720. Fights run with `stepLive` in 50-tick chunks, AI active, about 20 s of sim (1000 ticks) per 1v1 arena; hit-stop judged with the sim running. Screenshots in `.scratch/qa-r118/`. Mac load was 15-22 during the work (above the brief's 10; only screenshots, no timing claims).
Smoke: `e2e ran on: PC (job 20261119-103817-short-75970c, short lane) -> exit 0` (15 passed). Console/page errors: none in any run.

## r117 open items re-checked

1. First-run hint covers arena: menu shows a "Dismiss" button; in the Tour fight screens (`tour-2.png`) no hint covers the arena. Could not reproduce; treat as closed unless the hint appears only on a truly fresh profile in-arena (the test context was fresh, so likely closed).
2. Help chip wrap: STILL OPEN. 9 chips wrap 4 / 1 / 4 (`help-00.png`): "Reading the arena" sits alone on its own row. Fix: make the chip row two balanced lines or let the lead chips shrink.
3. HUD life vs picker "Life 100": STILL OPEN and worse to read. Picker says Sindarosa Life 100; HUD shows 286/321, 297 and 228/228 for the same hero in different modes/levels (`02-versus.png` vs `fire-t300.png`, `2v2-super1.png`, `tour-2.png`). Help says "read the number, not just the bar" but the picker number is not the number you fight with. Show the scaled life in the picker or label it "base".
4. Projectile burst covering target: mostly OK. Fire Blast burst in `fire-t300.png` stacks three big ring glyphs around the caster and 4 damage numbers; the target stays visible. Minor: in `2v2-tagA10.png` the lingering hazard glyphs sit on the foe's lane.
5. Super cut-in number vs FIRE label: STILL OPEN. In `2v2-super0.png` the combo counter "3 HITS 84 DMG" sits inside the cut-in band and touches the element word "FIRE" (the DMG line runs right into it). Move the combo counter out of the band during a cut-in or hide it.
6. Picker footer overlap: STILL OPEN. In `02-versus.png` the "More below" chip floats over the explanatory paragraph and the sticky footer cuts the text mid-line. In the Tour picker (`s-Play.png`) the chip overlaps the "Enter" key tag of the second ability. Add bottom padding for the footer and place the chip in the footer, not over content.
7. FIGHT! banner over heads: in the Tour the intro shows "ROUND 1" mid-arena, grey and dim, faded over the floor (`tour-2.png`); characters are clear of it. Versus intro banner timing was not caught at t0 (screens taken after the intro). Closed for 1v1 positions, low confidence.

## New issues

- N1 (medium) Pacing. AI approaches after about tick 100 and then pins the player at a wall; a player who only holds toward the foe gets stunned repeatedly (STUN badge in most fire/water/air shots). Cyclonius and Curomo (vs Lavax) kite. Spacing at start is wide (about 900 px apart in Tour stage 1, `tour-2.png`) with a long dead walk. Consider a closer start spacing.
- N2 (low) Earth arena: the far foe is drawn half cut by the right edge with the "ROCKFALL 2s" label painted over its body (`earthPax-t500.png`). Label should anchor beside, not over the hero.
- N3 (low) Tour pre-fight card lists "C Snag" in controls for a team where only some heroes have Snag (`tour-1.png`); also says "Strike/Special" while the action bar says Blast/Flame and Help says "Attack/Second attack". Pick one vocabulary.
- N4 (low) Help text says "each circle on a phone names its ability" and a Touch controls table, while the owner dropped phone work (2026-11-18). Harmless but dated.
- N5 (low) Tour fight: there are no wins circles filled and the "TAG" slot bars look empty at round start; the bench portraits (top centre) are small but readable. OK.
- N6 (info) Hit-stop with the sim running reads as a short snap on heavy hits (victim holds x), consistent with the r117 pin test; no problem observed.
- N7 (info) 2v2 tag works: "TAG!" call plus "IN Pax / BENCH Sindarosa" lines, bench icons show "NO TAG" red X on a KO'd partner (`2v2-super1.png`); tag cooldown shown on the key ("Tag 3s"). Clear.

## Banned-word scan (Classic, Arcade, ruleset, Capture)

Clean on Menu, Versus, Play/Tour picker and card, Online, Settings, and Help (all five sections opened, 5503 chars of text, plus the Key Bindings/Guide/Wiki/Story/About jump chips which are links, not scanned). "Snag" used throughout. Note: the Help body text only shows sections as accordions; the jump-to chips for Guide/Wiki/Story/About navigate away and were not read.

## Screens not captured

Hero select inside Tour/Versus picker covered (`02-versus.png`, `s-Play.png`). Online shows only the entry screen (no host/join flow). Settings scrolled only the first viewport (Audio, Controls).

## Triage 2026-11-21 (code-checked)

Fixed: help chip wrap (5-col grid, `src/ui/styles/help.css`); picker life (`heroLife` scaled, `src/ui/screens/arcade-versus.ts:40`, used by `tour.ts:275`); "More below" pill now in the footer bar (`src/ui/styles/main/10-picker-layout.css:85`); stage 1 dead walk (`openingRush`, `src/game/app/tour-match.ts:104`); Tour card vocabulary (hero ability names, `src/game/app/tour-controls.ts`); phone help text dropped (`src/ui/screens/help-guide.test.ts:6`). Not reproduced or info only: the rest.
Open (c): hit numbers over the super cut-in title/label. HUD numbers sit at depth 101-102 (`src/game/scenes/Hud.ts:783,838`), the band at 5-8 (`src/game/fx/super-view.ts:96`). Plan: while `superCut` is live, hide or lower the HUD numbers over the band (render-only; Hud.ts is 1218 lines, so put the logic in a small helper under `src/game/hud/`). Low extra: first-fight hint contrast (`src/game/app/first-run-hint.ts`).
