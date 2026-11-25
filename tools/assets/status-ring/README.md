Status-ring plates (freeze, daze) in public/assets/img/fx/status/ are AI-generated own work (no third-party art), keyed and regraded by
`key-rings.py` and resized to 128x128 RGBA by `integrate.py`; art-director APPROVE on 2026-11-24 (`public/assets/img/fx/status/approval.json`).
Licence: same as the other own-work fx art (see tools/assets/fx-gen/license.txt).

Both scripts read plates from `.scratch/` directories that only existed in the art session's worktree (gpu-job-server) and are not in
the repo, so they cannot be re-run from a clean clone; the shipped PNGs are the source of truth.

Wiring: src/game/fx/status-ring-art.ts (lazy load, procedural fallback), pinned by tests/repo/status-ring-art.test.ts.
