---
status: done
added: 2026-11-19
---

# e2e red: arcade-weather.spec.ts:108 (reduced motion) timed out (unconfirmed)

`tests/e2e/arcade-weather.spec.ts:108` (reduced motion) timed out after 30 s in `waitForFunction(ARENA_READY)` in the full run on the PC (job 20261119-154740-full-b71c2b). The rerun was cancelled at exit 130, so it is unconfirmed: it may be load noise or a real reduced-motion startup stall.

Next: the full e2e tonight will re-check. If it fails again, run the spec alone on the PC short lane and look at why ARENA_READY is not reached with reduced motion on. Record as known-red in tools/ci/known-red.json only if it reproduces.

Done 2026-11-26: not reproduced. The spec (now line 117) passes: short-lane PC run 20261126-235036-short-7815d1, 3 of 3 green. Load-noise timeouts were already addressed by 32394266 (longer timeouts under PC load) and eb0370fb (clearer messages). Not in known-red.json. No code change.
