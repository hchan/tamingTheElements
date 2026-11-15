#!/bin/bash
# usage: mat.sh outfile [flags...]   (env NEW="a b" limits to pairs that include one of those heroes; default: full roster round-robin)
cd "$(dirname "$0")/../../.." || exit 1
out=$1; shift
R=(curomo cyclonius echo fiara ishimi lavax morblass pax rokcore sindarosa treenoc wispera kindrel nykra quarrak hyalia brazgor glimmaw durrok zephra ouroth abyssor vortigal umbrel)
: > "$out"
for i in "${!R[@]}"; do for j in "${!R[@]}"; do
  if [ "$i" -lt "$j" ]; then
    if [ -n "$NEW" ] && [[ " $NEW " != *" ${R[$i]} "* ]] && [[ " $NEW " != *" ${R[$j]} "* ]]; then continue; fi
    corepack pnpm exec tsx tools/sim/low-races/h.mts "${R[$i]}" "${R[$j]}" 12 "$@" >> "$out"
  fi
done; done
