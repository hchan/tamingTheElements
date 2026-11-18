---
status: epic
added: 2026-11-12
---

# Epic: Archon II board layer

The Archon-style board, resources, special pieces and AI around the arena fights.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [archon-bits](../brainstorm/archon-bits.md)
- [archon-board-layer](../brainstorm/archon-board-layer.md)
- [archon-board-ai](../brainstorm/archon-board-ai.md)
- [archon-terrain-rules](../brainstorm/archon-terrain-rules.md)
- [archon-light-dark-cycle](../brainstorm/archon-light-dark-cycle.md)
- [archon-magic-resource](../brainstorm/archon-magic-resource.md)
- [archon-power-points](../brainstorm/archon-power-points.md)
- [archon-adept-summons](../brainstorm/archon-adept-summons.md)
- [archon-special-piece-behaviours](../brainstorm/archon-special-piece-behaviours.md)
- [archon-wraith-invisible](../brainstorm/archon-wraith-invisible.md)
- [archon-apocalypse](../brainstorm/archon-apocalypse.md)
- [archon-draw-both-die](../brainstorm/archon-draw-both-die.md)
- [archon-freeze-heal-remove](../brainstorm/archon-freeze-heal-remove.md)
- [archon-handicap-and-concede](../brainstorm/archon-handicap-and-concede.md)
- [archon-projectile-steering](../brainstorm/archon-projectile-steering.md)
- [archon-turn-sound-chimes](../brainstorm/archon-turn-sound-chimes.md)
- [summon-temporary-minions](../brainstorm/summon-temporary-minions.md)

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

All four bundles are a new subsystem and a new mode: they come after the fight-side SIM bundles, and the mode must fit the five-entry menu (owner decision needed on where it lives).

### AR-1 Board core and rules

- Members: [archon-bits](../brainstorm/archon-bits.md), [archon-board-layer](../brainstorm/archon-board-layer.md), [archon-terrain-rules](../brainstorm/archon-terrain-rules.md), [archon-light-dark-cycle](../brainstorm/archon-light-dark-cycle.md), [archon-magic-resource](../brainstorm/archon-magic-resource.md)
- Size: L
- Shared files: new src/core/board/* files, src/core/index.ts, docs/REPO-MAP.md
- Flags: SIM (new subsystem: Opus plan, own golden fixtures, existing goldens untouched), OWNER-GATED (menu placement)
- Parallel: Serial with every bundle touching src/core/index.ts or REPO-MAP.md; do first of the four.

### AR-2 Pieces, power points and summons

- Members: [archon-power-points](../brainstorm/archon-power-points.md), [archon-adept-summons](../brainstorm/archon-adept-summons.md), [archon-special-piece-behaviours](../brainstorm/archon-special-piece-behaviours.md), [archon-wraith-invisible](../brainstorm/archon-wraith-invisible.md), [summon-temporary-minions](../brainstorm/summon-temporary-minions.md)
- Size: L
- Shared files: src/core/board/*, src/core/data/*
- Flags: SIM, OWNER-GATED
- Parallel: After AR-1; serial with AR-3, AR-4.

### AR-3 Spells and endgame rules

- Members: [archon-apocalypse](../brainstorm/archon-apocalypse.md), [archon-draw-both-die](../brainstorm/archon-draw-both-die.md), [archon-freeze-heal-remove](../brainstorm/archon-freeze-heal-remove.md), [archon-handicap-and-concede](../brainstorm/archon-handicap-and-concede.md)
- Size: M
- Shared files: src/core/board/*
- Flags: SIM, OWNER-GATED
- Parallel: After AR-1.

### AR-4 Board AI, steering and sound

- Members: [archon-board-ai](../brainstorm/archon-board-ai.md), [archon-projectile-steering](../brainstorm/archon-projectile-steering.md), [archon-turn-sound-chimes](../brainstorm/archon-turn-sound-chimes.md)
- Size: M
- Shared files: src/core/board/*, src/core/agents/*, src/game/audio/*
- Flags: SIM, OWNER-GATED
- Parallel: After AR-2.
