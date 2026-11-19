#!/bin/bash
# SessionStart hook: prints the newest ~/claudetmp/handoff/*.md, if any, then tells the coordinator to start new parallel agents. Never fails.
latest=$(ls -t "$HOME"/claudetmp/handoff/*.md 2>/dev/null | head -n 1)
if [ -n "$latest" ] && [ -f "$latest" ]; then
  echo "Latest handoff ($latest):"
  head -n 200 "$latest"
fi
echo
echo "E2E: PC first, Mac fallback for short runs (pnpm e2e routes when tte.remote is configured; check pnpm pc:probe; forcing the Mac needs TTE_ALLOW_MAC_E2E=1, coordinator only; agents report the 'e2e ran on:' line). Job placement: tools/ci/offload-routes.json."
echo "START NEW PARALLEL AGENTS: check running agents (ListAgents) and keep 2-5 Sonnet builder agents running (read-only Opus planners do not count and fan out freely; scope each idea by size per CLAUDE.md: small = coordinator brief then Sonnet builds, medium = Sonnet small-planner, large or risky = Opus max-effort planner), each builder in its own git worktree and E2E_PORT, on independent items from ideas/brainstorm (owner priority first; one sim-changing agent at a time; never two agents on one shared file)."
exit 0
