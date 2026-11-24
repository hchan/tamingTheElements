#!/bin/zsh
# hero source flip
cd /Users/henry.chan/tamingTheElements/.claude/worktrees/gpu-job-server
PY=~/claudetmp/rembg-venv/bin/python
M=.scratch/matte
run(){ $PY -I tools/assets/roster24-art/grey-key.py $2 .scratch/r24-large/key/$1.png ${3:-} && $PY -I tools/assets/roster24-art/make-large.py $1 .scratch/r24-large/key/$1.png .scratch/r24-large/$1Large.png; }
run vortigal $M/vortigal.png
run kindrel $M/kindrel2.png
run nykra $M/nykra-94301.png --flip
run ouroth $M/ouroth-95402.png
run brazgor $M/brazgor-96003.png --flip
run umbrel $M/umbrel-96104.png
run hyalia $M/hyalia-96433-pad.png
run quarrak $M/quarrak-96214.png
run glimmaw $M/glimmaw-96303.png
run zephra $M/zephra-120803.png --flip
run abyssor $M/abyssor-82145.png
run durrok .scratch/r24-durrok-regrade/durrok-120651-rg3.png
