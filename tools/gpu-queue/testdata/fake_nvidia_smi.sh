#!/bin/sh
# Fake nvidia-smi: temp from $FAKE_TEMP (default 50). Prints util, mem used, mem total, temp, power for the gpu query.
case "$*" in
  *query-compute-apps*) [ -n "$FAKE_APPS" ] && echo "1234, 3000"; exit 0 ;;
  *) echo "12, 1000, 8188, ${FAKE_TEMP:-50}, 40.5" ;;
esac
