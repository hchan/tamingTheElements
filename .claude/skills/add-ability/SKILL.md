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

1. Read `docs/DETERMINISM.md` and `docs/BALANCE.md`, and find the closest existing ability to copy the pattern from.
2. Add the data row (kind, damage, cooldown ms rounded up to ticks by `msToTicks`, speed, size) to `src/core/data/abilities-a.ts` or `src/core/data/abilities-b.ts`; ids are kebab-case slugs from `abilityId` in `src/core/data/ids.ts`. Attach it to a character in `src/core/data/characters.ts`.
3. Implement the behaviour as a pure system in `src/core/sim/systems/` (see `abilities.ts` and `projectile.ts`, where `ABILITY_DEFS` is assembled), iterating entities in id order and emitting events from `src/core/sim/events.ts`.
4. Describe it: `src/core/rules/describe.ts` and the text ids in `src/core/data/text-ids.ts`.
5. Add tests next to the code: data test (`abilities-a.test.ts` or `abilities-b.test.ts`), a system test, a probe check with `src/core/sim/ability-probe.ts`, and a snapshot/restore round trip (`src/core/sim/snapshot.test.ts` pattern).
6. Data changed: bump `SIM_VERSION` in `src/core/version.ts`, run `corepack pnpm golden:record`, and show the diff of `tests/fixtures/replays/` for review.
7. Balance: run `corepack pnpm balance:compare`; a baseline re-record is a user decision.
8. Presentation (animation, sound) goes in `src/game/` only; cosmetic code never draws from sim RNG streams.
9. Docs: `corepack pnpm docs:gen`, `CHANGELOG.md` (append-only), `docs/PARITY.md` if it touches legacy behaviour, `docs/REPO-MAP.md` if files were added.
10. Run `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm depcruise && corepack pnpm test`, then the `full-review` skill. Report results; leave changes uncommitted.
