# Art generation efficiency rules (owner agreed 2026-11-19; permanent, survives context compaction)

Cause: the bottleneck is approval yield and turnaround, not 4060 speed (weather 0/97, fc86 0/54, 6d97 0/24 approved).

1. **Probe small.** A new prompt template starts with 4 seeds per prompt, not 12. Scale to 12+ (bulk, 23:00-07:00) only after one image passes the art-director.
2. **Pre-filter before review.** Run `~/claudetmp/venv/bin/python -I tools/assets/roster24-art/prefilter.py <fx|hero> <dir> [--keep N] --json <file>` on every fetched batch. Only PASS files go on the contact sheet for the art-director (top 12-16). Say the pass count in the report.
3. **Short before long.** The 4060 queue is FIFO (reorder needs the admin token). Submit fast t2i regens before long ControlNet/i2i runs (60+ min).
4. **Queue revises at once.** On every REVISE verdict write the queue JSON from the verdict's prompt/negative/seed changes, validate with `gpu-queue.py --dry-run --no-files`, `gpu:submit` immediately, and note the revise in the idea file under `ideas/` (Progress note) so a lost session does not lose it.
5. **Batch the review.** Send several finished batches to the art-director in one call.
6. **Group by kind** (t2i, cn, i2i) to avoid model reloads; reuse approved templates (black-bg fx, CN icons) as night bulk runs instead of re-exploring.
7. **Mac load.** Cap builder agents at 2-3 at once while load is above the core count (14); e2e never falls back to the Mac on an agent's say-so; run gates at night or when load drops.
8. **Free assets first** for icons, UI frames, textures (CC0/CC-BY only; see licence policy). Generate on the 4060 only for gaps (heroes, environments). The free icon path got six approvals in one pass.
9. **Ring/decal/overlay art needs a keying step.** Textured plates cannot ship raw: write the radial-mask + luminance/hue key script first, then judge the keyed result. Prompt "top-down ... pure black background" plus a ring ControlNet control.
10. **Do not hold builders on e2e.** Builders run `e2e:smoke` + touched specs via the router once; if the router waits on "PC busy", report and let the nightly run be the net. Never force the Mac.
11. **Merge approved work.** Art-director-approved uncommitted worktrees (trap decal, telegraph, icons) get gate + /full-review next, then wait for the owner's explicit commit ask. Do not leave them idle.
12. **Fewer check-ins.** The keep-fed check only needs action when running+queued < 2 or a job finished; otherwise answer in one line.
13. **Two failed rounds on a slot = change method, not seeds.** Ladder: free CC0 asset + regrade, then i2i/ControlNet from a silhouette, then procedural Phaser particles. Record rounds per slot in the yield ledger (`tools/assets/roster24-art/yield-ledger.py`). Evidence: families reusing an approved template pass 60-100%; new families start at 0; hurl_rock, lure_orb, skitter failed 4 rounds (plan: .scratch/plans/art-yield-plan.md).

See also: [art-autonomy.md](art-autonomy.md) (art-director approves; owner delegated).
