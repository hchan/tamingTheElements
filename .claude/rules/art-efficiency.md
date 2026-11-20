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
11. **Merge approved work.** Art-director-approved uncommitted worktrees (trap decal, telegraph, icons) get gate + /full-review next, then commit and merge locally (art-autonomy rule 4); no waiting for a commit ask. Do not leave them idle.
12. **Fewer check-ins.** The keep-fed check only needs action when running+queued < 2 or a job finished; otherwise answer in one line.
13. **Two failed rounds on a slot = change method, not seeds.** Ladder: free CC0 asset + regrade, then i2i/ControlNet from a silhouette, then procedural Phaser particles. Record rounds per slot in the yield ledger (`tools/assets/roster24-art/yield-ledger.py`). Evidence: families reusing an approved template pass 60-100%; new families start at 0; hurl_rock, lure_orb, skitter failed 4 rounds (plan: .scratch/plans/art-yield-plan.md).
14. **Method defaults (owner, 2026-11-19, permanent).** Measured yield was about 1 batch in 3. To raise it:
    - **New slot with an approved neighbour:** start i2i/ControlNet from that approved image (denoise 0.3-0.45), not t2i. New slot with no neighbour: t2i, 4 seeds, once.
    - **Put the art-director's recurring negatives in the first prompt** (no people, no lightning, no tiny fire, no cold blue, no cartoon look, no monochrome fog) and keep the director's REVISE prompt text; change the prompt, not only the seeds.
    - **Stop t2i after two failed rounds on a slot** and take the rule 13 ladder. Stuck slots (hurl_rock, lure_orb, skitter, slow, hoof_crash, talon_rake) go straight to the ladder.
    - **Never iterate an approved slot.** Two i2i rounds on approved montage 46102 and title 45932 only degraded them (director, 2026-11-19). Re-run an approved slot only for a stated defect, or when the director asks for a clearly better result; do not queue more rounds to fill the 4060.
    - **Keep-fed fills with unapproved slots**, never repeats of approved ones.

See also: [art-autonomy.md](art-autonomy.md) (art-director approves; owner delegated).
