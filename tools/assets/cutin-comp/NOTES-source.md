# r24 cut-in composites (CPU/PIL, preview only, 2026-11-23)
Script: .scratch/r24-cutin-comp/comp.py (run from .scratch with `~/claudetmp/venv/bin/python -I r24-cutin-comp/comp.py cfg`); per-hero flip/placement in cfg.json.
Key: |rgb-128|>12, open/close cleanup (as waveB/fix.py), umbrel also drops low-chroma grey shadow residue (desat=24). No ground plate, no shadow. Heroes flipped to face right where the matte faced left (brazgor, nykra, vortigal, zephra), x centre 0.46 W.

| hero | backdrop (batch-r8, art-director 2026-11-19) | subject matte |
|---|---|---|
| abyssor | fetch-de9c/out/cutin_r24_abyssor_53062 | matte/abyssor-96322.png |
| brazgor | fetch-8e3c/out/cutin_r24_brazgor_53010 | matte/brazgor-96003.png |
| durrok | fetch-8e3c/out/cutin_r24_durrok_53041 | r24-durrok-regrade/durrok-120651-rg3.png (grey bg, keyed the same) |
| glimmaw | fetch-de9c/out/cutin_r24_glimmaw_53083 | matte/glimmaw-96303.png |
| hyalia | fetch-8e3c/out/cutin_r24_hyalia_53030 | matte/hyalia-96433.png |
| kindrel | fetch-8e3c/out/cutin_r24_kindrel_53003 | matte/kindrel2.png |
| nykra | fetch-de9c/out/cutin_r24_nykra_53072 | matte/nykra-94301.png |
| ouroth | fetch-5d25/out/cutin_r24_ouroth_53111 | matte/ouroth-95402.png |
| quarrak | fetch-de9c/out/cutin_r24_quarrak_53052 | matte/quarrak-96214.png |
| umbrel | fetch-de9c/out/cutin_r24_umbrel_53091 | matte/umbrel-96104.png |
| vortigal | fetch-9647/out/cutin_r24_vortigal_r2_53122 | matte/vortigal.png |
| zephra | fetch-8e3c/out/cutin_r24_zephra_53020 | matte/zephra-120803.png |

All 12 sources found; no hero skipped. Backdrop choice: the newest approved batch-r8 file per hero (r24-cutin-a / r24-cutin-b-wm3 / ouroth in approval-75a0-5d25.json / vortigal in approval-wispera-r2r3-vortigal-r3.json); the earlier 5xxxx batch approvals (batch-r8/approval-cutin-r24.json) were not used.
Caveats: durrok is a front-3/4 elephant-like stance and umbrel is frontal, so "facing in" is approximate; alpha edges are hard-keyed with a 1.2 px blur, no colour decontamination.

## Round 2 (2026-11-23, CPU; art-director approval.json: 6 approved unchanged, 6 revise)
Approved and left unchanged: abyssor, glimmaw, hyalia, quarrak, kindrel, vortigal (optional vortigal island removal and kindrel 1px erode not applied).
Script: comp_r2.py (same sources as round 1). Outputs: cutin_comp_<hero>_r2.png for the 6 below, contact_sheet_r2.png (all 12, approved ones unchanged).
- brazgor: islands <300px dropped, interior alpha holes <3000px filled, 2px erode, edge colour replaced by propagated interior colour (5px band).
- nykra: 2px erode, edge colour decontaminated (6px band), alpha blur 2px for a soft mane, holes <1500px filled.
- ouroth: 2px erode + 6px edge decontaminate; holes <1500px filled (larger coil gaps stay open and show the backdrop).
- umbrel: low-chroma (<30) grey cut, alpha cut below 97.5% of the source height, islands <800px dropped, holes <150px only (keeps tentacle curls open), 2px erode, 2px feather, soft purple-black contact ellipse.
- zephra: soft key (alpha ramps from distance-to-grey 3..22, thr 5), islands <600 and holes <6000 filled, 0.8px blur. Head and muzzle now intact; legs read solid. Not hard-keyed.
- durrok: islands <900 dropped, 1px erode, 1.5px blur, desaturate 30% toward grey, warm-brown multiply at 50%, fine grain, dark brown contact ellipse. Caveat: the pale tail-tip tuft at the left rear leg is attached to the body so it stays; the blob by the foot is gone.

## Round 3 (nykra only, CPU)
Round 2 verdict: 5/6 approved (brazgor, ouroth, umbrel, zephra, durrok); nykra REVISE 3.5. Output: cutin_comp_nykra_r3.png, contact_sheet_r3.png (other 11 unchanged).
- Edge colour re-decontaminated over a 10 px band (tail and mane) from interior colour.
- In that 10 px band, low-chroma (<40) pixels with luminance > 0.55 are dropped (pale patches at tail tip and left of the mane), then islands <300 px dropped.
- Hind-leg gap: filling holes < 3000 px (as asked) was tried first and made it WORSE: the gap is background grey in the matte, so filling it paints flat grey. Final r3 uses no hole fill (holes=0) so the gap shows the backdrop. The grey was the fill, not a key hole.
- Residual: the tail tip is still slightly pale where it fades out; flag if the director wants it harder.
