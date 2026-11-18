#!/usr/bin/env bash
# Fake ssh for tests/repo/pc-remote.test.ts. Called like the real one:
#   ssh [-o opt]... <alias> wsl -d <distro> --cd '~' -- <cmd...>
# It runs <cmd...> locally in $HOME (the test points HOME at a temp dir). Knobs (env):
#   FAKE_SSH_DOWN=1          every call exits 255 (host unreachable)
#   FAKE_SSH_STATE=<dir>     if <dir>/drop-follow holds N, the next `ctl.sh follow` call delivers N bytes, then exits 255
#   FAKE_SSH_LOG=<file>      appends each remote command line
#   FAKE_PID1_AGE=<seconds>  answer for `ps -o etimes= -p 1` (macOS ps has no etimes; default 99999)
args=("$@")
i=0
while [ $i -lt ${#args[@]} ] && [ "${args[$i]}" != "--" ]; do i=$((i + 1)); done
[ $i -lt ${#args[@]} ] || { echo "fake-ssh: no -- in args" >&2; exit 2; }
cmd=("${args[@]:$((i + 1))}")
[ -z "$FAKE_SSH_DOWN" ] || exit 255
[ -z "$FAKE_SSH_LOG" ] || echo "${cmd[*]}" >> "$FAKE_SSH_LOG"
cd "$HOME" || exit 255
if [ "${cmd[0]}" = bash ] && [ "${cmd[2]}" = age ]; then echo "${FAKE_PID1_AGE:-99999}"; exit 0; fi
if [ "${cmd[0]}" = bash ] && [ "${cmd[2]}" = follow ] && [ -n "$FAKE_SSH_STATE" ] && [ -f "$FAKE_SSH_STATE/drop-follow" ]; then
  n=$(cat "$FAKE_SSH_STATE/drop-follow"); rm -f "$FAKE_SSH_STATE/drop-follow"
  "${cmd[@]}" | head -c "$n"
  exit 255
fi
exec "${cmd[@]}"
