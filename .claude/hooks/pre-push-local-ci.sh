#!/bin/bash
# PreToolUse hook on Bash: before a `git push`, run lint, typecheck, depcruise and test; exit 2 blocks the push on failure.
# Fails open (exit 0 with a message) when the command is not a push, pnpm is missing, or a script is absent or still
# a "not yet" placeholder. Stdin is the hook JSON payload.
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || cmd=""
if [ -z "$cmd" ]; then
  cmd=$input
fi
case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" || exit 0
if ! command -v pnpm >/dev/null 2>&1 || [ ! -f package.json ]; then
  echo "pre-push-local-ci: pnpm or package.json missing; skipping local CI (fail open)." >&2
  exit 0
fi

failed=0
for s in lint typecheck depcruise test; do
  body=$(pnpm pkg get "scripts.$s" 2>/dev/null | tr -d '"')
  if [ -z "$body" ] || [ "$body" = "{}" ] || [ "$body" = "null" ]; then
    echo "pre-push-local-ci: no '$s' script; skipping it (fail open)." >&2
    continue
  fi
  case "$body" in
    *"not yet"*)
      echo "pre-push-local-ci: '$s' is a placeholder; skipping it (fail open)." >&2
      continue ;;
  esac
  if ! out=$(pnpm run --silent "$s" 2>&1); then
    echo "pre-push-local-ci: '$s' FAILED; push blocked." >&2
    printf '%s\n' "$out" | tail -n 30 >&2
    failed=1
    break
  fi
done
[ "$failed" -eq 0 ] || exit 2
echo "pre-push-local-ci: local CI passed." >&2
exit 0
