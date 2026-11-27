---
status: idea
added: 2026-11-27
---

# Ouroth Wyrm Coil whiffs when the foe overlaps the 200 px body

Severity: minor. Found by the QA pass `.scratch/qa-heroes-2` (Arcade Versus, ouroth vs fiara, manual stepping, SIM_VERSION 117).

## Evidence

Cmd 16 (Wyrm Coil, a 22 damage grab) cast with the foe at a centre gap `g` from Ouroth, 60 ticks (and 120 ticks) after the cast:

| gap | foe life after |
| --- | --- |
| 120 | 550 / 550 (no hit, no number, no grab, stayed 550 for 120 ticks) |
| 150 | 494.4 (grabbed and thrown) |
| 180 | 494.4 |
| 220 | 494.4 |

Screenshot `.scratch/qa-heroes-2/ouroth-primary120-R-t8.png` shows the coil fx box (the 80x70 hit area) drawn just beyond the body's right edge while the foe stands inside the body width, so the hit area never overlaps the foe. Ouroth's box is 200 x 90 (`src/core/data/size.ts:50`), so a foe that walks into its body is in a dead zone.

## Suspected cause

`wyrm-coil` is `w: 80` and starts at the body edge (`src/core/data/abilities-c.ts:25`), with no coverage of the half-body overlap. Probably needs a wider or backward-extended hit box, or a body-pushout so the foe cannot overlap.

## Other notes from the same pass (no defect)

Nykra, Brazgor, Durrok, Abyssor, Vortigal and Ouroth: no console or page errors and no 404s (only a Chromium "GPU stall due to ReadPixels" driver warning); the HUD action bar shows names and cooldown seconds for every slot; the results panel for win and loss drew correctly; Ouroth at the left wall is not clipped.
