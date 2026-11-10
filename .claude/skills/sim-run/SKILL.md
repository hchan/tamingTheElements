---
name: sim-run
description: Run headless AI-vs-AI matches of the deterministic sim (pairing, seeds, level, difficulty, tournament) and summarise the result. Use when asked to simulate matches or check how a race performs.
argument-hint: <flags for pnpm sim:match, e.g. --a fiara --b curomo --seeds 20>
allowed-tools: Bash(corepack pnpm sim:match *), Bash(git status *), Read, Grep
---

# sim-run

Run: `$ARGUMENTS`. Read-only; scratch under `~/claudetmp/`.

## Procedure

1. Read the header comment of `tools/sim/run-match.ts` for the flags: `--a`, `--b`, `--agents scripted,random`, `--seeds`, `--seed`, `--level`, `--difficulty`, `--max-ticks`, `--tournament`, `--json`.
2. With no arguments run a small tournament: `corepack pnpm sim:match --tournament --seeds 2`.
3. Otherwise run `corepack pnpm sim:match $ARGUMENTS`. Add `--json` and save to `~/claudetmp/sim-run.json` when a number needs to be quoted.
4. Report: command, win rates, stalemates and timeouts, and one line of interpretation. Say that sides are swapped on odd seeds.
5. For deltas against the committed baseline use the `balance-report` skill instead.
