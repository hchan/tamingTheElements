---
name: decision-sheets-cpu
description: 2026-11-18 CPU-only decision contact sheets built in worktree art-decision-sheets; owner verdicts still pending
metadata:
  type: project
---

Built three side-by-side sheets (apply-cleanups, fix-residuals, pose-transform) in /Users/henry.chan/tamingTheElements/.claude/worktrees/art-decision-sheets/.scratch/ (build.py, decisions.md). Nothing committed or put in public/. Owner verdicts: none yet (show in chat, wait for owner's own message).

**Why:** hero-art rule needs original vs new in chat before any apply/rig.
**How to apply:** `main` is checked out in the primary tree, so use `git worktree add --detach <path> main`. Pillow via ~/claudetmp/venv-cut/bin/python -I. Tiles of ~275px lose fringe detail; a 3840px contact strip must be split in halves to stay readable under 2400 px. Noted defects: vortigal candidate heavy white rim; cyclonius victory poses have a stray vertical line; lavax candidate leaves white specks near feet.
