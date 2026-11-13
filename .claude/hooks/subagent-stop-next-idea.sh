#!/usr/bin/env bash
# SubagentStop hook: when an agent finishes, remind the coordinator to refill the agent pool from ideas/.
# Prints a short context line (plain stdout is added as context); never blocks.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
n=$(ls ideas/brainstorm 2>/dev/null | grep -vc '^README' )
echo "An agent just finished. Per CLAUDE.md keep 2-5 agents running: review/merge its result (gate first), then think about starting another item from ideas/brainstorm (${n} available; skip any touching a file another running agent owns, and only one sim-changing agent at a time)."
exit 0
