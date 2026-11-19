# Art generation efficiency rules (owner agreed 2026-11-19; permanent, survives context compaction)

Cause: the bottleneck is approval yield and turnaround, not 4060 speed (weather 0/97, fc86 0/54, 6d97 0/24 approved).

1. **Probe small.** A new prompt template starts with 4 seeds per prompt, not 12. Scale to 12+ (bulk, 23:00-07:00) only after one image passes the art-director.
2. **Pre-filter before review.** Run `~/claudetmp/venv/bin/python -I tools/assets/roster24-art/prefilter.py <fx|hero> <dir> [--keep N] --json <file>` on every fetched batch. Only PASS files go on the contact sheet for the art-director (top 12-16). Say the pass count in the report.
3. **Short before long.** The 4060 queue is FIFO (reorder needs the admin token). Submit fast t2i regens before long ControlNet/i2i runs (60+ min).
4. **Queue revises at once.** On every REVISE verdict write the queue JSON from the verdict's prompt/negative/seed changes, validate with `gpu-queue.py --dry-run --no-files`, `gpu:submit` immediately, and note the revise in the idea file under `ideas/` (Progress note) so a lost session does not lose it.
5. **Batch the review.** Send several finished batches to the art-director in one call.
6. **Group by kind** (t2i, cn, i2i) to avoid model reloads; reuse approved templates (black-bg fx, CN icons) as night bulk runs instead of re-exploring.
7. **Mac load.** Cap builder agents at 2-3 at once while load is above the core count (14); e2e never falls back to the Mac on an agent's say-so; run gates at night or when load drops.
