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

## Status 2026-11-17 (SD benchmark, round 1): script ready, nothing timed yet

Script: `tools/bench/sd-bench.py` (`--device cuda|mps --job sdxl|turbo1|turbo4|sd15|img2img [--offload] [--slicing] [--init png]`). Cold load, 1 discarded warm-up, 5 timed runs with device sync, median/min/max, peak memory, cuda power/temperature via nvidia-smi (aborts above 83 C). Mac power needs `powermetrics` (sudo), so it is not measured.

Why no numbers:

- Mac: load average was 19 to 30 (limit 12) and the Mac venvs have no torch/diffusers. Official fp16 weights: SDXL base about 7.1 GB, SDXL-Turbo about 6.9 GB (components), sd-turbo about 2.6 GB. Base plus Turbo is about 14 GB, over the 10 GB stop rule, so no download was started. Owner decision needed: allow ~14 GB, or restrict to SDXL-Turbo + sd-turbo (about 9.5 GB).
- PC: GPU busy with the round-3 generation (`gen4.py`, 22 % util, 1.8 GB used, 33 C), so it was not touched. The PC's SDXL-Turbo and SDXL base are already cached in WSL (per earlier bake-off); only the bench script must be copied over.

Remaining to run (PC, when idle): `sdxl` with and without `--offload`, `turbo1`, `turbo4`, `sd15`, `img2img --init <concept.png>`. Mac: the same jobs with `--device mps` (also try `--slicing`), after the downloads are approved and load is under 12. Only the PC figure known so far: SDXL base 1024x1024, 28 steps, offload on, median 18.5 s per image (18.1 to 24.5), load 6.5 s, peak allocated 5.3 GB.

### Results

| job | Mac median | PC median | ratio | memory | winner |
|---|---|---|---|---|---|
| SDXL base 28 steps 1024 | not measured | 18.5 s (offload) | - | PC 5.3 GB | - |
| others | not measured | not measured | - | - | - |

Routing rule: none yet; no honest comparison exists. Prior expectation only (unmeasured): a discrete 8 GB CUDA card beats M4 Pro MPS for SDXL generation.
