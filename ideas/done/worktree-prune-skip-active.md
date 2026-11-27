---
status: done
added: 2026-11-26
---

# worktree:prune must not touch worktrees of running agents

`pnpm worktree:prune` (tools/dev/worktree-prune.ts) lists a worktree as prunable when its branch is an ancestor of main and its tree is clean. A freshly started builder's branch is reset onto main with no commits yet, so it looks exactly like a finished one: `--apply` while builders run would remove their worktrees (observed 2026-11-26: 48 listed while 3 builders were active). The coordinator currently avoids `--apply` while any builder runs.
Fix: skip worktrees modified recently (mtime of the worktree dir, `.scratch/`, or HEAD reflog within the last N minutes), skip branches with zero commits ahead of main AND a recent reflog entry, and add `--min-age <minutes>` (default 30); test with fake worktrees (fresh empty-branch vs old merged). Also print a count of skipped-active worktrees. Dry-run default stays.
