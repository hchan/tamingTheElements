---
status: idea
added: 2026-11-18
---

# e2e on the shared job server (pueue)

Status: brainstorm. Raised by the coordinator (owner suggestion, 2026-11-18). Design only: no change to `tools/ci/e2e-route.ts`,
`tools/gpu-queue/` or the PC until the owner approves.

## Goal

One place that serialises e2e and art on the 4060 PC, instead of the router's own lane locks next to the GPU lane.

## Today

- Art: `pnpm gpu:*` -> `ctl.py` -> pueue group `gpu` (1 slot). Per-session ownership (exit 77), thermal/RAM watchdog, art window
  23:00-07:00 for bulk jobs, 14-day retention, refuse under 10 GB free disk.
- e2e: `pnpm e2e` -> `tools/ci/e2e-route.ts` -> its own PC job (`<ts>-short|full-<hex>`) with lane locks, a snapshot or sha source,
  port 7960 plus lane clones, Mac fallback for short runs, and the `e2e ran on: ... -> exit N` line.
- The two systems do not know about each other, so an e2e and a GPU job can run at the same time (CPU, RAM and thermal contention).

## Questions from the coordinator

1. **Can the server take an e2e job type (`e2e:full`, `e2e:short`)?** Yes, as new pueue groups `e2e-short` and `e2e-full`
   (1 slot each), same as `cpu-short`/`cpu-full` today. `ctl.py` gets a `kind: "e2e"` job whose command is the router's existing PC-side
   runner, not a rewrite of it. The router stays the client: it submits through the server instead of taking its own lane lock, then
   follows and reports as now.
2. **Port 7960 and lane clones.** They stay inside the job's command, unchanged. Each lane has its own clone and port, and the
   one-slot-per-group rule guarantees at most one job per lane, which is exactly what the lane lock does today. The server only
   needs to know "short and full both use the same CPU", see 3.
3. **Priority.** Day: e2e first, art bulk waits for 23:00 (already true for bulk). Night: art bulk may run, and e2e is not blocked.
   Needs one new rule: an e2e job and a GPU job must not run together at the thermal limit. Option A: one shared group `pc` with
   2 slots only for CPU+GPU, no more. Option B (simpler, recommended): keep separate groups and let the watchdog hold a starting
   job while the GPU is over 80 C or free RAM is under 4 GB. That check exists for GPU jobs; extend it to e2e starts.

## Exit codes and the `e2e ran on:` line

- Router codes 0/1/124/130/93 are the job's own rc plus the server's lost-job code (93), so they pass through unchanged.
  Server-only codes (77 not yours, 94 PC unreachable, 97 not set up or disk low) must not collide: the router already uses 89, 94,
  95, 96. 94 means the same in both, but 95 (lane lock wait) disappears and becomes "queued", and 97 is new to the router and needs
  a mapping (suggest: treat as 96-class "PC refused").
- The `e2e ran on:` line is printed by the router after the job ends and stays the router's responsibility. The job id in it would
  become the server's `g-...` id.

## Risks

- Mac fallback for short runs (policy in `e2e-route.ts`) depends on the router seeing "PC busy" quickly. A queue turns "busy" into
  "wait", so the router needs a max queue wait before it falls back (today `pcBusyWaitSec`).
- Ownership: e2e jobs from the router run as the calling session, so one session's `gpu:cancel` must not touch another's e2e.
  The existing per-session ownership covers this.
- A router change is needed anyway (submit through the server), which the coordinator owns. Do not do it mid-day with live e2e runs.
- Soak first: the plan was about a week of GPU lane use before moving e2e. Check `pnpm gpu:list` for use by other sessions.

## Steps if approved

1. Add `e2e-short` and `e2e-full` groups and `kind: "e2e"` to `ctl.py` (+ tests, `offload-routes.json` notes).
2. Extend the watchdog start check to e2e jobs.
3. Add an opt-in `TTE_E2E_VIA_QUEUE=1` path in the router (coordinator's change), run both paths for a few days, then flip the default.
4. Update `docs/TESTING.md` "Routing e2e to the PC" and `.claude/rules/gpu-pc.md`.

## Open

- Should short e2e keep its Mac fallback when the queue is long? (Recommended: yes, with a max wait.)
- Does night art ever need to preempt e2e? (Recommended: no.)
