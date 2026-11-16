# wispera-art

Scripts behind the 2026-11-16 Wispera dark-fantasy redo candidates (nothing here is shipped; public/assets and the rig are untouched until the owner approves a swap).
Run with a venv that has diffusers + torch (SDXL-Turbo from the local HF cache, `HF_HUB_OFFLINE=1`) and Pillow + numpy.
Scripts still read and write `~/claudetmp/wispera-redo/` (cand2/e_8.png is the owner-picked base, ref/ the img2img refinements).

- `gen_candidates.py`: text2img candidates (round 2: d/e/f prompts; e_8 is candidate A).
- `cut_candidate.py`: background cut by distance from the dark backdrop.
- `refine_img2img.py`: img2img from e_8 at strengths 0.45-0.75.
- `refine_cut.py SRC OUT [seed] [cloud]`: cut + procedural tattered storm cloud + core placed at (190,225) in a 400x400 canvas (the portrait-rig spec glow point).
