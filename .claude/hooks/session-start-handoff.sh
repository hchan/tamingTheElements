#!/bin/bash
# SessionStart hook: prints the newest ~/claudetmp/handoff/*.md, if any. Never fails.
latest=$(ls -t "$HOME"/claudetmp/handoff/*.md 2>/dev/null | head -n 1)
if [ -n "$latest" ] && [ -f "$latest" ]; then
  echo "Latest handoff ($latest):"
  head -n 200 "$latest"
fi
exit 0
