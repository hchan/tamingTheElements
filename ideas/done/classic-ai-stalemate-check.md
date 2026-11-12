---
status: done
added: 2026-11-12
---

# Classic AI-vs-AI stalemate check

The Arcade overlap-stalemate fix (AI step-apart, `src/core/agents/scripted-ai/arcade.ts`) left a note about a possible Classic-ruleset stalemate that was not reproduced. Checked 2026-11-12.

Result: **not reproducible.** No Classic stalemate, timeout or non-KO ending between scripted agents.

Method: `pnpm sim:match --tournament --seeds 20 --seed 11 --level L --difficulty D --agents scripted,scripted --json` (Classic is the default ruleset; 12 races, all 66 pairings, sides swapped on odd seeds, 1320 matches per run), summing `endReasons`, for L in {1, 5, 10, 20} and D in {1, 3, 5} (the L=20 runs for D=3 and D=5 were not finished). Also a 4-seed default tournament (264 matches). Every one of the ~15,800 scripted-vs-scripted matches ended by KO: 0 stalemate (1500 ticks without an HP change), 0 timeout (9000 ticks).

Side finding, not a bug: `--agents scripted,random` (the random bot as the second agent) ends 17 to 23 of 1320 matches in a stalemate, always in pairings such as lavax/treenoc, sindarosa/treenoc, ishimi/treenoc. The random bot is a test-only input generator, not a shipped AI, and the count does not depend on level or difficulty, so it is not logged in `docs/legacy/KNOWN-BUGS.md` and has no `it.fails` test. Classic sim behaviour, goldens and baselines were not touched.

If a Classic stalemate shows up in real play (scripted AI against a human), capture the seed and replay, then record it in `docs/legacy/KNOWN-BUGS.md` with an `it.fails` test.
