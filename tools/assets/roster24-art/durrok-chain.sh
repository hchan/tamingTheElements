#!/bin/sh
# Raw i2i seed -> final Durrok matte (regrade -> stripcut -> finish). Usage (from the repo root):
#   tools/assets/roster24-art/durrok-chain.sh <raw.png> <outdir>     needs ~/claudetmp/rembg-venv (rembg, scipy, numpy, Pillow)
# Raw of the approved matte: r24-durrok-i2i3_120651_d0.3_1152x896.png (SDXL i2i, seed 120651, denoise 0.3); result: <outdir>/<raw>-rg3.png
set -e; PY=~/claudetmp/rembg-venv/bin/python; b=$(basename "$1" .png); H=$(dirname "$0"); mkdir -p "$2"
$PY -I "$H/durrok-regrade.py" "$2" "$1"
$PY -I "$H/durrok-stripcut.py" "$2/$b-rg.png" "$2/$b-rg2.png"
$PY -I "$H/durrok-finish.py" "$2/$b-rg2.png" "$2/$b-rg3.png"
