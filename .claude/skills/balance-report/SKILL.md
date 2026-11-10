---
name: balance-report
description: Compare current per-race win rates with the committed balance baseline and report deltas. Use after data, AI or sim changes, or when asked whether balance moved.
argument-hint: [--tolerance 0.05]
allowed-tools: Bash(corepack pnpm balance:compare *), Bash(corepack pnpm balance:compare), Read, Grep, Task
---

# balance-report

Read-only. NEVER run `pnpm balance:record`: re-recording `tests/fixtures/balance/baseline.json` is a design decision for the user.

## Procedure

1. Read `docs/BALANCE.md` for the gate.
2. Run `corepack pnpm balance:compare $ARGUMENTS` (full tournament, a few minutes) and capture the output.
3. Print a table: race, baseline, now, delta, verdict (outside tolerance, default 0.05, fails).
4. For a deeper read hand over to the `gameplay-balance-analyst` agent.
5. If it fails, say whether the cause is an intended data change (then the user decides on a re-record and a `SIM_VERSION` bump) or a regression.
