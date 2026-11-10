---
name: plan-and-save-to-tmp-location
description: Plan a piece of work with a read-only Opus subagent and save the plan as one Markdown file under ~/claudetmp/work-plans/ for a different session to execute with /do-work-from-plan. Writes nothing to the repo. Only the user starts it.
argument-hint: <what to plan, in plain English>
disable-model-invocation: true
allowed-tools: Bash(date *), Bash(mkdir -p ~/claudetmp/work-plans), Bash(git rev-parse --short HEAD), Bash(git status --short), Bash(ls *), Read, Grep, Glob, Write(~/claudetmp/work-plans/*)
---

# plan-and-save-to-tmp-location

Plan this: $ARGUMENTS

One session plans and never writes to the repo; another executes. The plan is one file in `~/claudetmp/work-plans/`.

## Rules that never bend

- Read-only on the repo: no edits, commits, pushes. The only file written is the plan.
- Never read or print `war/WEB-INF/user.properties`.
- Scratch and the plan live under `~/claudetmp/` only.
- Tell the user the plan id and absolute path first in the reply, with the line to type: `/do-work-from-plan <id>`.

## Procedure

1. Run `date '+%Y%m%d-%H%M'`, `git rev-parse --short HEAD` and `git status --short`. Plan id = `<slug>-<stamp>` (key words, lowercase, hyphenated, at most 40 chars). If `~/claudetmp/work-plans/<id>.md` exists, append `-2`, `-3`. Run `mkdir -p ~/claudetmp/work-plans`.
2. Dispatch one read-only subagent (model: opus, tools Read/Grep/Glob/Bash) with the request, `CLAUDE.md`, `docs/BRANCHING.md` and the repo state. Ask for: goal, files to touch, steps, acceptance checks, DO NOT list, risks, and a split into work packages of about 400 LOC or fewer.
3. Write the plan file with front matter: `id`, `status: ready`, `created`, `repo_head` (short sha), `owner: none`, then sections Goal, Preconditions, Work packages (each with Files, Steps, Acceptance, DO NOT), Risks.
4. Reply with the id, the path, a five-line summary, and the command to run.
