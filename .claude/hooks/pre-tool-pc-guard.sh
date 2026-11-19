#!/bin/bash
# PreToolUse hook on Bash: warns when a command reaches the GPU PC by hand (raw ssh/scp/rsync to the alias, wsl/pueue/
# tte-jobs/gpu-queue.py, run-queue.sh) instead of through `pnpm gpu:*` / `pnpm e2e*` / `pnpm pc:probe`.
# Mode: TTE_PC_GUARD=warn (default, never blocks) or block (exit 2). TTE_PC_RAW=1 is the explicit escape.
# Fails open without jq, git or a configured alias. The alias is never printed. Stdin is the hook JSON payload.
input=$(cat)
command -v jq >/dev/null 2>&1 || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0
[ "${TTE_PC_RAW:-}" = 1 ] && exit 0
case "$cmd" in "TTE_PC_RAW=1 "*) exit 0 ;; esac

alias_name="${TTE_REMOTE:-}"
if [ -z "$alias_name" ] && command -v git >/dev/null 2>&1; then
  alias_name=$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" config --get tte.remote 2>/dev/null)
fi
[ -n "$alias_name" ] || exit 0

# Allowed front doors, when the command starts with them.
case "$cmd" in
  "corepack pnpm gpu:"*|"pnpm gpu:"*|"corepack pnpm e2e"*|"pnpm e2e"*|"corepack pnpm pc:probe"*|"pnpm pc:probe"*) exit 0 ;;
  grep\ *|cat\ *|git\ *|rg\ *|ls\ *) exit 0 ;;
esac

hit=""
# 1. a remote-access tool aimed at the alias
if printf '%s' "$cmd" | grep -Eq "(^|[;&|[:space:]])(ssh|scp|sftp|rsync)[[:space:]]([^;&|]*[[:space:]@:])?$(printf '%s' "$alias_name" | sed 's/[][\.*^$/]/\\&/g')([[:space:]:]|$)"; then
  if printf '%s' "$cmd" | grep -Eqi 'wsl|tte-jobs|tte-offload|tte-gpu|pueue|gpu-queue'; then
    hit="raw ssh to the PC touching the job area"
  else
    hit="raw ssh/scp/rsync to the PC"
  fi
fi
# 2. running the queue tooling directly
if [ -z "$hit" ] && printf '%s' "$cmd" | grep -Eq 'gpu-queue\.py' && ! printf '%s' "$cmd" | grep -q -- '--dry-run'; then
  hit="gpu-queue.py run without --dry-run"
fi
if [ -z "$hit" ] && printf '%s' "$cmd" | grep -Eq '(^|[[:space:]/])run-queue\.sh'; then
  hit="run-queue.sh"
fi
[ -n "$hit" ] || exit 0

echo "pc-guard: $hit. Use 'pnpm gpu:submit|status|list|cancel|log|fetch|wait' (art/GPU) or 'pnpm e2e' (browser); see .claude/rules/gpu-pc.md. Set TTE_PC_RAW=1 to bypass on purpose." >&2
[ "${TTE_PC_GUARD:-warn}" = block ] && exit 2
exit 0
