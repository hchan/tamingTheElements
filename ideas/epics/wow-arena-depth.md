---
status: epic
added: 2026-11-12
---

# Epic: WoW-arena depth and meta

Crowd control, interrupts, trinkets, resilience, ladder and spectating.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [wow-cc-categories](../brainstorm/wow-cc-categories.md)
- [wow-diminishing-returns](../brainstorm/wow-diminishing-returns.md)
- [wow-interrupts-and-silence](../brainstorm/wow-interrupts-and-silence.md)
- [wow-trinket-break](../brainstorm/wow-trinket-break.md)
- [wow-cooldown-trading](../brainstorm/wow-cooldown-trading.md)
- [wow-resilience-pvp-scaling](../brainstorm/wow-resilience-pvp-scaling.md)
- [wow-line-of-sight-and-pillars](../brainstorm/wow-line-of-sight-and-pillars.md)
- [wow-battleground-objectives](../brainstorm/wow-battleground-objectives.md)
- [wow-matchmaking-hidden-mmr](../brainstorm/wow-matchmaking-hidden-mmr.md)
- [wow-arena-ladder-seasons](../brainstorm/wow-arena-ladder-seasons.md)
- [wow-rewards-and-titles](../brainstorm/wow-rewards-and-titles.md)
- [wow-arena-spectator-and-replays](../brainstorm/wow-arena-spectator-and-replays.md)
- [giant-heroes-size-for-speed](../in-progress/giant-heroes-size-for-speed.md)

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

All three bundles come after the fight-side SIM bundles (AB, GF, SF, MV).

### WA-1 Crowd-control rules

- Members: [wow-cc-categories](../brainstorm/wow-cc-categories.md), [wow-diminishing-returns](../brainstorm/wow-diminishing-returns.md), [wow-interrupts-and-silence](../brainstorm/wow-interrupts-and-silence.md), [wow-trinket-break](../brainstorm/wow-trinket-break.md), [wow-resilience-pvp-scaling](../brainstorm/wow-resilience-pvp-scaling.md)
- Size: L
- Shared files: src/core/sim/* (status, cc), src/core/data/*, goldens
- Flags: SIM (Opus plan), PC
- Parallel: Serial with every SIM bundle.

### WA-2 Arena layout and cooldowns

- Members: [wow-cooldown-trading](../brainstorm/wow-cooldown-trading.md), [wow-line-of-sight-and-pillars](../brainstorm/wow-line-of-sight-and-pillars.md), [wow-battleground-objectives](../brainstorm/wow-battleground-objectives.md), [giant-heroes-size-for-speed](../in-progress/giant-heroes-size-for-speed.md)
- Size: L
- Shared files: src/core/sim/*, src/core/rules/*, Arena.ts
- Flags: SIM, needs browser/e2e for pillars
- Parallel: After WA-1.

### WA-3 Matchmaking, ladder and rewards

- Members: [wow-matchmaking-hidden-mmr](../brainstorm/wow-matchmaking-hidden-mmr.md), [wow-arena-ladder-seasons](../brainstorm/wow-arena-ladder-seasons.md), [wow-rewards-and-titles](../brainstorm/wow-rewards-and-titles.md), [wow-arena-spectator-and-replays](../brainstorm/wow-arena-spectator-and-replays.md)
- Size: L
- Shared files: src/core/save/*, src/game/net/*, src/ui/*
- Flags: OWNER-GATED (needs the online lobby and a server decision), needs browser/e2e
- Parallel: Not queued.
