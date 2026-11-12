#!/usr/bin/env bash
# Start the game locally and open it. Usage: tools/dev/play-local.sh [dev|preview] [port] [query]
# NO_OPEN=1 starts the server without opening a browser tab (for headless screenshot runs).
# Prints one line: URL and PID. Stop with: kill <pid>. Never uses reserved e2e ports.
set -u
mode="${1:-dev}"; port="${2:-5173}"; query="${3:-}"
cd "$(dirname "$0")/../.."
case "$port" in 4173|4373|4473|4573|4673|4773) echo "reserved port $port" >&2; exit 2;; esac
if pid=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null | head -1) && [ -n "$pid" ]; then
  echo "already running: http://localhost:$port/$query (pid $pid)"; [ -z "${NO_OPEN:-}" ] && open "http://localhost:$port/$query"; exit 0
fi
mkdir -p ~/claudetmp; log=~/claudetmp/play-local.log
if [ "$mode" = preview ]; then
  corepack pnpm build >"$log" 2>&1 || { tail -20 "$log"; exit 1; }
  nohup corepack pnpm preview --port "$port" --strictPort >>"$log" 2>&1 &
else
  nohup corepack pnpm dev --port "$port" --strictPort >"$log" 2>&1 &
fi
for _ in $(seq 1 60); do
  curl -fs "http://localhost:$port/" >/dev/null 2>&1 && break; sleep 0.5
done
pid=$(lsof -ti tcp:"$port" -sTCP:LISTEN | head -1)
[ -n "$pid" ] || { tail -20 "$log"; exit 1; }
[ -z "${NO_OPEN:-}" ] && open "http://localhost:$port/$query"
echo "up: http://localhost:$port/$query (pid $pid, log $log)"
