---
name: do-work-from-plan
description: Execute a saved plan from ~/claudetmp/work-plans/<id>.md in a fresh git worktree cut from CURRENT main, using a Sonnet agent. Never commits or pushes. Only the user starts it.
argument-hint: <plan id>
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(ls *), Bash(pnpm *), Read, Grep, Glob, Agent
---

# do-work-from-plan

Run plan: $ARGUMENTS

## Rules that never bend

- **Never `git commit`, `git push` or `git tag`.** Typing this skill is permission to edit files in the worktree and run the plan's local checks, nothing more. Changes stay uncommitted for the coordinator.
- The worktree is cut from CURRENT `main`, never from a stale branch.
- The agent runs on Sonnet (`model: sonnet`), subagent type `wp-implementer`.
- Stay inside the worktree. Scratch under `~/claudetmp/` only. Plans live in `~/claudetmp/work-plans/`.
- One writer per plan: a plan whose `status` is `in-progress` with another owner is not taken over unless the user says so.
- Never read or print `war/WEB-INF/user.properties`.

## Procedure

1. Find the plan: the argument is the file name in `~/claudetmp/work-plans/` without `.md` (or an unambiguous prefix). Ambiguous or missing: show `ls -t ~/claudetmp/work-plans` and ask.
2. Read the whole plan. Check `status` is `ready`; compare `git rev-parse --short main` with `repo_head` and note whether commits since touched the plan's files; check its preconditions. A failed precondition is a stop, not a skip.
3. Set `status: in-progress` and `owner` in the plan front matter.
4. Dispatch one agent: `subagent_type: wp-implementer`, `model: sonnet`, `isolation: worktree`, in the background. Its prompt starts: run `git rev-parse HEAD` and `git rev-parse main`; if they differ run `git reset --hard main`. Then give the plan text, the exact WP, and the instruction to stop and report a split proposal if it will exceed about 450 LOC.
5. When it reports, read its summary, then verify in the worktree: `git status --porcelain` lists only the planned files, and run the acceptance checks yourself.
6. Set the plan `status` to `done` (or `blocked` with the reason). Reply with the worktree path and branch, results, deviations, and a reminder that nothing is committed.
