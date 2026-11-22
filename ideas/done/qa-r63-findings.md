---
status: done
triaged: a (fixed, dropped or art-only; tour HUD and tag refusal carried to r65)
added: 2026-11-15
---

# QA r63 findings (HEAD 4f8eb1dc)

Headless Chromium SwiftShader, port 7963, screenshots under `~/claudetmp/qa-r63/s/`. Not repeating r62 items (portrait black half, FIRST BLOOD card, WEATHER box vs TAG!, rough Fiara, hit effect hiding the victim). New only.

## World Tour (`tour-setup`, `tour-map`, `tour-splash`, `tour-fight`, `tour-hit`)

- Stage map is good: "STAGE 1 OF 9", location, opponent list, difficulty diamonds, continues pips, your team, nine stage chips with NEXT and LOCKED tags, Fight bar. Clear.
- LOCKED stage chips (stages 2-9) have low-contrast labels over busy art and the LOCKED tag is tiny.
- The map lists three opponents (Wispera, Cyclonius, Sindarosa) while the VS splash shows only "Opponent: Wispera (air)". Show the whole enemy team on the splash.
- Stage 1's opponent team includes Sindarosa, the same hero as the default lead: an unexplained mirror.
- In a Tour fight the generic FIRST BLOOD hint card still covers the arena bottom, and the fight HUD shows no stage number or continues count, so run context is lost once the fight starts.
- Wispera (air) is a grainy grey-white pixel blob (`tour-hit.png`); front and back are hard to tell at fight scale, and the hit effect turns it into a smudge.
- HUD life numbers look lopsided on an Easy stage: Wispera 478 vs Sindarosa 228.

## Help (`help-top`, `help-full`, `help-phone`)

- Desktop page is 4863 px tall (about 2990 characters, five jump buttons); on a 390 px phone it is 6674 px. Most of the length is five controls tables (keyboard P1, P2, gamepad, touch, anywhere), which repeat the numbered "How to fight" list and the action bar legend.
- No mention of World Tour, Versus modes, 2v2/3v3 beyond one Tag line, or what the element icons and the AIR x2 / WATER +HP floor pills mean.
- "Jump to" has three anchors but no back-to-top in the page body, only Back at the top and bottom.
- Reading level is fine: short numbered steps, plain words; the key chips in the action bar section scan well.
- Wording nit: "Trap Z or 0" and "Element V or -" use `0` and `-` as keys, which look like typos at first read.

## Water and Air 1v1 (`water-1v1-*`, `air-1v1-*`)

- Both floors read well and are clearly elemental (teal with WATER +HP pills; slate-blue with AIR x2 pills); fighters separate from them. Water is the best-reading stage so far.
- Air is the lowest-contrast: Wispera and the AIR x2 pools blend into the slate floor (`super-wispera.png`).
- Stand and torch ambience differs by element and looks good.

## Supers per element (`water-1v1-super`, `air-1v1-super`, `super-fiara`, `super-rokcore`, `super-curomo`, `super-wispera`, `super-wispera-after`)

- Phoenix Rise (Fire), Mountain Breaker (Earth), Glacier Crash (Water), Siren Gale (Air): each gets a full-width coloured band, the hero portrait glowing at the side, move name and element word. Colours (orange, tan, blue, pale cyan) are consistent and legible.
- The band is about 160 px tall across a 720 px arena and hides both fighters' upper bodies for the whole freeze; its position (top or bottom) switches between supers with no clear rule, and in the bottom case it sits on the FIRST BLOOD card.
- Siren Gale after the band is the best payoff seen: green ray burst, STUN chip, "2 HITS / 103 DMG" counter (`super-wispera-after.png`).
- Hellfire Lance shows only the star of triangles (the lead's aura) in the first frames; no visible lance.
- Life bars are the same length whatever the max life (Wispera 757, Rokcore 321, Fiara 547, Curomo 542), so 100 damage looks very different per hero.

## Tag swap on phones (`pw-picker2v2`, `pw-2v2-before`, `pw-tag-a`, `pw-tag-b`, `pp-picker2v2`)

- 812x375 2v2 picker: the "Your partner (2v2)" label is whole and Swap up / Clear clear the Fight bar (the r62 e2e regression does not show here). The hero grid is cut off by "More below" so the Water row names are half hidden.
- 812x375 fight: tapping the Tag box then stepping 14 ticks produced no visible swap (HUD still Sindarosa 228/228, no TAG! call; `pw-tag-a` and `pw-tag-b` are identical). Could be the opening tag cooldown under manual stepping; needs a live check before calling it a bug.
- 812x375 HUD: "SINDAROSA 228/228 SUPER 0%" and "SUPER 0% ... FIARA 415/415" run into each other; the SUPER label touches the life number on both sides.
- Benched hero cards under the HUD with TAG labels are small but readable at 2x.
- Touch layer: joystick left, Strike 1 and 2 right (Strike 1 about 20 px from the screen edge), Pause top right, 12 action boxes along the bottom.
- 390x844 portrait: the Tag box could not be tapped (30 s timeout) because the rotate overlay covers the arena, so portrait tag is untestable without "Play anyway". Portrait 2v2 picker (`pp-picker2v2.png`) is a long stack (Opponent, Team, AI level, Arena) with the You/Computer cards cut by the Fight bar; "3v3 tag team" wraps to a second line.

## Process

- `node_modules` symlinked from the main checkout (not committed). Server pid in `~/claudetmp/qa-r63/pid`.

## Triage 2026-11-21 (code-checked)

Fixed: the Tour splash shows "Stage N of 9" and the enemy bench under the lead (`src/ui/screens/tour.ts:123,141-190`); Help now covers World Tour, Versus, Online, 2v2/3v3 and the floor pills (`help-guide.ts:80-97`, pinned by `help.dom.test.ts:136`); life bars share one scale (ideas/done/qa-r15-life-totals-vs-bar-length.md); the super band was reworked (r119 N4 shows it working). The "tag swap shows nothing" sub-item is the same as r65's open tag feedback (carried there). Dropped by owner decision (2026-11-18, no phone/portrait/touch work): every phone, portrait, 667x375 and 812x375 item, plus the touch-fight-layout e2e specs (deleted).
Art-only, noted: Wispera grey blob, Hellfire Lance art, Air floor contrast, LOCKED chip label contrast (tour-select silhouettes).
