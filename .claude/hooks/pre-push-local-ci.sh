#!/bin/bash
# PreToolUse hook on Bash: before a real `git push`, run gate:commit --hook (owner, 2026-11-20: gate:push is no longer required before a push; it stays runnable and optional).
# push-match.mjs decides whether the command really pushes and in which checkout. Exit 2 blocks. Stdout stays empty.
# Fails open only when node or pnpm is missing; fails closed (exit 2) when git rev-parse fails.
# Docs-only rule: for a plain `git push [origin [HEAD|<current branch>]]` whose range origin/main...HEAD (renames split) touches only
# .claude/, docs/, ideas/ or *.md, gate:commit is replaced by `pnpm exec vitest run tests/repo`. bash 3.2 compatible. Budget: TTE_PUSH_HOOK_BUDGET_SEC (default 840).
input=$(cat)
case "$input" in
  *push*) ;;
  *) exit 0 ;;
esac
exec 1>&2

root="${CLAUDE_PROJECT_DIR:-$PWD}"
if ! command -v node >/dev/null 2>&1; then
  echo "pre-push-local-ci: node missing; push NOT checked (fail open)."
  exit 0
fi
hookdir=$(cd "$(dirname "$0")" && pwd)
matcher="$root/.claude/hooks/push-match.mjs"
[ -f "$matcher" ] || matcher="$hookdir/push-match.mjs"
if ! found=$(printf '%s' "$input" | node "$matcher" --cli); then
  echo "pre-push-local-ci: could not parse this command; push in a plain call: git -C <abs checkout> push ..."
  exit 2
fi
[ -n "$found" ] || exit 0

tab=$(printf '\t')
tops=""
while IFS="$tab" read -r kind val; do
  [ -n "$kind" ] || continue
  case "$kind" in
    moved)
      echo "pre-push-local-ci: this call runs git $val before the push, so HEAD is not final; push in its own Bash call after the $val."
      exit 2 ;;
    unknown)
      echo "pre-push-local-ci: cannot tell which checkout this push runs in ($val); use git -C <absolute checkout path> push ..."
      exit 2 ;;
  esac
  if [ ! -d "$val" ]; then
    echo "pre-push-local-ci: cannot tell which checkout this push runs in ($val does not exist); use git -C <absolute checkout path> push ..."
    exit 2
  fi
  if ! top=$(git -C "$val" rev-parse --show-toplevel 2>/dev/null); then
    echo "pre-push-local-ci: git rev-parse failed in $val (not a git checkout?); push NOT checked, blocking (fail closed)."
    exit 2
  fi
  if ! mine=$(cd "$root" && cd "$(git rev-parse --git-common-dir 2>/dev/null)" && pwd -P) ||
    ! theirs=$(cd "$top" && cd "$(git rev-parse --git-common-dir 2>/dev/null)" && pwd -P); then
    echo "pre-push-local-ci: git rev-parse --git-common-dir failed ($root or $top); push NOT checked, blocking (fail closed)."
    exit 2
  fi
  [ "$mine" = "$theirs" ] || continue
  case "
$tops
" in
    *"
$top
"*) ;;
    *) tops="$tops
$top" ;;
  esac
done <<EOF2
$found
EOF2
[ -n "$tops" ] || exit 0

if command -v pnpm >/dev/null 2>&1; then
  PN=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PN=(corepack pnpm)
else
  echo "pre-push-local-ci: pnpm missing; push NOT checked (fail open)."
  exit 0
fi

BUDGET="${TTE_PUSH_HOOK_BUDGET_SEC:-840}"
gpid=""
wpid=""
cleanup() {
  [ -n "$wpid" ] && kill -TERM -- "-$wpid" 2>/dev/null
  [ -n "$gpid" ] && kill -TERM -- "-$gpid" 2>/dev/null
  return 0
}
trap cleanup EXIT
trap 'exit 143' TERM INT HUP
set -m

# run_step <top> <log> <gate script args...>; returns the step's exit code
run_step() {
  local top="$1" log="$2" left
  shift 2
  left=$((BUDGET - SECONDS))
  [ "$left" -ge 5 ] || left=5
  if [ "$1" = exec ]; then
    ( cd "$top" && exec "${PN[@]}" "$@" ) </dev/null >>"$log" 2>&1 &
  else
    ( cd "$top" && exec "${PN[@]}" run --silent "$@" ) </dev/null >>"$log" 2>&1 &
  fi
  gpid=$!
  ( sleep "$left"; kill -TERM -- "-$gpid" 2>/dev/null; sleep 5; kill -KILL -- "-$gpid" 2>/dev/null ) >/dev/null 2>&1 &
  wpid=$!
  wait "$gpid"
  local rc=$?
  kill -TERM -- "-$wpid" 2>/dev/null
  wait "$wpid" 2>/dev/null
  gpid=""
  wpid=""
  return $rc
}

# docs_only <top>: true when the pushed range (origin/main...HEAD) is non-empty and every file is docs/ideas/.claude/*.md
docs_only() {
  local files f br cmd
  # only a plain push of the current branch qualifies
  cmd=$(printf '%s' "$input" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).tool_input.command||""))}catch{}})' 2>/dev/null)
  br=$(git -C "$1" symbolic-ref --short -q HEAD 2>/dev/null) || return 1
  [[ "$cmd" =~ ^[[:space:]]*git([[:space:]]+-C[[:space:]]+[^[:space:];\&\|\$\"\']+)?[[:space:]]+push([[:space:]]+origin([[:space:]]+([^[:space:];\&\|\$\"\':-]+))?)?[[:space:]]*$ ]] || return 1
  [ -z "${BASH_REMATCH[4]}" ] || [ "${BASH_REMATCH[4]}" = HEAD ] || [ "${BASH_REMATCH[4]}" = "$br" ] || return 1
  files=$(git -C "$1" diff --no-renames --name-only origin/main...HEAD 2>/dev/null) || return 1
  [ -n "$files" ] || return 1
  while IFS= read -r f; do
    case "$f" in
      .claude/*|docs/*|ideas/*|*.md) ;;
      *) return 1 ;;
    esac
  done <<EOF3
$files
EOF3
  return 0
}

for top in $tops; do
  if [ ! -f "$top/tools/ci/gate.ts" ]; then
    echo "pre-push-local-ci: $top predates the tiered gate (no tools/ci/gate.ts); push from the main checkout."
    exit 2
  fi
  mkdir -p "$top/.scratch"
  log="$top/.scratch/push-hook.log"
  : > "$log"
  steps=("gate:commit --hook")
  if docs_only "$top"; then
    echo "pre-push-local-ci: gate:commit skipped (docs-only rule: every file in origin/main...HEAD is under .claude/, docs/, ideas/ or is *.md); running tests/repo instead."
    steps=("exec vitest run tests/repo")
  fi
  for step in "${steps[@]}"; do
    # shellcheck disable=SC2086
    run_step "$top" "$log" $step
    rc=$?
    if [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then
      echo "pre-push-local-ci: ${step%% *} passed the hook budget (${BUDGET}s): run corepack pnpm gate:commit (Bash run_in_background), then push again."
      exit 2
    fi
    if [ "$rc" -ne 0 ]; then
      echo "pre-push-local-ci: push blocked by ${step%% *} (rc $rc); last log lines ($log):"
      tail -n 40 "$log"
      exit 2
    fi
  done
  ran=""
  for step in "${steps[@]}"; do ran="${ran:+$ran, }${step% --hook} ok"; done
  echo "pre-push-local-ci: $top: ${ran}"
done
exit 0
