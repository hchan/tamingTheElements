#!/usr/bin/env bash
# SubagentStop hook: when an agent finishes, remind the coordinator to refill the agent pool from ideas/.
# Prints a short context line (plain stdout is added as context); never blocks.
# Planner/reviewer agents do not count toward the builder pool: stay silent for them (type from the hook JSON).
in=$(cat)
atype=""
if command -v jq >/dev/null 2>&1; then atype=$(printf '%s' "$in" | jq -r '.agent_type // empty' 2>/dev/null); fi
[ -n "$atype" ] || atype=$(printf '%s' "$in" | sed -n 's/.*"agent_type" *: *"\([^"]*\)".*/\1/p' | head -n 1)
case "$atype" in
  *-reviewer|*-planner|*-verifier|*-analyst|repo-score|Plan|Explore) exit 0 ;;
esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
n=$(ls ideas/brainstorm 2>/dev/null | grep -vc '^README' )
echo "An agent just finished. Per CLAUDE.md keep 2-5 builder agents running (planners do not count): review/merge its result (gate first), then scope by size (small: coordinator brief; medium: Sonnet small-planner; large or risky: Opus max planner) and build (Sonnet) another item from ideas/brainstorm (${n} available; skip any touching a file another running agent owns, and only one sim-changing agent at a time)."
exit 0
