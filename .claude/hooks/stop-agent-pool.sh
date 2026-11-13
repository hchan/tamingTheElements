#!/usr/bin/env bash
# Stop hook: before the coordinator ends a turn, check the agent pool is 2-5. Approximates "running agents" as agent
# worktrees whose files changed in the last 15 minutes. Blocks the stop once per turn (stop_hook_active honoured).
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
in=$(cat)
case "$in" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0;; esac
n=0
for d in .claude/worktrees/agent-*; do
  [ -d "$d" ] || continue
  [ -n "$(find "$d/src" "$d/tests" "$d/docs" "$d/ideas" -type f -mmin -15 2>/dev/null | head -1)" ] && n=$((n+1))
done
if [ "$n" -lt 2 ]; then
  echo "Agent pool looks low (~$n active worktrees, CLAUDE.md wants 2-5). Run ListAgents; if fewer than 2 are running, start new Sonnet agents (own worktree + E2E_PORT) on independent items from ideas/brainstorm before stopping. If ideas are genuinely exhausted or blocked, say so and stop." >&2
  exit 2
fi
exit 0
