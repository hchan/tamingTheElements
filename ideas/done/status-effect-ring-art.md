---
status: done
added: 2026-11-19
---

# Status-effect ring art (burn, haste, heal, snag, slow, freeze, daze, speed, tide, guard)

## Progress note 2026-11-19
- Round 4 (slow, freeze; job 7edd): prefilter 0/8, background not black.
- Round 5 (daze, speed, tide; job 0491): prefilter 0/12 raw; keyed with key.py satlum, still 0/12 (background not transparent). Wrong key method for these plates, or plates are not ring-shaped.
- Rule 13 (two failed rounds = change method): slow, freeze, daze, speed, tide move to the ladder's next rung. Next: radial/hue key per plate, else a procedural Phaser particle ring (no 4060). Guard and snag (4ac7) still running.
- Earlier approved/conditional set: burn 45200, haste 45502, heal 45400, snag 45600 (art-director, `.scratch/status-fx/approval-8171.json`).

## Done 2026-11-22
Rings are Graphics-only on main (5d3f85aa: src/game/fx/status-ring.ts, status-ring-view.ts). Coordinator decision (Gate 0): NO PNG decals in public/, matching the 2026-11-21 decision. Approved decals exist, not shipped: art-director approved freeze, tide, slow and daze from `tools/assets/status-rings/make-proc-rings.py` (kept in the repo so it survives worktree cleanup; speed stayed Graphics-only). Guard ring is tracked separately.
