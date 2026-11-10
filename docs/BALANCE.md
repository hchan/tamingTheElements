# Balance tooling

`pnpm sim:match` (`tools/sim/run-match.ts`, run via `tsx`) plays headless AI-vs-AI matches on the deterministic sim: no Phaser, no DOM.

## Single pairing

```
pnpm sim:match --a fiara --b curomo --agents scripted,random --seeds 20 --level 5 --difficulty 1 [--json]
```

- `--a`, `--b`: one of the 12 playable races (the dummy target and Eternal Void are excluded).
- `--agents <x>[,<y>]`: `scripted` (the `AttackAgent` port of the legacy attack decisions plus simple chase, buff and heal logic) or `random` (`RandomBot`). One value applies to both sides; two are for `a` and `b`.
- `--seeds N` matches, seeded from `--seed S` (default 1) through `matchSeed(S, i)`, so a run is reproducible. Odd seeds swap which side is team 0, so the difficulty handicap and any side bias cancel.
- `--level L` sets both sides' level (via XP), `--difficulty D` the player-side divisor (default 1), `--max-ticks` (default 9000, a timeout) and `--stalemate-ticks` (default 1500: no HP change on either side ends the match as a stalemate).
- Per-match metrics: winner, end reason (`ko`, `timeout`, `stalemate`), ticks, damage per ability. The summary adds the win rate of `a` (draws count half) with a Wilson 95% CI, mean ticks, end-reason counts and each ability's damage share.
- Damage of projectile abilities comes from the sim's `damage` events. The sim emits no events for melee hits and damage over time, so those are an approximate `melee-or-status` bucket derived from per-tick HP drops.

## Tournament

```
pnpm sim:match --tournament --seeds 4 [--agents scripted,scripted] [--json]
```

Round robin over all 66 unordered pairs of the 12 races, `--seeds` matches each. Output: a race ranking (score = wins + half draws over games) and a 4x4 element matchup matrix (fire, air, earth, water; win rate of the row element against the column element). `--json` also lists every pairing summary.

## Speed

Measured on a laptop: roughly 20k ticks/s with random bots (cold start included) and 100k+ ticks/s with scripted bots. The full 12-race tournament at 2 seeds (132 matches) runs in under a second. `tests/repo/sim-match.test.ts` benchmarks the runner with a generous bound of 5000 ticks/s so slow CI does not flake.
