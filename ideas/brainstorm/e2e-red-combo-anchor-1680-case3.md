# e2e red: combo-anchor 1680x720 case 3 (pops, call-outs and numbers clear by 7 px)

Found 2026-11-19 in the full e2e on the PC (job 20261119-154740-full-b71c2b, 697 pass, 2 fail) and reproduced alone on the PC short lane (job 20261119-180359-short-7b70cf): `tests/e2e/combo-anchor.spec.ts:158` at 1680x720 fails (counter box x 801 vs 634, i.e. two measurements disagree by about 167 px); the 1280x720 variant passes. Reproduced twice, so not load noise.

Second failure in the same full run: `arcade-weather.spec.ts:108` (reduced motion) timed out waiting 30 s; passed or not rerun (the rerun was cancelled at exit 130), treat as unconfirmed.

Next: a Sonnet small-planner looks at whether the counter anchor is wrong at wide aspect or the test measures a mid-move frame. Do not widen the tolerance without reading it. Record as known-red in tools/ci/known-red.json once C2 exists.
