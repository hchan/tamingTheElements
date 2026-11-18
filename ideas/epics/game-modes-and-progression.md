---
status: epic
added: 2026-11-12
---

# Epic: Game modes and progression

World map tour, bonus stages, bosses, panning arena and bomb traps.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [sf-world-map-tour](../brainstorm/sf-world-map-tour.md)
- [sf-bonus-stages](../brainstorm/sf-bonus-stages.md)
- [sf-grand-master-bosses](../brainstorm/sf-grand-master-bosses.md)
- [sf-win-quotes](../in-progress/sf-win-quotes.md)
- [arena-panning](../done/arena-panning.md)
- [bomb-traps](../done/bomb-traps.md)
- [more-heroes-abilities](../brainstorm/more-heroes-abilities.md)
- [snag-ability](../done/snag-ability.md)

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [game-modes-survival-daily-ladder](../brainstorm/game-modes-survival-daily-ladder.md): More game modes: survival, daily challenge, ladder

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

Not bundled: more-heroes-abilities (overlaps the owner-gated roster24 epic, wait for the G0 review).

### GM-1 Tour depth

- Members: [sf-world-map-tour](../brainstorm/sf-world-map-tour.md), [sf-bonus-stages](../brainstorm/sf-bonus-stages.md), [sf-grand-master-bosses](../brainstorm/sf-grand-master-bosses.md), [sf-win-quotes](../in-progress/sf-win-quotes.md), [game-modes-survival-daily-ladder](../brainstorm/game-modes-survival-daily-ladder.md)
- Size: L
- Shared files: src/core/rules/*, src/game/scenes/* (Tour), src/core/index.ts, main.css
- Flags: SIM for bonus stages and bosses (Opus plan), needs browser/e2e, menu stays five entries
- Parallel: Serial with SIM bundles and with MT-2 (Tour UI).
