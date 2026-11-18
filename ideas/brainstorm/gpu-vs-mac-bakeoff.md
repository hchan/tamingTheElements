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
