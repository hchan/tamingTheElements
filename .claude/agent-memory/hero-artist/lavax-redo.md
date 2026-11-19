---
name: lavax-redo
description: 2026-11-18 Lavax blue cleanup redo (hue mask + sampled colour, no inpaint); candidate built, owner verdict pending
metadata:
  type: project
---

Lavax's blue is saturated matte-key blue (mouth/eyes, knuckle blotches, rim fringe), not lava glow. Telea inpaint left blotches; what worked: hue mask (165-310 deg, S>0.2) + 1px cool-halo grow, then normalised-convolution colour from good interior pixels (sigma 3/6/12), olive-to-brown warming, median fix for lone bright/green pixels, face blue replaced by an ember radial glow. Alpha kept except 27 tiny islands removed (135 alpha px).

Script: tools/assets/hero-audit/lavax-fix.py in worktree .claude/worktrees/lavax-redo (branch lavax-redo, uncommitted). Candidate and sheet in its .scratch/lavax-redo/. Owner verdict pending; nothing in public/.

Remaining defects: knuckle rim is desaturated grey-brown (original was blue-grey), faint green-ish dotted rim on knuckles, a few single light pixels near right knuckles/left foot, face glow is a recolour (invented), top-of-head cream fringe still slightly noisy.

**How to apply:** show sheet in chat before any copy into public/.
