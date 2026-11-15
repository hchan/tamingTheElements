#!/bin/zsh
# AI-variety measurement (headless, no browser): the Arcade tournaments the AI work is judged on, run in parallel.
#   tools/sim/ai-measure.sh <out dir> [hard-seeds=4] [normal-seeds=4] [easy-seeds=2]
# Writes arcade-{hard,normal,easy}-full.json (full 24-hero roster, --style for Hard), classic-s2.json and classic-s6.json
# (Classic must not move), 2v2-hard.json (2v2 Hard, legacy roster), and status.log. Read them with `pnpm ai:summary <out dir>`.
set -u
cd "$(dirname "$0")/../.."
O=${1:?out dir}; mkdir -p "$O"
H=${2:-4}; N=${3:-4}; E=${4:-2}
M="corepack pnpm -s sim:match --tournament"
( $=M --ruleset arcade --roster full --ai-level 4 --seeds $H --style --json > $O/arcade-hard-full.json 2> $O/arcade-hard-full.err; echo "hard done $?" >> $O/status.log ) &
( $=M --ruleset arcade --roster full --ai-level 3 --seeds $N --json > $O/arcade-normal-full.json 2> $O/arcade-normal-full.err; echo "normal done $?" >> $O/status.log ) &
( $=M --ruleset arcade --roster full --ai-level 1 --seeds $E --json > $O/arcade-easy-full.json 2> $O/arcade-easy-full.err; echo "easy done $?" >> $O/status.log
  $=M --ruleset classic --seeds 2 --json > $O/classic-s2.json 2> $O/classic-s2.err
  $=M --ruleset classic --seeds 6 --json > $O/classic-s6.json 2> $O/classic-s6.err; echo "classic done $?" >> $O/status.log ) &
( $=M --ruleset arcade --team-size 2 --ai-level 4 --seeds 4 --json > $O/2v2-hard.json 2> $O/2v2-hard.err; echo "2v2 done $?" >> $O/status.log ) &
wait
echo ALLDONE >> $O/status.log
