---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r90 findings (main 53099fee)

## r89 fixes verified

- r89 P1 (portrait HUD name): fixed at full life. "SINDAROSA 286" and "CYCLONIUS 560" read whole at 390x844 and 360x640. `.scratch/r90/p390-Sindarosa-start.png`, `p360-Sindarosa-start.png`, `p360-Cyclonius-start.png`.
- r89 P2 (Versus footer): fixed. Fight! and Back are one row about 60px tall (~12% of 360x640, was 41%). `.scratch/r90/versus-390.png`, `versus-360.png`.

## Ranked findings

1. P1 Portrait HUD name still truncates when a status word shows: "SI... 120 HURT", "CYC... 120 LOW" show 2-3 letters at 390 and 360. Fix idea: drop the status word to its own line or an icon, or give the name priority over it. `.scratch/r90/p360-Cyclonius-hit.png`, `p360-Sindarosa-hit.png`, `p390-Sindarosa-hit.png`.
2. P2 Match-end "Victory!" screen is plain: left-aligned top-heavy text over three huge posterized upscaled hero portraits with artifacts, no stats (damage, longest combo only appear on the fading round card). SF/MvC show a winner pose, quote and stats. `.scratch/r90/match-end.png`.
3. P3 Versus picker on phones: the mode (Computer/Two players), size (1v1/2v2/3v3), difficulty and arena options are still at page y ~1078-1560, below every hero row and the details card. The "More below" chip overlaps content and the Pax tile label is shifted right of its icon at 390. `.scratch/r90/versus-390.png`, `versus-360.png`.
4. P4 Super cut-in is modest versus MvC: a thin sliding band with the move title; no full-screen flash or portrait slam in captured frames (manual mode freezes frames, so confirm in live play). `.scratch/r90/dsuper-14.png`, `psuper-14.png`.
5. P5 Portrait ranged view: fighters are small and a large empty sky band sits under the HUD (carries r88 P2 and r89 P7). Super banner also lands in that void. `.scratch/r90/p390-Sindarosa-start.png`, `psuper-14.png`.
6. P6 Round-end card fade is faint and low-contrast over the arena; "YOU WIN / FINAL ROUNDS / HEALTH LEFT / DAMAGE / LONGEST COMBO" is barely readable mid-fade. `.scratch/r90/d-end-r1-card.png`.
7. P7 Sindarosa's red wings have low contrast on the Fire and Earth stages. `.scratch/r90/d-stage-Fire-fight.png`, `d-stage-Earth-fight.png`.
8. P8 The first-run "FIRST BLOOD" card sits over the lower arena. `.scratch/r90/d-stage-Fire-start.png`.
9. P9 Online page is long, text-heavy and uses a large serif at 390; a primary Host/Join split above the steps would shorten it. `.scratch/r90/p-online.png`.

## Coverage notes

- Four stages at 1280x720 are distinct and deterministic (identical hit frames). Terrain chips shown.
- 2v2 Earth tag swap, super, a full 2-0 match to the end screen, menu, Online and Tour hero pick were exercised. A Tour fight itself was not played.
- Carried: r89 P3 (damage numbers and combo digits swamp fighters), P4 (fighter pinned at edge), P5, P6 were not re-checked.

## e2e subset

Run on port 7953, headless, one worker: portrait-play, responsive, picker-bar specs. Result: 103 passed, 0 failed (8.0 min). That includes the new "Versus footer 360x640 / 390x844 slim single row" tests.

## Triage 2026-11-21 (code-checked)

Fixed: portrait names (verified r91), match-end Victory screen (P2, redone r92/r93: portrait, ribbon, stats chip), round-end card legibility (P6, bold in r99), Online page length (P9; the copy-paste host-code flow went with the WebRTC removal), first-run card placement (P8, waits for banners and fades itself, r93). Dropped (phone/portrait): P1, P3, P5. Art/design only, tracked: P4 super cut-in banner (`ideas/brainstorm/sf-super-cinematics.md`), P7 Sindarosa wings on Fire/Earth (`ideas/brainstorm/qa-r128-fire-stage-hero-blend.md`).
Open: none.
