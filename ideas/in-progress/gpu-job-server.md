---
status: in-progress
added: 2026-11-18
---

# Shared GPU/CPU job server for the 4060 PC

Many sessions share one GPU PC. Today they use raw ssh and a hand-run `gpu-queue.py`, so two sessions can collide and nobody can
see the line. The fix is a small job server in WSL that queues jobs per lane, knows who owns what, and watches temperature and RAM.

Plan: the planner's rev 2 (2026-11-18, kept in the planner worktree `.scratch/gpu-job-server-plan.md`; it is scratch, so the
decisions below are the durable copy).

## Decisions (owner, final)

- Wrap **pueue** (pinned 4.0.5 or later, unix socket only, no port) behind a repo-owned stdlib wrapper `tools/gpu-queue/ctl.py`.
  Lanes: `gpu` 1, `cpu-short` 1, `cpu-full` 1 (parallel limits).
- WSL `instanceIdleTimeout=-1` is already set on the PC (owner). `pc:probe` still reports `young` if that ever regresses.
- Ordering: first come, first served, plus admin reorder. No per-owner fair share yet.
- Ownership by owner id (`<worktree>-<8 hex>`); cancelling another owner's job exits 77.
- Admin powers (force cancel, `--now`, pause/resume, reorder) only for the coordinator session, via a separate admin token.
- Retention 14 days; refuse new jobs under 10 GB free disk (exit 97).
- e2e moves onto the queue only after about a week of GPU-lane use. The cpu lanes are built (`submit-raw`) but e2e is NOT re-routed.
- gpu-queue v2 tests are unittest (worktree `gpu-queue-v2`, uncommitted; not touched here).
- Watchdog: above 83 C kill and pause the gpu group, below 75 C resume; MemAvailable under 4 GB for 30 s pauses the group (running task
  finishes), resume above 6 GB. Bulk art runs 23:00-07:00 only; a bulk job submitted by day is delayed to 23:00.

## Work packages

1. Repo side (this one): `tools/gpu-queue/ctl.py` + `test_ctl.py`, client `tools/gpu-queue/jobs.ts` (`pnpm gpu:*`), rule
   `.claude/rules/gpu-pc.md`, CLAUDE.md pointer, hook `.claude/hooks/pre-tool-pc-guard.sh` in WARN mode.
2. PC side install (owner approves the script first): pueue binaries, `~/tte-jobs`, tokens, selftest.
3. Live smoke, one week of GPU-lane use, then hook to block mode and delete `run-queue.sh`.
4. Later: e2e through `cpu-short` / `cpu-full`; a `cpu` group for measure routes.
