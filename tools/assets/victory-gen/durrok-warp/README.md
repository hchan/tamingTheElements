# Durrok victory warp (CPU), provenance

Recipe that produced `durrok_win3.png` (trunk raised, one forefoot lifted), the init for the approved i2i r992
(durrok victory still, art-director APPROVE 4.2). Copied unchanged from the art session's scratch tree; paths in the
scripts are relative to a `.scratch/victory-warp` layout.

Run from a directory holding `warp.py`, `waveA/`, `waveC/`, `waveD/` (this folder) and the base image
`../r24-durrok-regrade/durrok-120651-rg3.png`: `python -I waveD/dd3.py --final`.
`waveD/trunk_comp.py` is the earlier rigid-rotation experiment (kept for reference). Needs numpy, opencv, scipy, Pillow.
The approved result and its approval are in `tools/assets/victory-gen/provenance/`. Not run by tests or CI.
