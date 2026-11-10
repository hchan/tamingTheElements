---
name: status
description: Report repo status - branch, working tree, divergence from main, recent CI runs and open items. Use when asked for status or what is going on.
allowed-tools: Bash(git status *), Bash(git log *), Bash(git branch *), Bash(git diff *), Bash(git worktree list), Bash(gh run list *), Bash(gh pr list *), Read, Grep
---

# status

Read-only. Never commit or push.

## Procedure

1. Git: `git branch --show-current`, `git status --porcelain`, `git log --oneline -n 8`, `git log --oneline main..HEAD`, `git diff main --stat`, `git worktree list`.
2. CI: `gh run list --limit 5` (workflows are in `.github/workflows`). If `gh` is missing or unauthenticated, say CI status is unknown rather than guessing.
3. Open pull requests: `gh pr list`. Skip if `gh` is unavailable.
4. Open items: unticked rows in `docs/PARITY.md` (`open` status), and entries in `docs/legacy/TODO-legacy.md`.
5. Reply in at most 12 lines: branch and cleanliness, ahead of main by N commits, last CI result, top three open items.
