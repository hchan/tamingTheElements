# wispera-art

How Wispera's painted portrait `public/assets/img/map/wisperaLarge.png` (400x400, the owner-picked "Refined 2", 2026-11-16, WP WISPERA-R2)
was made. It replaces the legacy painting (tag `legacy-crafty-1.0`); `tools/assets/build-assets.ts` never copies the legacy file over it (`REDRAWN`).

## Provenance chain

1. `gen_candidates.py`: SDXL-Turbo (`stabilityai/sdxl-turbo`, fp16, mps, 4 steps, guidance 0) text2img; candidate A is `e_8`
   (`imgWorkArea/portrait-src/wispera/e_8.png`).
2. `refine_img2img.py`: SDXL-Turbo img2img of `e_8`, strength 0.6, 5 steps, guidance 0, i=3, seed 4400+3*17+60 = 4511
   (`imgWorkArea/portrait-src/wispera/r60_3.png`).
3. `refine_cut.py SRC OUT [seed] [cloud]`: cut + procedural storm cloud + core placed at (190,225) in a 400x400 canvas (the portrait-rig spec glow point).
   Seed 8, cloud 1.0 (default):

```sh
~/claudetmp/venv-rig/bin/python -I tools/assets/wispera-art/refine_cut.py \
    imgWorkArea/portrait-src/wispera/r60_3.png public/assets/img/map/wisperaLarge.png 8
md5 -q public/assets/img/map/wisperaLarge.png   # fda087d6783593314aa211d79a97ceb0
```

The diffusion steps (SDXL-Turbo on mps) are not bit-reproducible across machines; the cut (numpy + Pillow only) is, so the committed
`r60_3.png` is the input of record. `cut_candidate.py` was the earlier cut of the text2img candidates.

Scripts read and write the work dir `$WISPERA_ART_DIR` (default `.scratch/wispera-art`); `WISPERA_LOG` optionally names a progress log.
The diffusion steps need a venv with diffusers + torch (SDXL-Turbo from the local HF cache, `HF_HUB_OFFLINE=1`). SDXL-Turbo's output
licence terms are not asserted here; the owner is to confirm them.
