#!/bin/bash
# usage: mat.sh outfile flags...
cd /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a0ab962c365847281
out=$1; shift
R=(curomo cyclonius echo fiara ishimi lavax morblass pax rokcore sindarosa treenoc wispera)
: > $out
for i in "${!R[@]}"; do for j in "${!R[@]}"; do
  if [ $i -lt $j ]; then corepack pnpm exec tsx /Users/henry.chan/claudetmp/lowrace-wp/h.mts ${R[$i]} ${R[$j]} 12 "$@" >> $out; fi
done; done
