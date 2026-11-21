---
status: done
triaged: a (fixed, dropped or art-only)
added: 2026-11-15
---

# QA r58 findings (HEAD b740d971)

Screenshots under `~/claudetmp/qa-r58/s/`.

## Roster Batch 2 (new, via `?ff=roster24`, each vs Fiara on the Fire stage)

- Zephra (air): about 60px tall next to Fiara at about 200px; grey-blue and translucent, nearly lost on the lava floor (`r-zephra-hit.png`; `r-zephra-intro.png` on the Air stage is readable but still tiny). Scale it up (roughly 2x) or add a rim light. Biggest finding of this round.
- Brazgor (fire): large and readable, but the sprite has a pale blue-white outline halo that looks cut out against lava, and his fire mane merges with Fiara when they overlap (`r-brazgor-hit.png`, `r-brazgor-super.png`).
- Glimmaw (water): best of the four, a clear anglerfish with a glowing lure; super ring and ABYSSAL LURE banner read well (`r-glimmaw-super.png`).
- Durrok (earth): readable tortoise with a green back patch; same pale outline; size matches Fiara (`r-durrok-hit.png`). The STUN chip appears in the top bar, far from the victim.
- Picker: Nykra and Glimmaw show in the Water row at 1280x720 without scrolling, so new heroes are discoverable; the Air row is faded under the sticky bar (`roster-picker.png`).
- Sizes are inconsistent across the roster (Zephra tiny, Brazgor huge); normalise heroes to a common height band.

## Fixed or improved since r57

- None of the r57 open items were addressed; the only merge was the roster. Menu (`menu-desk.png`) and Water 1v1/2v2 (`d1v1-super.png`, `d2v2-hit.png`) are clean, 2v2 tag cards and the Tag button are legible.

## Still open from r57

- Phone portrait 390x844: top ~40 percent black, arena a ~100px strip, FIRST BLOOD card large (`pport-match.png`). Largest readability gap since r55.
- CC body cue faint and the chip sits in the top bar away from the victim (STUN chip in `r-durrok-hit.png`, `r-brazgor-super.png`). No on-body marker (compare SF dizzy stars).
- Kindrel and Nykra sprite blending on lava / Void: not re-shot this round, treat as open.
- Hero picker at 667x375: the grid is behind the sticky bar and shows about one row (`ph-pick-a.png`); no scroll cue.
- FIRST BLOOD card still covers the bottom of the arena until dismissed.
- Classic demo HUD debug text: not re-checked, treat as open.

## New small observations

- Phone landscape fight (`pl-1v1-hit.png`) works: stick, Strike buttons and action bar are usable; the hint card overlaps the left of the arena.
- Phone landscape menu: title overlaps the Echo art at top right (`menu-ph-l.png`), minor.

## Coverage

Menu at 1280x720, 667x375, 390x844; Versus picker at 1280x720 and 667x375; 1v1 and 2v2 on Water with hit and super; phone landscape fight; phone portrait fight; Brazgor, Glimmaw, Durrok, Zephra (intro, hit, ability, super); E2E subset of 40 specs.

## Triage 2026-11-21 (code-checked)

Fixed or dropped: picker "More below" cue exists (footer pill, `src/ui/styles/main/10-picker-layout.css`); the on-body status marker is `src/game/fx/status-ring.ts`; the first-hint card is covered by ideas/done/qa-first-hint-covers-arena.md. Dropped by owner decision (2026-11-18, no phone/portrait/touch work): every phone, portrait, 667x375 and 812x375 item, plus the touch-fight-layout e2e specs (deleted).
Art-only, noted: roster24 hero art (Zephra, Brazgor, Glimmaw, Durrok scale and outline) is hidden and art-director gated; Fiara halo and mane blending is hero art.
