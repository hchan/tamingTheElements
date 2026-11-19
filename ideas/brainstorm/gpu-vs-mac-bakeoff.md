---
status: idea
added: 2026-11-17
---

# Bake-off: RTX 4060 PC vs the Mac (M4 Pro) for heavy jobs

Owner, 2026-11-17: "don't forget the bake-off of 4060 speed vs this mac". Decide with numbers which machine runs which job, instead of guessing (see [remote-gpu-offload](remote-gpu-offload.md)).

## Jobs to time (same inputs and seed on both machines, 3 runs each, report median and spread)

1. SDXL-Turbo image generation: 4 steps, 512x512 and 768x768, batch 1 and 4 (Mac uses MPS, PC uses CUDA fp16). Report seconds per image and peak memory.
2. img2img on one existing hero concept (same strength and seed).
3. Sprite bake / sheet build (`pnpm` asset bake of one hero) wall time.
4. `pnpm sim:match --tournament --json` (CPU only; the Mac probably wins, and the PC's CPU tells us if it can host sims).
5. Short e2e subset (about 10 specs, 1 worker): wall time and flake count.
6. Model load (cold start) time and disk-to-GPU time, since it dominates short jobs.

## Method

- Idle both machines first (record load average / GPU utilisation); no other agents during a timing run.
- Script lives in `tools/` (no host, IP, user or key path committed; connection details stay in memory).
- Output a table: job, Mac median, PC median, ratio, and a one-line routing rule ("generation -> PC, e2e -> Mac" or similar).
- Needs the owner's per-session OK for the GPU PC (roster24 plan gate).

## Open questions

- Is the power cost a factor (PC draw vs Mac) for the night window?
- Does the PC's WSL2 overhead change file-heavy jobs (bake) versus the Mac's native disk?

## Status 2026-11-17 (SD benchmark, round 2): PC timed, Mac official runs pending

Script: `tools/bench/sd-bench.py` (`--device cuda|mps --job sdxl|turbo1|turbo4|sd15|img2img [--offload] [--slicing] [--init png]`; env `BENCH_EMPTY_CACHE=1` calls `empty_cache` after each timed run; set `PYTORCH_CUDA_ALLOC_CONF` for allocator tests). Cold load, 1 discarded warm-up, 5 timed runs (3 for sdxl without offload) with device sync, median/min/max, peak allocated and (cuda) peak reserved memory, cuda temperature (aborts above 83 C). sd15 is sd-turbo (20 steps, cfg 7). Mac power is not measured (needs sudo `powermetrics`).

Mac: weights downloaded (about 14 GB, outside the repo); official timed runs done 2026-11-18 09:30 at load about 4 (Mac `--slicing` and offload not tried; Mac power not measured).

### Results (Mac M4 Pro MPS fp16, official runs 2026-11-18 at load about 4, all jobs completed with no failures or out-of-memory errors, walls 21, 43, 37, 16 and 345 s including load; PC = RTX 4060 8 GB, WSL2, fp16; seconds per image, median of 5 unless noted)

| job | Mac median | PC median | ratio | memory (PC) | winner |
|---|---|---|---|---|---|
| SDXL base 1024, 28 steps, no offload | 56.1 s (55.7 to 56.2) | 41.3 s (3 runs; spills over 8 GB) | - | 10.7 GB alloc, 14.5 GB reserved (Mac 18.0 GB) | PC with offload, 2.9x (next row) |
| SDXL base 1024, 28 steps, offload | n/a (Mac runs without offload) | 19.3 s (19.1 to 24.0) | PC 2.9x faster (vs Mac 56.1 s) | 5.3 GB alloc, 7.5 GB reserved | - |
| SDXL base offload + expandable_segments + empty_cache | n/a | 20.0 s | - | 5.2 GB alloc, 5.4 GB reserved | - |
| sdxl-turbo 512, 4 steps, batch 1, no offload | 1.49 s | 3.97 s | - | 7.9 GB alloc (Mac 9.5 GB) | Mac, 2.7x |
| sdxl-turbo 512, batch 1, offload | n/a | 3.51 s (first run 13 s) | - | 5.1 GB | - |
| sdxl-turbo 512, batch 4, no offload | 1.38 s/img (5.53 s per batch) | 7.28 s/img (29.1 s per batch; spills) | - | 10.7 GB alloc (Mac 15.7 GB) | Mac, 5.3x vs PC without offload |
| sdxl-turbo 512, batch 4, offload | n/a | 1.78 s/img (7.1 s per batch) | - | 5.2 GB | Mac 1.3x (1.38 vs 1.78 s/img) |
| sd-turbo ("sd15") 512, 20 steps | 5.20 s | 1.83 s | - | 3.1 GB (Mac 4.5 GB) | PC, 2.8x |
| img2img sdxl-turbo 512, strength 0.5, no offload | 1.16 s | 2.85 s | - | 7.9 GB (Mac 9.5 GB) | Mac, 2.5x |
| img2img, offload | n/a | 3.89 s | - | 5.3 GB | - |

Findings (PC, plus Mac comparison in the routing rule):

- 8 GB is the binding constraint. Anything whose peak allocation exceeds about 8 GB (SDXL base without offload, turbo batch 4 without offload) spills into Windows shared memory and runs 2 to 4 times slower. Use `--offload` for SDXL base and for batches.
- `expandable_segments:True` plus `empty_cache` on sdxl-offload costs about 0.7 s per image (20.0 against 19.3 s, within spread) but cuts reserved memory from 7.5 GB to 5.4 GB, almost equal to the allocated peak (5.2 GB). That is the setting to use if anything else needs the GPU.
- Peak allocated for sdxl-offload is about 5.3 GB and for turbo1 offload about 5.1 GB, so the two do NOT fit together in 8 GB (about 10.4 GB). A turbo1 without offload (7.9 GB) cannot share the card with anything.

Two-at-once tests. The first attempt overlapped another agent's e2e and is discarded. Re-run after the e2e finished (load was falling, about 2 at the start; the PC was otherwise idle, free RAM stayed above 13 GB):

| pair | per-process median | wall | peak VRAM (nvidia-smi) | verdict |
|---|---|---|---|---|
| 2x turbo1, no offload | 41.6 s and 40.8 s per image (alone: 4.0 s) | 315 s | 7.9 GB; each process reserved 9.0 GB | about 10x slower per image, total about 3 images/min against 15 alone: do not |
| sdxl offload + turbo1 offload, expandable_segments + empty_cache | sdxl 49.7 s (runs 221, 308, 50, 21, 20 s; alone 20 s); turbo1 49.9 s (215, 50, 219, 39, 6 s; alone 3.5 s) | 811 s | 7.9 GB (allocated peaks 5.2 + 5.0 GB, over 8 GB combined) | fits only by thrashing; each job only reaches full speed once the other finishes |

Conclusion: the 8 GB card is one job at a time. Do not run two generation processes together. Total throughput with two at once is worse than running them back to back. (Small caveat: the two-at-once runs overlapped other load only at the start; the 2x turbo1 result matches the earlier contaminated one, so VRAM spill, not CPU, is the cause.)

### Routing rule

- SDXL base 1024 (and any model whose peak is over about 7 GB, or that needs a big batch footprint) -> PC with `--offload` (19 s against 56 s on the Mac).
- SDXL-Turbo and img2img at 512, single or batched, and sd-turbo-style small jobs: Turbo is faster on the Mac (1.2 to 1.5 s against 2.8 to 4 s, and no VRAM limit; batch 4 1.38 s/img against 1.78 s offloaded). The exception is sd-turbo 20 steps, where the PC is 2.8x faster (1.83 against 5.20 s).
- Rule of thumb: many-step UNet work (SDXL base, sd-turbo 20 steps) -> PC; few-step SDXL-Turbo (4 steps) -> Mac, because the 8 GB card must offload or spill.
- On the PC run one job at a time (measured: 2x turbo1 about 10x slower per image; sdxl + turbo1 offload thrash); queue instead.
- Memory: Mac peaks 9.5 GB (turbo), 15.7 GB (turbo batch 4), 18.0 GB (SDXL base); fine with unified memory but it competes with agents/e2e, so avoid running those at once on the Mac.

## Progress note 2026-11-19 (owner: "you decide", be autonomous)
Mac official runs were already done 2026-11-18 (table above), so nothing is pending on the Mac half. Licence decision: SDXL-Turbo weights are used only for timing and internal exploration, never for shipped art (shipped art comes from SDXL base on the 4060). Routing rule above stands. Approval of art: the art-director agent verdict is the approval gate (owner, 2026-11-19).
