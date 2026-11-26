---
status: done
added: 2026-11-19
---

# e2e red: combo-anchor 1680x720 case 3 (pops, call-outs and numbers clear by 7 px)

Found 2026-11-19 in the full e2e on the PC (job 20261119-154740-full-b71c2b, 697 pass, 2 fail) and reproduced alone on the PC short lane (job 20261119-180359-short-7b70cf): `tests/e2e/combo-anchor.spec.ts:158` at 1680x720 failed (counter box x 801 vs 634, the 634 is an obstacle left edge, not a second counter measurement; plan in .scratch/plans/plan-combo-anchor-1680.md); the 1280x720 variant passed. Reproduced twice, so not load noise.

## Progress

- 2026-11-19: fixed by 6f8c0f29 (merge of 3cc42b15, `obstacleCap` in `src/game/hud/combo-anchor.ts`: the milestone pop is capped so the scaled box keeps the gap to obstacles). Verified on the PC short lane: the spec passed 16/16.
- The second failure of that full run (`arcade-weather.spec.ts:108`) moved to [e2e-red-arcade-weather-108-reduced-motion](./e2e-red-arcade-weather-108-reduced-motion.md).
