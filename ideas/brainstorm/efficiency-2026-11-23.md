---
status: idea
added: 2026-11-23
---

# Dev-loop efficiency, 2026-11-23 (planner dry run; nothing built)

Labels: (M) = measurement, (E) = estimate, (I) = inference from evidence. Flags: **auto-buildable** = 3 files or fewer, none in src/core, goldens, balance, gate logic, test selection or the nightly pipeline; otherwise **list only**. `.claude/` files are instructions: the coordinator edits them itself, not a builder.

## Evidence

- Agent worktrees fork from `origin/main`, not local main (M). On 11-21, agents a93cc886 and af1799fc (first commits 20:08 and 20:29) both forked at bb9274e6, which was origin/main (pushed 10:48). Local main at 19:50 was 1d1ed3c7, 109 first-parent merges ahead. Today origin/main is 79fee6cd (11-22 11:27) and local main is 112 commits ahead (M).
- The nightly did not push after either of the last 2 green full runs (M, ~/Library/Logs/dev.tte.nightly-e2e-collect.log):
  - 11-22, bc5e3e3: "working tree on main is not clean" and "main moved since the full run".
  - 11-23, 2b96ad1: "gate:commit failed on the tested commit". The log does not say which step failed: tools/ci/nightly-push.ts:148-151 checks only exit codes and drops all output (M).
- Both runs report exactly "3h00m" (487 and 501 tests). That looks like the fixed submit-to-collect window, not the run time (I).
- gate:commit took 88 s (M, gate-commit-sim108.log); the core+repo test step was 74.6 s of that. Vitest's own estimate: "~6.52s faster with isolate: false". test:changed takes 60-76 s, the same as the full suite, so `--changed` selects nearly all tests.
- gate-fast.ts runs lint, tsc, depcruise, vitest dom and vitest core+repo all at once (Promise.all). Both vitest pools use their default worker counts.
- mp-todo.md:
  - "REPO-MAP lines owed" appears 6 times in 24 h.
  - gate:fast was deferred for load 4 times on 11-22 (load 166, 43, 23, 16.7).
- tools/ci/e2e-durations.json was recorded on 11-19 from the 11-18 run and is stale. hero-portrait-shot.spec.ts took ~950 s and responsive.spec.ts 157 s (M, stale).
- Four rules files have no `paths:` scoping, so every agent loads them: art-efficiency, art-autonomy, multiplayer-loop, agent-pool. gpu-pc, hero-art, player-facing-text and sim-core are already scoped (M).

## Ranked items

1. **Builders start from local main.** Add a step 0 to every builder brief and to `.claude/agents/wp-implementer.md`: `git merge --ff-only main && git merge-base --is-ancestor main HEAD || stop`. At merge time, the coordinator rejects a branch whose fork point is older than main at launch.
   - Size S. Risk low.
   - Saving: 2 wasted builds today (M). Also fewer merge conflicts (E).
   - Files: wp-implementer.md, the brief template.
   - **auto-buildable** (coordinator edit).
2. **Get the nightly push working again.**
   - Finding (M): nightly-push.ts:148-151 runs `git worktree add --detach`, then `pnpm install --frozen-lockfile --prefer-offline`, then `pnpm gate:commit` in a throwaway worktree under `.scratch/`. It chains them with `&&`, checks only the exit codes and drops stdout/stderr, so a failure in any of the three is reported as "gate:commit failed".
   - Timing: the decision came 108 s after the collect line (09:00:11 to 09:01:59 UTC, M). A warm gate:commit alone takes 88 s and the cap is GATE_TIMEOUT_MS = 90 min (nightly-fix-logic.ts:9), so this was an early failure in install or an early gate step, not a timeout (I).
   - Now, no code: run the same three commands in a new throwaway detached worktree at 2b96ad13 and read the first red. Do not reuse `.scratch/nightly-wt` (a detached checkout at 2b96ad13 that the submit job probably owns, I). gate:commit is green on main after SIM 108 (mp-todo line 81), so if the cause is in the fresh-worktree setup, tonight fails the same way. Keep the main checkout clean at 09:00 UTC (clean() at line 157).
   - Pipeline fix: log the failing step and its last 40 lines to the collect log and tte-gate/nightly-push-status.json, and keep the gate worktree when it is red.
   - Size S (repro now; pipeline fix about 1 file plus its test). Risk low.
   - Saving: 0 of the last 2 green nights pushed (M), and every agent's base gets one day staler each night it fails.
   - Files: tools/ci/nightly-push.ts and its test.
   - **list only** (pipeline part).
3. **gate:fast always runs the tree-wide pin tests.** Run the fs-reading tests every time (REPO-MAP pin, size, ideas-queue), or the whole repo project if it takes only seconds (measure first). `--changed` never selects them when a file is added.
   - Size S. Risk low (adds seconds).
   - Files: tools/ci/gate-fast.ts and its test.
   - **list only** (gate logic / test selection).
4. **One gate at a time per machine.**
   - Add a CPU slot that works like tools/ci/browser-slot.ts, and set vitest `--maxWorkers` from the load average.
   - The cause of load 166 is likely 3-5 agents each starting 2 vitest pools plus tsc (I).
   - Size M. Risk low-medium.
   - Files: gate-fast.ts, gate.ts, new cpu-slot.ts.
   - **list only**.
5. **hero-artist: the art-director is the gate.** `.claude/agents/hero-artist.md` lines 3 and 8 still require the owner to approve a contact sheet in chat, which contradicts art-autonomy.md rule 1. Also check the "owner-local contact sheet" wording at hero-art.md:9.
   - Size S. Risk low.
   - Saving: 1 stalled run today (M).
   - **auto-buildable** (coordinator edit).
6. **Prune merged worktrees.** Remove the 77 SAFE unlocked worktrees out of 162 (M, triage), then `git branch -d`.
   - Size S. Risk medium: `.scratch/` is gitignored, so a "clean" worktree can still hold reports that mp-todo.md cites, for example agent-a102ec72 (r24sheet) and agent-a0e306b9 (kindrel-v101.md). Tar each `.scratch/` to ~/claudetmp first. Never touch DIRTY, AHEAD or LOCKED worktrees.
   - Optional: tools/dev/prune-worktrees.ts with `--dry-run` as the default (plus a test; REPO-MAP line by the coordinator).
   - **auto-buildable**.
7. **Sim/AI plans name a cheap probe and a stop rule before any build.** For example, a mods-only tournament with few seeds, using the footsie probe d329e783, and a stop after 2 rounds.
   - Size S. Risk low.
   - Saving: about 3.5 h of the single sim lane (E).
   - Files: the planner brief template, small-planner.md.
   - **auto-buildable**.
8. **Brief preflight.** Run `ls` on every input path before launching a builder. Handoffs between sessions use absolute paths.
   - Size S. Risk none. Process only.
9. **Quiet-agent check in one call.** List agent output files whose `stat -L` mtime is more than 15 min old.
   - Size S. Risk low. Output paths not yet checked.
   - **auto-buildable** (1 script + test).
10. **Delete phone-only e2e cases** (owner order 2026-11-19).
    - responsive.spec.ts takes 157 s per night (M, stale) and caused 8 of the 10 failures on 11-21. I saw only a 1280x720 literal in it, so confirm the phone cases first.
    - Size S. Risk low.
    - **auto-buildable** once confirmed phone-only; otherwise list only.

## Wasted agent runs and how to prevent each

- Nykra anim tune a646a8a8 (03:40) forked from origin/main without the quadruped rig 31f9549e1 (03:07). It conflicted wholesale and was redone at 04:44. Prevention: item 1.
- Hurl Rock impact ae16517b had the same stale base and missed quarrak-hit-fx (`hurlhit`), so it would have stacked a second impact. Redone at 04:25. Prevention: item 1, plus the brief names the existing hook to tune.
- Ouroth lesson rows acf16e39 was reverted because its test pinned an old line. Probably the same stale base (I, not verified). Prevention: item 1.
- Footsies item 3 took 3 rounds plus variants A and B, all out of band, and was parked. Prevention: item 7.
- Rig builder a7d7fc45 found no inputs: they were in the art worktree's `.scratch`, not main's. Prevention: item 8.
- A hero-artist run demanded the owner's approval. Prevention: item 5.
- Planners sat idle for more than 30 min. Prevention: item 9.
- The b04 triage made only 4 tool calls and marked items DONE from commit-message keywords. Prevention: require one code or test reference for each DONE.
- Two green 3 h nightly runs produced no push. Prevention: items 2 and 3.

## Items only to list

- Nightly: auto-close a needs-human report once a later full run is green. The 11-21 report is still the last fix entry after 2 green nights. Files: tools/ci/nightly-fix.ts, nightly-status.ts.
- Nightly: refresh e2e-durations.json after each green run and record the real PC run time before any nightly speed work.
- Vitest `isolate: false` for core: about 6.5 s per full run (vitest's estimate). Risk: module state can leak between test files.
- Slow-tier tests: rank files once with the JSON reporter. gate:fast skips the golden/tournament tier unless sim files change, and the nightly keeps it. Files: tools/ci/test-tiers.json, gate-fast.ts. Size M.
- hero-portrait-shot.spec.ts (~15.5 min, M, stale): move the frame-name and height checks to a repo test over the sheet JSON and keep one browser case. Size M. It changes coverage.
- Run full-roster tournaments (4416 matches; Mac load 43 on 11-22) on the PC through `pnpm gpu:submit`. Files: offload-routes.json, tools/gpu-queue/. Size M.
- Per-agent tokens: add `paths:` scoping to art-efficiency.md and art-autonomy.md (about 2k tokens per agent, E), and move dated rulings out of CLAUDE.md into docs (about 1-1.5k tokens, E). These are owner instructions.
- If the harness offers a worktree-creation hook or base setting, have it fast-forward new agent worktrees to local main (configuration, owner).

## Top 5

1. Step 0 fast-forward to local main (item 1).
2. Reproduce the 2b96ad1 push-gate red in a fresh worktree, and make nightly-push.ts log the failing step (item 2).
3. Pin tests in gate:fast (item 3).
4. Machine-wide gate slot (item 4).
5. hero-artist approval fix (item 5).
