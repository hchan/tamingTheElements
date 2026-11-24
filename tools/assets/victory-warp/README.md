# victory-warp

Scripts behind the approved roster24 victory stills (flat #808080 backdrop, 1024x1024). Run from the repo root.
Python: `~/claudetmp/venv/bin/python -I <script>`; rembg script: `~/claudetmp/rembg-venv/bin/python -I`.
Inputs and outputs live in the gitignored `.scratch/` (mattes in `.scratch/matte/`, made by `tools/assets/matte/matte.py`).

| Script | Produces | Inputs |
| --- | --- | --- |
| `warp.py` | Treenoc and Kindrel round-2 stills, `.scratch/victory-warp/{name}_win.png`, `sheet.png`. Also the shared warp library. | `public/assets/img/map/{name}Large.png` |
| `wave.py` | Wave A (sindarosa, curomo, lavax, morblass, rokcore): `.scratch/victory-warp/waveA/{hero}_win.png`, `_win_rgba.png`, `cmp_*.png`. Also the shared zone/limb warp library. | `public/assets/img/map/{hero}Large.png` |
| `wb.py [hero...]` | Wave B (brazgor, nykra, quarrak, hyalia, ouroth, abyssor): `.scratch/victory-warp/waveB/{hero}_win.png`, `_t_{hero}.png`. | `.scratch/matte/{hero}-*.png` |
| `fix.py hero [k] [g]` | Round-2 hairline cleanup in place on the wave B still (run after `wb.py`). | `.scratch/victory-warp/waveB/{hero}_win.png` |
| `lcc.py png...` | Largest-blob cleanup, writes `<png>_c.png`. | wave B stills |
| `durrok-regrade.py outdir src...` | Durrok key + muted-olive regrade (`{name}-rg.png`); rembg venv. | a Durrok render |
| `durrok3.py` | Durrok victory still `.scratch/victory-warp/waveB/durrok_win3.png`. | `.scratch/r24-durrok-regrade/durrok-120651-rg3.png` |
| `vortigal3.py` | Vortigal victory still `.../vortigal_win3.png`. | `.scratch/matte/vortigal.png` |
| `skitter-proc.py [outdir]` | Procedural skitter fx variants and `sheet.png`. | none |

Approvals (art-director, 2026-11-22), kept beside the outputs: wave A `.scratch/victory-warp/waveA/approval.json`
(sindarosa, curomo, rokcore); wave B `.scratch/victory-warp/waveB/approval.json` (nykra, hyalia, brazgor; abyssor REVISE);
Kindrel/Treenoc `.scratch/victory-warp/approval.json` (kindrel approved, treenoc REVISE). Durrok/Vortigal wave C/D and skitter
approvals are not covered by these files.

Check: `wb.py brazgor` then `fix.py brazgor` reproduces the approved `brazgor_win.png` byte for byte.
