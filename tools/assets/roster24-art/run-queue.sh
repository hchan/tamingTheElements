#!/bin/bash
# Runs inside WSL on the GPU PC. Files were scp'd to C:/Users/<user>/ (/mnt/c/Users/<user>/).
# Usage: bash run-queue.sh QUEUE.json OUTNAME [--now]
# Run it in the FOREGROUND of an ssh call (background jobs die with the ssh session), e.g.
#   ssh <alias> "wsl -d Ubuntu -- bash /mnt/c/Users/<user>/run-queue.sh queue-night.json night"
# The Mac side keeps the ssh call alive (run_in_background) so WSL stays up.
set -e
WIN=$(dirname "$0")
source ~/tte-gpu/venv/bin/activate
cd ~/tte-gpu
mkdir -p queue
python "$WIN/gpu-queue.py" "$WIN/$1" "queue/$2" "${@:3}"
