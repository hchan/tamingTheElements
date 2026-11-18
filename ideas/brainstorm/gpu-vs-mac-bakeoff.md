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

## Results

### 4060 side, job 1 variant (SDXL base 1.0, not Turbo), measured during the roster24 redo (2026-11-17)

Not a like-for-like bake-off yet (no Mac numbers; the Mac was under heavy load). fp16, `enable_model_cpu_offload` (8 GB card), 28 steps, CFG 6.5, 1024x1024, batch 1, CUDA.

| Run | Images | Median s/image | Range | Total | Model load |
|---|---|---|---|---|---|
| roster24 round 1 | 48 | 18.3 | - | 908 s | 6.3 s |
| roster24 round 2 | 40 | 18.5 | 18.1 to 24.5 | 773 s | 6.5 s |
| roster24 round 3 | 28 | 18.95 | 18.3 to 59.4 (one stall) | 611 s | 4.6 s |

- Peak VRAM (torch): 5334 MB allocated, 7482 MB reserved. `nvidia-smi` reads only ~195 MB after a step with offload, so use torch peaks, not smi.
- GPU temperature stayed at or below 50C during round 3 (stop limit 83C). Prompts and seeds: [roster24-redo-candidates](roster24-redo-candidates.md).
- Still to do: the same seeds on the Mac (MPS), and the other five jobs above.

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

## Results: CPU and e2e offload (2026-11-17, sonnet agent)

Scope: only the non-art jobs (4 to 6 above). Run with `tools/dev/remote-run.sh` (committed on branch `remote-run-offload`; host details live in the Mac's `~/.ssh/config`, not in the repo). Image-generation jobs (1 to 3) were not timed here.

PC: AMD Ryzen 5 7600X (6 cores, 12 threads), 23 GB RAM visible inside WSL2 Ubuntu, Node 22 via nvm, Playwright chromium/firefox/webkit installed without system deps. The PC was NOT idle: another agent's image-generation job was running (load 6 to 11 during these runs), and the Mac load was 11 to 50 (see caveat). Neither side is a clean idle number.

| Job | PC (3 runs) | Mac (3 runs) |
|---|---|---|
| `pnpm test` | 88 / 83 / 79 s | 63 / 61 / 63 s |
| `vitest --project dom` | 5.1 / 4.2 / 3.8 s | 3 / 4 / 3 s |
| `sim:match --tournament --json` | 1.3 / 1.4 / 1.0 s | about 1 s |
| 12-spec e2e subset, 1 worker (152 tests) | 19.5 and 20.2 min, 1 failure each | 17.6 min at Mac load about 50, 0 failures (1 run) |
| FULL `pnpm e2e` (675 tests) | 1.93 h: 659 passed, 16 failed | not run |

Mac caveat: Mac load was 11 to 20 for the unit runs and about 50 for the subset, so the Mac e2e figure is inflated and the unit figures are slightly inflated. The Mac still won the CPU-bound unit runs, so a 7600X under a concurrent GPU job is not faster than the Mac for `pnpm test`.

### Full e2e on the PC: 16 failures

Under SwiftShader with 1 worker the PC is not faster and fails more. A rerun of the failing specs in isolation still failed 13 of 78 tests, so most of these are NOT just load:

- hud-polish-r77 (568x320 hit counter), hud-text-clear (390x844 and 360x640, two tests), manual-fx-age (white damage pop), picker-bar (three Versus 2v2 tests), playtest-replay (record/verify; tampered-replay also failed on rerun), portrait-play (3v3 Tag buttons, melee nine-tile bar): fail in isolation or with `waiting for element to be visible, enabled and stable` / `page.screenshot` timeouts. Treat as real PC-environment differences (font metrics, SwiftShader on WSL, slower layout) until shown otherwise. Likely candidates for a PC-specific tolerance or a real bug on the Mac that its faster layout hides.
- online-match (three variants), online-relay (two tests), online-leave: two-context relay specs; timeouts under load, partly reproduced on rerun.

Passed on the Mac subset but 1 test failed on the PC in both subset runs, consistent with the above.

### Routing recommendation

- Unit, dom, sim: stay on the Mac (equal or faster, no transfer cost).
- Full e2e: usable on the PC to take a 2-hour job off the Mac, but results are not gate-equivalent yet. Use it as a background second opinion, and judge the 16 failures against a Mac run of the same specs before trusting or fixing them.
- Mac e2e is not slower per test than the PC; the benefit is freeing the Mac CPU, not speed. Best use is the night window or when the Mac load is high.
- Image generation: still to measure (jobs 1 to 3).
- Do not run PC e2e while the other agent's GPU job runs; both share 12 threads.

Long gate on the PC (the commit must be on origin):
`TTE_REMOTE=<alias> tools/dev/remote-run.sh -c <commit> -e E2E_PORT=7960 -- 'corepack pnpm lint && corepack pnpm typecheck && corepack pnpm depcruise && corepack pnpm test && corepack pnpm exec vitest run --project dom && corepack pnpm test:legacy && corepack pnpm build && corepack pnpm e2e'`
