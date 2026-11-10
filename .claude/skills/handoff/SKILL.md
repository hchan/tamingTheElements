---
name: handoff
description: Write a session handoff note (state, decisions, next steps) to ~/claudetmp/handoff/ so the next session starts with it. Use when the user says handoff, wrap up or pause.
argument-hint: [topic]
allowed-tools: Bash(git status *), Bash(git log *), Bash(git branch *), Bash(git diff *), Bash(mkdir -p ~/claudetmp/handoff), Bash(date *), Write(~/claudetmp/handoff/*)
---

# handoff

The `SessionStart` hook `.claude/hooks/session-start-handoff.sh` prints the newest file in `~/claudetmp/handoff/`, so the note is the deliverable and its location matters. Never write handoffs inside the repo.

## Procedure

1. `mkdir -p ~/claudetmp/handoff` and `date '+%Y%m%d-%H%M'`.
2. Gather: `git branch --show-current`, `git status --porcelain`, `git log --oneline -n 8`, `git diff --stat`.
3. Write `~/claudetmp/handoff/<stamp>-<topic>.md` with: goal, branch and HEAD, what is done, what is uncommitted, decisions and why, failing or unverified checks, exact next commands, open questions for the user. Keep it under 80 lines. No secrets and nothing from `war/WEB-INF/user.properties`.
4. Reply with the path and a three-line summary. Do not commit or push.
