# Multiplayer testing loop (owner, 2026-11-21, permanent)

The owner caught the coordinator sitting idle ("waiting for nothing"), announcing the next step instead of doing it, and stopping while a backlog existed.

1. **Never end a turn with a backlog.** Keep a ranked todo list (`.scratch/mp-todo.md`; plan: `~/claudetmp/plans/mp-goal-plan.md` until moved into `ideas/`). When an item finishes, start the next one in the same turn. Report only when the list is empty, something is red, or the owner asks.
2. **Do not poll or wait.** A background gate, agent or run notifies on exit. While it runs, do the next independent item. Foreground `sleep` and "checking again" turns are banned; if nothing independent exists, say so once and stop.
3. **Opus plans, Sonnet builds** ([CLAUDE.md](../../CLAUDE.md) tiers). Ask a read-only Opus planner for the ranked list before a new multi-item goal, then work it top-down. Small items (3 files or fewer) are done directly in a worktree.
4. **Test, then talk.** Every change gets a test that fails without it, the gate, then a local merge. Anything that looks server-side goes to the backend session with evidence (raw arrivals, counts, match ids; no URLs); do not tell it what to change. Send it each result, not only problems.
5. **Live relay:** at most 150 client-sent frames/s total (owner, 2026-11-21; was 10; one live runner at a time), scripted `tools/live-match.ts`, address from env only (never printed or committed). A 12-run pass is the bar for a transport change.
6. **Local main only.** Commits and `--no-ff` merges stay local; the 01:00 collect job pushes after a green or known-red-only full run (or after verified nightly fixes). Never push by hand.
7. **Label numbers** as estimate or measurement; constants live in one module and tests import them.
