---
name: unreleased-candidate-audit
description: 2026-11-18 audit of the 12 unreleased roster24 candidate cutouts (not the scrapped in-repo art); which cutout set works and per-hero problems
metadata:
  type: project
---

Done 2026-11-18 in worktree `.claude/worktrees/hero-art-audit-unreleased` (branch hero-art-audit-unreleased, uncommitted): `.scratch/audit-unreleased/REPORT.md`, crops, `metrics.py`, `crop.py`. Owner verdict: pending.

Findings: isnet cutouts (`art-roster24-sheet/.scratch/cutout2/isnet`) are the best set; v1 rembg left brazgor and kindrel 100% opaque; u2net drops ouroth's head. Zephra is a brush-stroke swirl with no creature and no cutout works. Ouroth keeps a grey ellipse; hyalia tendrils chopped; vortigal grey talon patches. Facing mixed (durrok, vortigal, ouroth face left); all cutouts are about 1000 px regardless of creature size. No glimmaw candidate exists. Clipping metrics on tight crops are meaningless.

**Why:** the 2026-11-15 idea file verdicts describe the scrapped in-repo art, so do not reuse them.
**How to apply:** start any recut from isnet; see [[released-hero-audit]] for the released set. PIL only, `python3 -I`.
