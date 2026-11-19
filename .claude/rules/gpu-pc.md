---
paths:
  - "tools/gpu-queue/**"
  - "tools/assets/roster24-art/**"
---
# GPU PC (4060) rules

- All GPU and heavy-CPU work for the PC goes through the shared job server: `pnpm gpu:submit <queue.json> [--with <path>]`, then `gpu:status`, `gpu:list`, `gpu:log`, `gpu:wait`, `gpu:fetch <id> <dir>`, `gpu:cancel <id>`. One-time per machine: `pnpm gpu:setup`.
- Never ssh, scp or rsync to the PC by hand, never run `gpu-queue.py` (except `--dry-run`) or `run-queue.sh` there, never call pueue. `pre-tool-pc-guard.sh` blocks these (exit 2; owner decision 2026-11-19; it is a nudge, not a security boundary); warn-only mode is `TTE_PC_GUARD=warn` set in the Claude Code launch environment, and `TTE_PC_RAW=1` bypasses it and is the coordinator's.
- Ordering is first come, first served. `--now`, `cancel --force`, pause, resume and reorder need the admin token (`TTE_JOBS_ADMIN_TOKEN`), which only the coordinator session holds. Ask the coordinator; do not hunt for the token.
- Art jobs that are bulk run in the 23:00-07:00 window; outside it they are delayed to 23:00. The server refuses new jobs under 10 GB free disk (exit 97) and retains results 14 days.
- Exit codes: 0 ok, 1 job failed, 2 usage, 6 invalid queue, 77 not yours or admin needed, 93 lost, 94 PC unreachable, 97 not set up, disk low or version mismatch. Report 93, 94 and 97 instead of working around them.
- Full e2e can go through the queue with `TTE_E2E_VIA_QUEUE=1` (cpu-full lane); short runs stay on the router.
- Never put the host, IP, user, key or any token in the repo or in output.
