#!/bin/bash
# SessionStart hook: prints the newest ~/claudetmp/handoff/*.md, if any, then tells the coordinator to start new parallel agents. Never fails.
latest=$(ls -t "$HOME"/claudetmp/handoff/*.md 2>/dev/null | head -n 1)
if [ -n "$latest" ] && [ -f "$latest" ]; then
  echo "Latest handoff ($latest):"
  head -n 200 "$latest"
fi
echo
echo "START NEW PARALLEL AGENTS: check running agents (ListAgents) and refill the pool to 2-5 Sonnet agents, each in its own git worktree and E2E_PORT, on independent items from ideas/brainstorm (owner priority first; one sim-changing agent at a time; never two agents on one shared file)."
exit 0
