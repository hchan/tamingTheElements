#!/usr/bin/env bash
# One-time (and re-runnable) setup of the offload layout on the GPU PC. Run it INSIDE WSL Ubuntu, as the normal user:
#
#   TTE_REMOTE=<ssh-alias> ssh "$TTE_REMOTE" wsl -d Ubuntu --cd '~' -- bash -s < tools/dev/pc-setup.sh
#
# Idempotent and sudo-free. It makes ~/tte-offload/{lanes/short,locks,jobs,tmp/short,tmp/full,results}, clones the short-lane
# checkout from the base clone's origin URL (or fetches it), installs dependencies and Chromium, links the Windows Georgia
# fonts (the game's text font; without it fontconfig falls back to Noto Serif and text-fit specs can go red on the PC only),
# and prints the WSL idle-timeout and font status. Nothing about the machine is stored in the repo or printed here.
# Env: TTE_OFFLOAD (default ~/tte-offload), TTE_WIN_FONTS (default /mnt/c/Windows/Fonts), TTE_WSLCONFIG (path to the Windows
# .wslconfig, default: first /mnt/c/Users/*/.wslconfig), TTE_SETUP_SKIP_INSTALL=1 (skip pnpm install and playwright install).
set -uo pipefail

off=${TTE_OFFLOAD:-$HOME/tte-offload}
fonts_src=${TTE_WIN_FONTS:-/mnt/c/Windows/Fonts}
base=$off/tamingTheElements
short=$off/lanes/short/tamingTheElements
warn=0
note() { printf '%s\n' "$*"; }
bad() { printf 'WARN: %s\n' "$*"; warn=1; }

mkdir -p "$off"/lanes/short "$off"/locks "$off"/jobs "$off"/tmp/short "$off"/tmp/full "$off"/results
touch "$off"/locks/full.lock "$off"/locks/short.lock
note "layout: ok ($off)"

export NVM_DIR=${NVM_DIR:-$HOME/.nvm}
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

# Short-lane clone, from the base clone's origin URL.
if [ ! -d "$base/.git" ]; then
  bad "base clone $base is missing; clone the repo there first (full lane and remote-run.sh use it)"
else
  url=$(git -C "$base" remote get-url origin 2>/dev/null || true)
  if [ -z "$url" ]; then
    bad "base clone has no origin remote"
  elif [ -d "$short/.git" ]; then
    git -C "$short" fetch -q origin && note "short clone: ok (fetched)" || bad "short clone fetch failed"
  else
    git clone -q "$url" "$short" && note "short clone: ok (cloned)" || bad "short clone failed"
  fi
fi

if [ "${TTE_SETUP_SKIP_INSTALL:-0}" = 1 ]; then
  note "install: skipped (TTE_SETUP_SKIP_INSTALL=1)"
else
  for c in "$base" "$short"; do
    [ -d "$c/.git" ] || continue
    if ( cd "$c" && corepack pnpm install --frozen-lockfile >/dev/null 2>&1 ); then note "install ($(basename "$(dirname "$c")")): ok"; else bad "pnpm install failed in a clone"; fi
  done
  if [ -d "$short/.git" ]; then
    if ( cd "$short" && corepack pnpm exec playwright install chromium >/dev/null 2>&1 ); then note "chromium: ok"; else bad "playwright install chromium failed"; fi
  fi
fi

# Georgia: symlink the Windows fonts into the user font dir, then refresh the cache.
fdir=$HOME/.local/share/fonts/windows-georgia
if ls "$fonts_src"/georgia*.ttf >/dev/null 2>&1; then
  mkdir -p "$fdir"
  for f in "$fonts_src"/georgia*.ttf; do ln -sfn "$f" "$fdir/$(basename "$f")"; done
  command -v fc-cache >/dev/null 2>&1 && fc-cache -f "$fdir" >/dev/null 2>&1
else
  bad "no georgia*.ttf under the Windows fonts dir; skipped linking"
fi
if command -v fc-match >/dev/null 2>&1; then
  m=$(fc-match Georgia 2>/dev/null || true)
  case "$m" in
    *[Gg]eorgia*) note "font Georgia: ok" ;;
    *) bad "font Georgia: fontconfig maps it to '${m:-nothing}' (text-fit specs may differ from the Mac)" ;;
  esac
else
  bad "fc-match not found; cannot check Georgia"
fi

# WSL idle timeouts: detached jobs only survive the ssh session with instanceIdleTimeout=-1 (needs WSL 2.5.4+).
cfg=${TTE_WSLCONFIG:-$(ls /mnt/c/Users/*/.wslconfig 2>/dev/null | head -n 1)}
if [ -n "$cfg" ] && [ -r "$cfg" ]; then
  if grep -Eqi '^[[:space:]]*instanceIdleTimeout[[:space:]]*=[[:space:]]*-1' "$cfg"; then
    note "instanceIdleTimeout: ok (-1)"
  else
    bad "instanceIdleTimeout=-1 is not in .wslconfig [general]; detached jobs will die with the ssh session (owner step)"
  fi
else
  bad "could not read the Windows .wslconfig; instanceIdleTimeout unknown"
fi
age=$(ps -o etimes= -p 1 2>/dev/null | tr -d ' ')
[ -n "$age" ] && note "distro pid 1 age: ${age}s (detached jobs need > 600)"

for t in flock tmux timeout git; do command -v "$t" >/dev/null 2>&1 || bad "$t not installed"; done
if [ "$warn" = 0 ]; then note "pc-setup: all ok"; else note "pc-setup: done with warnings"; fi
exit 0
