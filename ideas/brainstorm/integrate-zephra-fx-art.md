---
status: idea
added: 2026-11-26
---

# Integrate approved Zephra fx (3 swaps) via the per-hero installer table

Art session (2026-11-26): art-director round 2 APPROVE 4 each, beats_shipped true. Sources (art worktree `.claude/worktrees/gpu-job-server/.scratch/zephra-fx/`, approval `approval-r2.json`, skitter also in `approval.json` there):
- `staticMote.png` 80x80 RGBA -> `public/assets/img/fx/staticMote.png` (sha256 prefix 6db8da55)
- `skitter.png` 80x80 RGBA -> `public/assets/img/fx/skitter.png` (sha256 prefix 1d196740; downscaled from the approved procedural candidate `skitter-proc2/skitter-proc-1.png`)
- `staticMoteLoop.png` 1280x160, 8 frames of 160x160 -> shipped `staticMoteLoop` (same size; check the frame size in the manifest) (sha256 prefix 63b65610)
Generator `tools/assets/roster24-art/zephra-mote-proc.py` is an untracked copy in the art worktree (its `mote.py`; the skitter step reads `.scratch/skitter-proc2`): copy it into the repo for provenance if it is self-contained.
Watch item: the mote may read spider-like at tiny sizes; keep the flecks.

Do after the Ouroth wyrmCoil builder merges (it generalises `tools/assets/integrate-kindrel-art.ts` into a per-hero table; one builder at a time on that shared file). Then add Zephra entries, sha pins and credits, contact sheet for the art-director.

Also from the art session: Abyssor bundle has no real swaps (KO r7 and cut-in identical, Large differs only in alpha 1-7, keep shipped); gaps: tentacleLash icon and abyssalPull/tentacleLash fx never approved, no Maelstrom icon. nykra, glimmaw, durrok bundles still building.
