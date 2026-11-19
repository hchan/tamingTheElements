#!/bin/bash
# PreToolUse hook on Bash: a nudge (NOT a security boundary) that blocks when a command reaches the GPU PC by hand (raw ssh/scp/rsync to the alias, wsl/pueue/
# tte-jobs/gpu-queue.py, run-queue.sh) instead of through `pnpm gpu:*` / `pnpm e2e*` / `pnpm pc:probe`.
# Mode: block (default, exit 2 with a stderr message); only the exact value TTE_PC_GUARD=warn (set in the Claude Code
# launch env) downgrades to a warning (exit 0). TTE_PC_RAW=1 is the explicit escape.
# Every command segment (split on ; & | ( ) backtick newline) is checked, so `cat x | ssh <alias>` and `pnpm e2e; ssh <alias>` are caught.
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

hit=""
alias_re=$(printf '%s' "$alias_name" | sed 's/[][\.*^$/]/\\&/g')
segs=$(printf '%s' "$cmd" | tr ';&|()`' '\n\n\n\n\n\n')
while IFS= read -r seg; do
  seg="${seg#"${seg%%[![:space:]]*}"}"
  [ -n "$seg" ] || continue
  # Allowed front doors, when the segment starts with them.
  case "$seg" in
    "corepack pnpm gpu:"*|"pnpm gpu:"*|"corepack pnpm e2e"*|"pnpm e2e"*|"corepack pnpm pc:probe"*|"pnpm pc:probe"*) continue ;;
    grep\ *|cat\ *|git\ *|rg\ *|ls\ *) continue ;;
  esac
  # first word after leading VAR=value assignments
  rest="$seg"
  while [[ "$rest" =~ ^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+ ]]; do rest="${rest#"${BASH_REMATCH[0]}"}"; done
  w1="${rest%%[[:space:]]*}"
  w1="${w1#[\"\']}"
  # 1. a remote-access tool aimed at the alias, or at a host given by a variable
  if printf '%s' "$seg" | grep -Eq "(^|[[:space:]\"'/])(ssh|scp|sftp|rsync)[\"']?[[:space:]]([^;&|]*[[:space:]@:\"'])?${alias_re}([[:space:]:\"']|$)"; then
    if printf '%s' "$seg" | grep -Eqi 'wsl|tte-jobs|tte-offload|tte-gpu|pueue|gpu-queue'; then
      hit="raw ssh to the PC touching the job area"
    else
      hit="raw ssh/scp/rsync to the PC"
    fi
    break
  fi
  case "${w1##*/}" in
    ssh|scp|sftp|rsync)
      if printf '%s' "$seg" | grep -q '\$'; then hit="ssh/scp/rsync to a host given by a variable"; break; fi ;;
  esac
  # 2./3. the queue tooling EXECUTED (interpreter or direct path); reading, wc, shellcheck, py_compile, bash -n are fine
  for tool in gpu-queue.py run-queue.sh; do
    case "$seg" in *"$tool"*) ;; *) continue ;; esac
    ran=""
    case "${w1##*/}" in
      "$tool") ran=1 ;;
      python|python3|python3.*|bash|sh|zsh)
        printf '%s' "$rest" | grep -Eq "(^|[[:space:]])[^[:space:]]*${tool//./\\.}([[:space:]]|$)" && ran=1
        printf '%s' "$rest" | grep -Eq 'py_compile|[[:space:]]-n([[:space:]]|$)' && ran="" ;;
    esac
    [ -n "$ran" ] || continue
    if [ "$tool" = gpu-queue.py ]; then
      printf '%s' "$seg" | grep -q -- '--dry-run' && continue
      hit="gpu-queue.py run without --dry-run"
    else
      hit="run-queue.sh"
    fi
    break 2
  done
done <<EOF2
$segs
EOF2
[ -n "$hit" ] || exit 0

echo "pc-guard: $hit. Use 'pnpm gpu:submit|status|list|cancel|log|fetch|wait' (art/GPU) or 'pnpm e2e' (browser); see .claude/rules/gpu-pc.md. Set TTE_PC_RAW=1 to bypass on purpose." >&2
[ "${TTE_PC_GUARD:-block}" = warn ] && exit 0
echo "pc-guard: BLOCKED (set TTE_PC_GUARD=warn to only warn)." >&2
exit 2
