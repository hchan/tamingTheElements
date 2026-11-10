---
name: replay
description: Verify a recorded replay by re-simulating it and checking every hash checkpoint, in Node and optionally in browsers. Use when a sim change might break determinism or when asked to check a replay file.
argument-hint: [replay file, default the golden fixture]
allowed-tools: Bash(corepack pnpm exec vitest *), Bash(corepack pnpm test *), Bash(corepack pnpm test:browser), Read, Grep
---

# replay

Read-only. The golden fixture is `tests/fixtures/replays/random-vs-random.replay.json`; the player is `playReplay` in `src/core/replay/player.ts`, the format is in `src/core/replay/format.ts`.

## Procedure

1. Node check: `corepack pnpm exec vitest run --project core src/core/replay`. It verifies the golden fixture and that a fresh recording matches it.
2. Cross-browser check when asked: `corepack pnpm test:browser` (`tests/browser/determinism.browser.test.ts`).
3. For a replay named in `$ARGUMENTS`, load it with `playReplay` through a short `tsx` script under `~/claudetmp/` and print the verdict (`ok`, `firstDivergentTick`, `expected`, `actual`).
4. Report pass or fail and the first divergent checkpoint (every `HASH_INTERVAL` ticks).
5. Never run `pnpm golden:record` here. Rewriting the golden needs a `SIM_VERSION` bump and a reviewed diff; see the `add-ability` skill.
