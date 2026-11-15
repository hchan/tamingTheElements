---
status: idea
added: 2026-11-14
---

# QA r38 phone 667x375 findings

Sheet: ~/claudetmp/qa-r38/sheet-phone.png (ph-menu, ph-picker, ph-fight1, ph-fight2, ph-help).

- Versus picker at 667: the hero cards (You / Computer) are cut off by the sticky Fight!/Back bar; you only see the first card header ("player Sindarosa", "enemy Rokcore") and must scroll inside a tiny region. Add a compact hero-select row or shrink the opponent/team/arena block (it uses 3 rows plus a 2-line paragraph).
- 2v2 fight at 667: the virtual stick overlaps the first action-bar slots (Blast / Flame / Tag); the Tag button is partly under the stick. Move the stick above the bar or shift the bar right in 2v2.
- 1v1 fight at 667: fighters are small (about 60 px tall) in a wide arena; the FIRE x2 chips are comparable in size to the fighters' heads. Hide the terrain chips after about 3 s on phones.
- First-run card sits in the middle of the arena between fighters; acceptable since it times out, but "Got it" is a small tap target.
- Menu and Help at 667 are clean; Help jump chips wrap fine.

## Progress

- 2026-11-14: fixed the first two findings (CSS only, appended to src/ui/styles/main.css, `(pointer: coarse) and (max-height: 420px)` landscape). Versus picker: title visually hidden, the arena hint hidden, rows tightened (44 px targets kept), so the You / Computer cards clear the Fight!/Back bar. Touch stick raised to sit above the action bar (was over Blast / Flame / Tag in 2v2). E2E: `tests/e2e/touch-fight-layout.spec.ts` "small phone landscape, QA r38". Shots: ~/claudetmp/phone-r38/{before,after}-*.png. Terrain-chip hide and Got it size remain open (chips belong to src/game/fx, off limits here).
