#!/usr/bin/env bash
# Run a command in the offload clone on the Windows GPU PC (inside WSL Ubuntu), at a given commit.
#
#   TTE_REMOTE=<ssh-alias> tools/dev/remote-run.sh [-c <commit>] [-o <outdir>] [-e KEY=VAL]... [-w <lock-wait-seconds>] [--preflight|--no-preflight] -- <command...>
#
# TTE_REMOTE is a Host alias from ~/.ssh/config (HostName/User/IdentityFile live there; nothing about the
# machine is stored in this repo). The clone lives in ~/tte-offload/tamingTheElements inside WSL, Node 22 via nvm.
# The command runs in the FOREGROUND of the ssh call (background jobs die with the session), output streams
# live, the exit code is propagated, and a results folder is copied back to <outdir>
# (default .scratch/remote-results/<stamp>): summary.txt (commit, command, exit, wall seconds, cpu, nproc, RAM),
# output.log, plus anything the command left in $TTE_RESULTS (a per-run directory on the PC).
#
# The commit must already be on origin (the clone only fetches; never push from the PC). Examples:
#   TTE_REMOTE=tte-gpu tools/dev/remote-run.sh -- corepack pnpm test
#   TTE_REMOTE=tte-gpu tools/dev/remote-run.sh -e E2E_PORT=7960 -- corepack pnpm e2e
#   TTE_REMOTE=tte-gpu tools/dev/remote-run.sh -- 'corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test'
# Browser commands: the job unsets DISPLAY and WAYLAND_DISPLAY (with WSLg's they set, headless Chromium on the PC mostly gets
# 0 animation frames; see docs/TESTING.md "The GPU PC"), and a command that mentions e2e or playwright (or --preflight) first
# runs tools/dev/pc-frame-check.cjs (a blank page must get >= 10 frames in 1 s). On a stall the run is an ERROR, not a test
# failure: exit 96, `status: error` in summary.txt, nothing else is run. --no-preflight skips the check. The result is also recorded
# as ~/tte-offload/state/frames-{ok,stall} (read by tools/ci/pc-probe.ts).
# One run at a time per clone: it shares one git checkout and node_modules. The job takes flock on ~/tte-offload/locks/full.lock
# (GPU art jobs take it too) and waits up to -w seconds (default 600; 0 = fail at once). Lock still busy: exit 95 (PC busy),
# nothing run. Exit codes: 2 usage, 3 upload, 95 busy, 96 frame preflight, 97/98/99 clone/commit/install. Every ssh call
# sends keepalives (ServerAliveInterval=15, ServerAliveCountMax=8) so a dead link fails in about 2 minutes instead of hanging.
set -uo pipefail

commit="" outdir="" envs=() pre=auto wait=600
while [ $# -gt 0 ]; do
  case "$1" in
    -c) commit="$2"; shift 2 ;;
    -o) outdir="$2"; shift 2 ;;
    -e) envs+=("$2"); shift 2 ;;
    -w) wait="${2:-}"; shift 2 ;;
    --preflight) pre=1; shift ;;
    --no-preflight) pre=0; shift ;;
    --) shift; break ;;
    *) echo "unknown option $1 (use -- before the command)" >&2; exit 2 ;;
  esac
done
[ $# -gt 0 ] || { echo "no command given" >&2; exit 2; }
case "$wait" in ''|*[!0-9]*) echo "-w needs whole seconds" >&2; exit 2 ;; esac
: "${TTE_REMOTE:?set TTE_REMOTE to the ssh Host alias of the GPU PC}"

sha=$(git rev-parse "${commit:-HEAD}") || exit 2
stamp=$(date +%Y%m%d-%H%M%S)-$$
outdir=${outdir:-.scratch/remote-results/$stamp}
mkdir -p "$outdir"
cmd="$*"
wsl=(wsl -d Ubuntu --cd '~' --)
sshopts=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=8)

# Build the job script locally; it is uploaded to the PC and executed there (avoids Windows shell quoting).
job=$(mktemp "${TMPDIR:-/tmp}/tte-job.XXXXXX")
{
  echo '#!/bin/bash'
  echo 'export NVM_DIR=$HOME/.nvm; . "$NVM_DIR/nvm.sh" >/dev/null'
  echo "mkdir -p ~/tte-offload/locks; exec 9>>~/tte-offload/locks/full.lock; flock -w $wait 9 || { echo 'PC busy: full-lane lock held (waited ${wait}s)' >&2; exit 95; }"
  echo "cd ~/tte-offload/tamingTheElements || exit 97"
  echo "R=~/tte-offload/results/$stamp; rm -rf \"\$R\"; mkdir -p \"\$R\"; export TTE_RESULTS=\"\$R\""
  for e in ${envs[@]+"${envs[@]}"}; do printf 'export %q\n' "$e"; done
  echo "git fetch -q origin && git checkout -q --detach $sha || { echo 'commit not on origin? push it first' >&2; exit 98; }"
  echo 'git clean -fdq -e node_modules; corepack pnpm install --frozen-lockfile >/dev/null 2>&1 || { echo "pnpm install failed" >&2; exit 99; }'
  echo 'unset DISPLAY WAYLAND_DISPLAY'
  echo "t0=\$(date +%s.%N)"
  echo 'status=""'
  if [ "$pre" = 1 ] || { [ "$pre" = auto ] && printf '%s' "$cmd" | grep -Eqi 'e2e|playwright'; }; then
    echo 'if [ -f tools/dev/pc-frame-check.cjs ]; then node tools/dev/pc-frame-check.cjs 2>&1 | tee "$R/output.log"; fc=${PIPESTATUS[0]}; mkdir -p ~/tte-offload/state; if [ $fc -eq 0 ]; then touch ~/tte-offload/state/frames-ok; else touch ~/tte-offload/state/frames-stall; echo "ERROR: PC compositor is not producing frames (preflight); not running the command. Retry, or pass --no-preflight." | tee -a "$R/output.log" >&2; status=error; fi; fi'
  fi
  printf 'if [ -z "$status" ]; then ( %s ) 2>&1 | tee -a "$R/output.log"; rc=${PIPESTATUS[0]}; else rc=96; fi; t1=$(date +%%s.%%N)\n' "$cmd"
  echo '{ echo "commit: '"$sha"'"; echo "command: '"$(printf '%s' "$cmd" | sed 's/[\\"$`]/\\&/g')"'"; echo "exit: $rc"; echo "status: $([ -n "$status" ] && echo error || { [ $rc -eq 0 ] && echo ok || echo fail; })"; printf "wall_seconds: %.1f\n" "$(echo "$t1 - $t0" | bc)";'
  echo '  echo "cpu: $(lscpu | sed -n "s/^Model name: *//p")"; echo "nproc: $(nproc)"; echo "ram: $(free -g | awk "/Mem:/{print \$2\" GB\"}")"; echo "load: $(cut -d" " -f1-3 /proc/loadavg)"; } > "$R/summary.txt"'
  echo 'exit $rc'
} > "$job"

ssh "${sshopts[@]}" "$TTE_REMOTE" "${wsl[@]}" tee tte-offload/.job-$stamp.sh < "$job" >/dev/null || { echo "upload failed" >&2; rm -f "$job"; exit 3; }
rm -f "$job"
ssh "${sshopts[@]}" "$TTE_REMOTE" "${wsl[@]}" bash tte-offload/.job-$stamp.sh < /dev/null
rc=$?
ssh "${sshopts[@]}" "$TTE_REMOTE" "${wsl[@]}" tar -C "tte-offload/results/$stamp" -cf - . < /dev/null | tar -C "$outdir" -xf - 2>/dev/null
echo "--- remote exit $rc; results in $outdir" >&2
[ -f "$outdir/summary.txt" ] && cat "$outdir/summary.txt" >&2
exit $rc
