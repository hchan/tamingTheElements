---
name: push-to-main-and-deploy-if-green
description: Push the tested local main to origin/main and start the GitHub Pages deploy, but only when the full gate is green. Use when the user types /push-to-main-and-deploy-if-green or asks to ship main now instead of waiting for the 01:00 job. Never forces, never pushes other branches.
allowed-tools: Bash(git *), Bash(corepack pnpm *), Bash(env -u GITHUB_TOKEN gh *), Read
---

# push-to-main-and-deploy-if-green

The user typing this skill IS the explicit ask to push (owner rule: no push without an ask; the 01:00 job is the default path).
Run from the main checkout. Read-only until every check below passes. Never force-push, never rewrite history, never push a branch other than main.
Tags: push only `relay-v*` tags that point at a commit inside the pushed range (never move or delete one).

## Procedure

1. Preconditions (stop and report the first failure; do not work around it):
   - `git symbolic-ref --short HEAD` is `main`; `git status --porcelain` is empty; no `merge:queue`/gate run holds main (`pgrep -fl 'tools/ci/gate.ts'` is empty).
   - `git fetch origin main`; `git merge-base --is-ancestor origin/main HEAD` succeeds (otherwise diverged: needs the owner).
   - `git rev-list --count origin/main..HEAD` is above 0 (else say "nothing to push").
2. Green evidence, pick the tested sha `T`:
   - `corepack pnpm nightly:status`: if it says `pass` (or red with only known-red) at sha `S` and `S` is an ancestor of HEAD, then `T = S` (the commits after `S` are untested; say how many).
   - Otherwise run `corepack pnpm gate:commit` on HEAD in the foreground (about 6 minutes, use a long timeout or `run_in_background`); `T = HEAD` only if it exits 0. Never push on a red or unknown result.
   - A new (unrecorded) red in the nightly status means stop: that goes to the verify-fix loop, not a push.
3. Show the plan in one line (`T`, commits to push, tags) and push: `git push origin T:main` (a plain fast-forward; the shared `PUSH_ARGS` form). If it is rejected, stop; never retry with force.
4. Tags: for each local `relay-v*` tag not on origin whose commit is an ancestor of `T`, `git push origin <tag>`.
5. Deploy: `env -u GITHUB_TOKEN gh workflow run ci.yml --ref main` (Pages is built by Actions only on cron or manual dispatch). Then `env -u GITHUB_TOKEN gh run list --workflow ci.yml --limit 1` and report the run id and its URL.
6. Report in at most 8 lines: pushed range (`old..T`), untested commits left local, tags pushed, run id/state. If `gh` is missing or unauthenticated, say the deploy was NOT started and that the daily cron will deploy.

Do not read or print credentials. Do not add the host or relay address to anything.
