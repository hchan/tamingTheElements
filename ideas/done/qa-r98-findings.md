---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r98 findings

Evidence is in `.scratch/shots98/` (gitignored; regenerate with the r98 spec flow described in qa-r98-scorecard.md). No P1 found.

## P2

1. **About 40% of the 390x844 canvas is empty sky.** The crowd and floor sit in the lower half; above them is only motes and glow. Fighters are small. Consider a taller floor band or a tighter camera on portrait. Evidence: `m390-fight-Water.png`, `m390-fight-Earth-b.png`, `m390-fight-Air.png`.
2. **Two-row ability bar covers part of the floor** for heroes with 9 slots (Water, Air, Earth, 2v2 heroes). At 360 the second row overlaps the lower floor where fighters stand. Evidence: `m360-2v2.png`, `m390-fight-Water.png`.

## P3

3. **Super cut-in title collides with the right chip at 360.** "GLACIER CRASH" runs into the "WATER +HP" chip. Evidence: `m360-super-Water.png`.
4. **Tour stage card clipped at 390.** The opponent trio portrait and "YOUR TEAM" caption are cut at the right edge. Evidence: `m390-tour-stage.png`.
5. **Round-end banner is faint** ("ROUND 2" low contrast in empty sky) and SAFE chips overlap the HUD bar under the portraits. Evidence: `m390-roundend-b.png`.
6. **Dark band under the floor remains** after the action bar hides (KO and round end); the fade is fixed during play but the bottom strip stays dark. Evidence: `m390-roundend-b.png`, `m390-fight-Earth-b.png`.

## Verified fixed from r97

- Options label truncation; More-below chip spacing.
- Super cut-in thin at phone width (full-width banner now).
- Sky gradient hairline; action bar hard strip.

## Tests

E2E stable subset: 128 passed (9.0 min). Screenshot run: 24 passed plus 15 stage-fixed reruns, 0 console or page errors.

## Triage 2026-11-21 (code-checked)

Dropped (phone/portrait): empty sky, two-row ability bar, super title collision at 360, Tour card clip, round-end banner on phone, band under floor (fixed r99).
Open: none.
