---
name: released-hero-audit
description: 2026-11-18 static audit of the 13 released heroes' Large PNGs; where the report and crops live, top artefacts
metadata:
  type: project
---

Audit done 2026-11-18 in worktree `.claude/worktrees/hero-art-audit` (branch hero-art-audit, uncommitted, scratch only): `.scratch/audit/REPORT.md` plus 23 crops and `crop.py`. Owner verdict: pending.

Findings: 13 released heroes (not 12; eternalVoid counts). Quick wins: cyclonius "TIS" text and ink arcs, lavax blue fringe, rokcore stray black/navy strokes. Bigger: eternalVoid mist clipped by canvas bottom/left plus hard ellipse seam; treenoc black voids; fiara 58% semi-alpha smear. sindarosa and curomo are the clean reference cutouts.

**Why:** the idea file hero-art-audit-2026-11-15.md covers the 12 UNRELEASED heroes; the task text can mean the released ones, so check which set is meant.
**How to apply:** any fix to released art needs original vs new side by side in chat first. Environment has no numpy (PIL only); run `python3 -I`.
