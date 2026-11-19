---
name: creature-normalise-sheet
description: 2026-11-18 normalised isnet creature cutouts (512 canvas, size classes) plus contact sheet vs released originals; script, table, oddities, verdict pending
metadata:
  type: project
---

Worktree `.claude/worktrees/hero-art-norm` (branch hero-art-norm, uncommitted). Script `tools/assets/roster24-art/normalise-creatures.py` (numpy+PIL, venv-rembg, CPU) writes `.scratch/norm/<id>.png` and `.scratch/norm/sheet.png`. Size-class table is in the script docstring (large 470x400: durrok quarrak brazgor abyssor ouroth; medium 400x340: nykra vortigal umbrel; small 300x260: kindrel hyalia). Flipped: durrok, vortigal. Ouroth `_right` files already face right. Everything ended height-limited (cutouts are near-square), so the class is effectively a height: 400/340/260 px.

**Why:** feeds the owner contact sheet (new vs released). Owner verdict: pending, nothing shown in chat yet by me.
**How to apply:** floaters (vortigal, hyalia, abyssor, ouroth) sit on the baseline by lowest solid pixel, not ground contact. 13 released heroes exist (eternalVoid is the 13th), sheet shows all 13. Originals drawn at native 400px scale, so class heights are directly comparable. Solid bbox uses alpha>=96 with >=3 px per row/col because raw alpha bbox is the full canvas (faint stray alpha).
