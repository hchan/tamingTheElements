---
name: add-character
description: Add a new playable character to the deterministic sim - data, text, sprite, tests, goldens, balance and docs. Use when the user asks to add a race or character. Gameplay changes need design approval first.
argument-hint: <name, element, alignment, abilities>
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(corepack pnpm *), Read, Grep, Glob, Edit, Write
---

# add-character

Add: $ARGUMENTS

## Rules

- A new character is a gameplay change: confirm the user approved the design first, else stop and ask.
- Stay inside `src/core` determinism rules (`docs/DETERMINISM.md`). Never commit or push. Scratch under `~/claudetmp/`.

## Procedure

1. Copy the pattern of an existing entry in `src/core/data/characters.ts` (`def(slug, {element, alignment, maxHealth, speed, sprite}, [abilityIds])`). Ids are kebab-case slugs made by `characterId` in `src/core/data/ids.ts`.
2. Abilities: reuse existing ones from `src/core/data/abilities-a.ts` and `src/core/data/abilities-b.ts`, or run the `add-ability` skill for new ones.
3. Display text: add the name and description ids in `src/core/data/text-ids.ts`.
4. Sprite: the `sprite` key must exist in `src/game/assets/manifest.generated.json`; assets come from `corepack pnpm assets:build` (never edit `public/` by hand).
5. Tests: extend `src/core/data/characters.test.ts` (counts, field checks) and add a sim test next to `src/core/sim/ability-probe.test.ts`.
6. Gameplay data changed: bump `SIM_VERSION` in `src/core/index.ts`, run `corepack pnpm golden:record`, review the diff of `tests/fixtures/replays/`.
7. Balance: run `corepack pnpm balance:compare`; the new race changes the tournament, so a baseline re-record is a user decision (`docs/BALANCE.md`).
8. Docs: `corepack pnpm docs:gen` for the tables in `docs/GAME-DESIGN.md`; add a `CHANGELOG.md` line; update `docs/PARITY.md` if the character is a legacy behaviour.
9. Run lint, typecheck, depcruise and test, then the `full-review` skill. Leave changes uncommitted.
