---
status: idea
added: 2026-11-22
---

# Efficiency review 2026-11-22 (dev loop, dry run)

This was a read-only review by the eff-20261122 planner. It built, ran, committed and pushed nothing: no gate and no e2e.

Sources:
- `.git/tte-gate/commit-*.json` (181 gate records), `nightly-history.jsonl`, `nightly-morning-report.md` and `nightly.log`.
- The vitest results cache and the gate logs in `~/claudetmp/*.log`.
- `tools/ci/known-red.json`, `tools/ci/offload-routes.json` and docs/TESTING.md.
- `git worktree list` and `git branch`.

Every number is marked **(m)** for a measurement or **(e)** for an estimate.

Each idea carries one of three flags:
- **auto-buildable**: 3 files or fewer, and none in src/core, goldens, balance, tools/ci/gate.ts or the nightly pipeline.
- **report-only**: the idea changes gate coverage, test selection or the nightly pipeline, so the coordinator decides.
- **coordinator**: git housekeeping or process, with no build.

Related ideas:
- [run-unit-gate-on-pc](run-unit-gate-on-pc.md)
- [short-and-long-gate](../in-progress/short-and-long-gate.md)
- [nightly-fix-loop](../in-progress/nightly-fix-loop.md)
- [test-pyramid-shift-e2e-down](test-pyramid-shift-e2e-down.md)
- [flake-hunt-load-testing](flake-hunt-load-testing.md)

The multiplayer session wrote its own review, in `.scratch/efficiency-2026-11-22.md` of the main checkout.

## Headline numbers

**The gate:commit test step got twice as slow at its fastest (m).**

| Day | Fastest run (s) | Median (s) |
|---|---|---|
| 11-19 | 58.9 | 83.4 |
| 11-20 | 58 | 126.5 |
| 11-21 | 121.4 | 176.5 |
| 11-22 | 126.1 | 212.6 |

The jump came with merge bd4d5060 of eabe3e4d ("30 s lost grace"), at 11-20 04:41Z. The last run under 60 s was at 04:34Z.

**Gates overall (m), over 181 records.**
- Run time: p10 72 s, median 131 s, p90 226 s, max 404 s.
- Median gate:commit: 138 s alone, 173 s with one other gate running, 213 s with two. 54 runs overlapped another gate.

**Last full gate (m).** It took 340 s, of which 319 s was vitest core+repo: 460 files and 7086 tests, 784 s summed over 13 workers.

**Slowest test files (m).**

| File | Seconds |
|---|---|
| e2e-route.test.ts | 110.2 |
| sim.property | 45.8 |
| fun-gate | 45.6 |
| gpu-ctl-py | 44.4 |
| ability-usage | 40.8 |
| bake-rig | 35.5 |
| scripted-ai | 32.3 |
| gpu-jobs-cli | 32.3 |

**Nightly run of 11-22 (m).**
- It passed: 487/487 at bc5e3e3, with Playwright running 87.2 min.
- It started 69 min late, behind the manual flake job 20261122-054426-full-533202 (84 min). That left 23.6 min before the 02:00 collect.
- It was not pushed. Main moved during the run on 5 of 5 nights, and 0 of 5 nights pushed.
- origin/main is 309 commits behind main (at 6c926c13). bc5e3e3 would be a 286-commit fast-forward (checked).

**Slowest e2e specs (m).** combo-anchor 440 s, hero-portrait-shot 259, stage-hazards 256, idle-aura 255, online-result 214 and ability-fx 203. The top 15 specs take 56% of the run.

**Mac and repo state (m).**
- Load was 4.8-5.3 on 14 cores during the review. The CPU is not the limit; overlapping gates and fixed waits are.
- There are 105 worktrees and 146 branches, 93 of them worktree-agent-*.

## Ranked ideas

### 1. Cut the 30 s lost wait out of e2e-route.test.ts

**Flag:** auto-buildable (1-2 files). Size S, low risk.

**Saving:**
- About 95 s off this file (e).
- About 60 s off every gate:commit test step on a quiet Mac (e).
- 11-21 had 50 gate:commit runs (m), so up to about 50 min of gate time a day (e).

**Files:**
- tests/repo/e2e-route.test.ts: set `process.env['TTE_LOST_POLLS'] = '3'` in two tests, as tests/repo/pc-remote.test.ts:136 does:
  - `a vanished job is exit 93` (:198)
  - `a lost job (93) is retried once on the PC, then goes to the Mac` (:355)
- The `beforeEach` and `afterEach` hooks at :152 and :161 already restore the environment.
- Optional second file: vitest.config.ts:21-24 has a stale timing comment. It says 263 files and fun-gate ~17 s; today there are 460 core+repo files and fun-gate takes 45.6 s.

**Why:** The follow loop in tools/ci/pc-remote.ts polls every 0.3 s and calls a job lost after `TTE_LOST_POLLS` dead polls (default 100). Each lost case therefore waits about 30-35 s. The file pays this three times: once at :198 and twice at :355. The 30 s grace used in production stays covered by pc-remote.test.ts:144-152.

**Acceptance:** both tests still assert 93 and [93, 93]; the file runs in under 20 s alone; gate:fast is green.

### 2. Unblock the 02:00 push

**2a. Clean up the untracked idea file.**
- **Flag:** auto-buildable (1 file). Size S, low risk.
- **Problem:** ideas/brainstorm/flake-summary-json-no-report.md is untracked on main. It was written at 00:09 MST, before the 02:00 push. Untracked files show up in `git status --porcelain`, so tools/ci/nightly-push.ts:55 refuses to push ("the working tree on main is not clean").
- **Second problem:** its `status: brainstorm` line is not a status brainstorm/ accepts (only idea or planned). Committed as it stands, it would fail tests/repo/ideas-queue.test.ts.
- **Fix:** recreate the file in a worktree with front matter `status: idea`, merge it, then delete the untracked copy.
- **Saving:** this clears one of the two reasons for not pushing on 11-22 (m).

**2b. Push the sha that was tested.**
- **Flag:** report-only (nightly pipeline: tools/ci/nightly-push.ts and its test). Size M, medium risk.
- **Problem:** main moves during every nightly run, so "main moved since the full run" blocks every push.
- **Fix:** when the tested sha is an ancestor of main, push it with `git push origin <tested-sha>:main`, after gate:commit passes on that sha. This is a plain fast-forward: no force and no history rewrite.
- **Saving:** the 02:00 job would push every green night instead of never. origin/main and Pages would stop falling behind (309 commits today, m).

### 3. Flake runs lose their JSON summary on the PC

**Flag:** auto-buildable, borderline: the opt-in nightly flake slice reaches this code through flake-hunt, but that slice is not installed. Size S, low risk.

**Files:**
- tools/ci/e2e-flake.ts
- tests/repo/ci-tools.test.ts
- the idea file from 2a, moved to done/

**Bug:**
- e2e-flake.ts sets `PLAYWRIGHT_JSON_OUTPUT_NAME: out` and then reads `out`.
- PC jobs export `PLAYWRIGHT_JSON_OUTPUT_FILE=$OUT/results.json`, and Playwright prefers that variable.
- So the report is never written to `out`, and the script throws "no JSON report produced" (about :133).

**Fix:** read the inherited FILE path when it is set, and `out` otherwise.

**Saving:** the 84-min, 220-test manual flake job produced no summary and fed nothing to the ledger (m). Every PC flake run is wasted until this is fixed.

**Verify:** one short `e2e:flake` run through the router on the merged main.

### 4. Keep the PC full lane free from 22:30 to 07:00

**Progress 2026-11-22:** doc line added to docs/TESTING.md (Pushing/while-a-full-run bullets); router guard still open (report-only).

**Flags:**
- Doc line: auto-buildable (1 file; give it to the same agent as idea 7). Size S, low risk.
- Router guard: report-only.

**Doc line:** in docs/TESTING.md, "Routing e2e to the PC", add: no manual full or flake PC job that could still be running at 23:00. Start long manual runs before about 21:30 or after 07:00.

**Router guard:** tools/ci/e2e-route.ts would warn on, or refuse, a full or flake submit that could overlap 23:00. This changes routing and the nightly timing.

**Evidence:** on 11-22 the nightly started 69 min late, behind an 84-min manual flake job, and finished 23.6 min before the 02:00 collect (m). A run about 24 min longer would have missed the collect (e).

### 5. Count distinct failing tests before the MAX_FAILURES cut-off

**Flag:** report-only (nightly pipeline). Size M, medium risk.

**Files:** tools/ci/nightly-fix-logic.ts:11 (`MAX_FAILURES = 3`), nightly-fix.ts:188 and their tests.

**Problem:** on 11-21 the fix loop was blocked as "10 unrecorded failures (more than 3): a broken night". Those 10 failures were only 3 titles in 2 specs: arcade-tag 2v2, arcade-tag 3v3, and one responsive.spec.ts title 8 times.

**Fix:** count distinct file and title pairs against the limit. Keep the raw count only as a broken-night guard at a higher threshold (for example, more than 20).

**Saving:** one fix round on nights like that, instead of a needs-human carried into the next day (e).

### 6. Make the morning report accurate

**Flag:** report-only (nightly pipeline: tools/ci/nightly-status.ts:185-191 and nightly-fix.ts:491-498). Size S-M, low risk.

**Four defects (m):**
- "full e2e: 3h00m" is the time from submit to collect (06:00:06Z to 09:00:11Z). Playwright actually ran 87.2 min.
- The 11-21 needs-human for 9ad8b00 is still printed after a green night at bc5e3e3.
- The responsive.spec.ts line is printed 8 times.
- `ranOn` is empty in every row of nightly-history.jsonl.

**Saving:** a few minutes of triage each morning, and no false needs-human (e).

### 7. One router call for all touched specs

**Progress 2026-11-22:** done, documented in docs/TESTING.md ("Spec or app changes that alter behavior" bullet).

**Flag:** auto-buildable (docs/TESTING.md near :287, "Spec or app changes"; same agent as idea 4). Size S, low risk.

**Change:** agents and the coordinator pass every touched spec to one `pnpm e2e -- <specs>` call per merge batch.

**Evidence:** from the multiplayer session's review, one run each (m): a 1-spec job ran for 46 s after 254 s in the queue, while a 4-spec job ran for 2m51s after 4 s.

**Saving:** one queue wait of 1-4 min for each call avoided (e).

### 8. Clean up stale worktrees and branches

**Flag:** coordinator (git only; no repo files). Size M, low risk if done as below.

**Worktrees (m):** 105 in all.
- 24 merged and clean; 18 of these are unlocked.
- 66 merged but dirty. 45 of them hold untracked tools/assets files, and 6 hold hero-audit output.
- 13 unmerged, 2 detached and 13 locked.

**Branches (m):** 146 in all, 93 of them worktree-agent-*. 42 merged branches have no worktree.

**Steps:**
1. Run `git worktree remove` (no `--force`) on the 18 merged, clean, unlocked worktrees.
2. Run `git branch -d` (never `-D`) on the 42 merged branches.
3. For the 66 dirty worktrees, first copy anything a commit depends on into tools/ (the "save work back" rule), then remove them.
4. Leave the locked worktrees (they may be live agents) and the unmerged ones for review.

**Saving:**
- About 9 GB of disk from the first 18 (e).
- Shorter worktree and branch lists, and fewer stale copies for agents to open.

### 9. Stop wasted agent runs

**Flag:** report-only (process; the coordinator's rules files). Size S, low risk.

**Evidence (m):**
- 11 of 93 agent branches (12%) never merged.
- Hero-audit output sits in 6 worktrees, so the same audit ran several times.
- This review's brief listed several items as open that are already on main:
  - a11y #3/#8/#12 (20d6b6c1, 80ab60f6)
  - Hud D (4e13abdd)
  - the treeKey flake (cb9287a2, 9672bd3e)
- Three idea files were not moved when their fix merged:
  - qa-r125-super-cutin-covers-combo.md is still in brainstorm/ (fix 4bce6f61).
  - qa-r126-swap-refusal-line-edge.md is still in in-progress/ (fix 90daba1e).
  - qa-r125-first-blood-hint-tiny-1920.md is still in in-progress/ (fix 602cb790).
- Two QA items took full agent runs to end as "does not reproduce" (a61be4ce, 6096b5b2).

**Rule:**
- In the merge commit, tick .scratch/mp-todo.md and move the idea file.
- Before starting any planner or builder, run `git log --oneline main --grep '<item id>'`.
- For QA items, first confirm the bug still shows with one screenshot or one spec.

**Saving:** about 1 agent run in 8 (e).

### 10. Fewer seeds for the slow sim tests in gate:commit

**Flag:** report-only (gate coverage). Size M, medium risk.

**Evidence (m):** nine sim and AI files sum to 248.6 s of the 784 s in core+repo.

| File | Seconds |
|---|---|
| sim.property | 45.8 |
| fun-gate | 45.6 |
| ability-usage | 40.8 |
| scripted-ai | 32.3 |
| super-timing | 25.8 |
| arcade-match | 18.5 |
| weather | 15.3 |
| lockstep | 14.2 |
| rollback | 10.3 |

**Change:** gate:fast and gate:commit run fewer seeds or matches, and the nightly run keeps the full count. The tests read an env switch to choose.

**Saving:** about 10-15 s of wall time on a quiet Mac once idea 1 lands, because these files then set the fastest possible gate time. More when gates overlap (e).

### 11. Profile the three slow tool tests

**Flag:** auto-buildable only if the fix stays within 3 files and keeps every assertion; otherwise report-only. Size S, low risk.

**Evidence (m):**
- gpu-ctl-py: 44.4 s. It runs `python3 -W error::ResourceWarning -m unittest discover -s tools/gpu-queue`.
- bake-rig: 35.5 s.
- gpu-jobs-cli: 32.3 s.

**Approach:** look for fixed sleeps and poll intervals first, as in idea 1.

**Saving:** 0-15 s of wall time (e). gpu-ctl-py takes about as long as the sim files that will set the fastest gate time after idea 1.

### 12. Move checks down from the heaviest e2e specs

**Flag:** report-only (test selection and coverage). Size L, medium risk.

This continues [test-pyramid-shift-e2e-down](test-pyramid-shift-e2e-down.md); S1 (bc5e3e39), S2 (2c0a7810) and the S moves (9faef481) are done.

**Change:** start with combo-anchor (440 s), stage-hazards (256 s) and idle-aura (255 s) (m). Move their pure logic and layout assertions into core or dom tests, and keep one smoke path per spec.

**Saving:** 10-20 min a night (e). That also widens the 23.6 min margin before the 02:00 collect.

### 13. Record load and overlap in gate records

**Flag:** report-only (tools/ci/gate.ts). Size S, low risk.

**Change:** add to each `commit-<key>.json` the 1-minute load average at start and end, and the number of other gates running.

**Why:** today, overlap has to be rebuilt from timestamps. That is how the 138 / 173 / 213 s medians above were found (m). Record only; do not serialise gates (see below).

**Saving:** none directly. It turns the next review's estimates into measurements.

### 14. Tidy up size-budget.json

**Flag:** auto-buildable (one file, but a shared one, so one agent only). Size S, low risk.

**Problem:** size:check warns on every gate (m):
- ability-aura-view is 3699 B against a 3000 B budget.
- tour.css is 734 B against 500 B.
- sheets is 116 MB against 104.9 MB.
- tag-entry has no entry.
- launch and netsim have stale entries.

**Change:** raise, add and delete entries. The owner has said size does not matter and budgets can be raised freely.

**Saving:** less noise to read in every gate log (e, small).

## Not recommended

- **`isolate: false` for vitest.** It was measured at 14.7 s saved, under the 15 s bar (docs/TESTING.md:57, 8e14c2c8). Do not retry it.
- **Serialising gates.** Each gate would get the whole Mac, but agents would queue behind each other. Overlap costs about 35-75 s per gate (m); a queue would cost more (e).
- **More PC e2e workers.** One worker on SwiftShader is the stable baseline. Only change it after an A/B run of the flake rate.

## Side notes

- depcruise prints a `missing-tsc-transpiler` warning on every run (m). Check once whether it weakens any rule; a config change would be report-only.
- known-red.json has one open entry: perf.spec.ts (P2).
