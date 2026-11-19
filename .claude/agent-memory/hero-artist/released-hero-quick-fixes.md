---
name: released-hero-quick-fixes
description: 2026-11-18 candidate cleanups for Cyclonius, Lavax, Rokcore (script, what worked, approval pending)
metadata:
  type: project
---

Candidates only, worktree `.claude/worktrees/hero-art-fixes` (branch hero-art-fixes), script `tools/assets/hero-cleanup-fixes.py`, outputs and sheet in `.scratch/fixes/`. Run with `~/claudetmp/venv-cut/bin/python -I` (only venv with cv2). Nothing committed, nothing in public/assets. Owner verdict: none yet; do not replace released Large.png (and re-bake strips/variants) until the sheet is approved in chat.

What worked:
- Colour-masked cv2.inpaint inside small boxes removed the Cyclonius "TIS" and Rokcore navy foot line / black horn stroke cleanly.
- Lavax: erasing blue fringe alpha ate the silhouette and big-radius inpaint smeared the face. Hue-shifting blue to lava orange (V x0.75) keeps shape; blue mouth blob became a flat orange patch (may want texture).
- Cyclonius top arcs: black arc gone, faint blue ghost line remains on black.
