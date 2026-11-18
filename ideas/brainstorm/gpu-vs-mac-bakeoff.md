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
