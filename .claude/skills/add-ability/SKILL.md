---
name: add-ability
description: Add a new character ability to the deterministic sim - data, sim logic, events, tests, goldens, balance and docs. Use when the user asks to add or change an ability. Gameplay changes need design approval first.
argument-hint: <character> <ability description>
allowed-tools: Bash(git *), Bash(pnpm *), Read, Grep, Glob, Edit, Write
---

# add-ability

Add: $ARGUMENTS

## Rules

- A new or changed ability is a gameplay change: confirm the user has approved the design before editing. If not, stop and ask.
- Stay inside `src/core` determinism rules: no `Date`, `Math.random`, transcendental `Math`; ticks not ms (`ticks = ms/20`); randomness only from the named RNG streams.
- Never commit or push. Scratch under `~/claudetmp/` only. One work package, about 400 LOC or fewer.

## Procedure

1. Read `docs/DETERMINISM.md`, `docs/HOWTO-ADD-CHARACTER.md` and `docs/BALANCE.md` if present, and find the closest existing ability to copy the pattern from.
2. Add the data entry (cooldown, cost, damage, range in ticks and integer units) in the data tables.
3. Implement the sim logic as a pure step function in `src/core`, iterating entities in id order and emitting events `{tick, sourceId, kind, seq}`.
4. Add tests: unit tests for the ability, a determinism test (same seed gives the same hash), and a snapshot/restore round trip.
5. Because data changed, bump `SIM_VERSION`, run `pnpm golden:record`, and show the hash diff for review.
6. Add presentation hooks (animation, sound) in the renderer only; cosmetic code never draws from sim RNG streams.
7. Update docs (balance table, character checklist, `docs/REPO-MAP.md` and `CHANGELOG.md`, append-only).
8. Run `pnpm lint && pnpm typecheck && pnpm depcruise && pnpm test`, then the `full-review` skill. Report results; leave changes uncommitted.
