#!/usr/bin/env bash
# Stop hook: before the coordinator ends a turn, check that 2-5 builder agents of THIS session are still running.
# "Running" = this session's agent-*.output files (<root>/<project>/<session_id>/tasks/) written in the last 3 minutes.
# Root: $TTE_AGENT_OUTPUT_ROOT, else ${TMPDIR:-/tmp}/claude-<uid>. Unknown root or session -> allow the stop.
# Blocks the stop once per turn (stop_hook_active honoured).
# Opt-in: does nothing unless TTE_AGENT_POOL=1 or the marker file .claude/agent-pool.on exists in the project dir.
in=$(cat)
if [ "${TTE_AGENT_POOL:-}" != 1 ] && [ ! -f "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/agent-pool.on" ]; then exit 0; fi
case "$in" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0;; esac
sid=$(printf '%s' "$in" | sed -n 's/.*"session_id" *: *"\([A-Za-z0-9_-]*\)".*/\1/p' | head -n 1)
[ -n "$sid" ] || exit 0
root="${TTE_AGENT_OUTPUT_ROOT:-${TMPDIR:-/tmp}/claude-$(id -u)}"
[ -d "$root" ] || exit 0
n=0
for d in "$root"/*/"$sid"/tasks; do
  [ -d "$d" ] || continue
  c=$(find -L "$d" -maxdepth 1 -type f -name 'agent-*.output' -mmin -3 2>/dev/null | wc -l)
  n=$((n+c))
done
if [ "$n" -lt 2 ]; then
  echo "Agent pool looks low (~$n of this session's agents still writing; CLAUDE.md wants 2-5 builders, planners do not count). Run ListAgents; if fewer than 2 builders are running, start Sonnet builders (own worktree + E2E_PORT) from existing plans or scope new ideas from ideas/brainstorm by size (small: coordinator brief; medium: Sonnet small-planner; large or risky: Opus max planner) first. If ideas are genuinely exhausted or blocked, say so and stop." >&2
  exit 2
fi
exit 0
