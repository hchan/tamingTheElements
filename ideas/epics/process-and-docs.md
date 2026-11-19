---
status: epic
added: 2026-11-16
---

# Epic: Process, docs and housekeeping

Repo hygiene, parity rows, dead code and small code-health items (cross-listed from other epics).

- Suggested order: parity rows and housekeeping are ongoing.
- Size: S to M each.
- Dependencies: docs/REPO-MAP.md is pinned by a test; one agent at a time on shared files.
- Owner-gated: Deleting Classic sim code is owner-gated.

Member ideas, in suggested priority order (work them as separate small work packages):

- [core-swap-allowed-accessor](../done/core-swap-allowed-accessor.md): Core swapAllowed accessor. Done 2026-11-18: the sim's `swapAllowed` is the one swap rule; the HUD reads it.
- [dead-ability-cleanup](../done/dead-ability-cleanup.md): Dead or never-used ability data. Done 2026-11-17: re-checked, docs and a guard test, no sim change; Sandstorm and Gale moved to weather-secondary-effects.
- [parity-open-rows](../brainstorm/parity-open-rows.md): Close the 5 open PARITY rows. Each open row in docs/PARITY.md needs a named passing test or an intentional-divergence decision.
- [repo-housekeeping](../brainstorm/repo-housekeeping.md): Repo housekeeping. Clean the stale agent worktrees (agent-aeb6b63a95f3b52f9, agent-a62cdc7d8477edbf4, agent-ade3ba6ffbb851b79, agent-abae408bc9be42aaa) after checking ea
- [polish-backlog](../brainstorm/polish-backlog.md): Polish backlog (small items, split out when started). - Hidden event-log box in the Arcade battle:

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [short-and-long-gate](../in-progress/short-and-long-gate.md): Short gate on every merge, long gate once a day

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### PD-1 Housekeeping, parity and accessor

- Members: [core-swap-allowed-accessor](../done/core-swap-allowed-accessor.md), [parity-open-rows](../brainstorm/parity-open-rows.md), [repo-housekeeping](../brainstorm/repo-housekeeping.md), [polish-backlog](../brainstorm/polish-backlog.md)
- Size: M
- Shared files: src/core/index.ts, docs/REPO-MAP.md, docs/PARITY.md
- Flags: no sim change but touches src/core/index.ts and REPO-MAP.md: exclusive; deleting Classic sim code is OWNER-GATED
- Parallel: Tools lane: exclusive with every bundle touching src/core/index.ts or REPO-MAP.md (AR-1, GF-2, MV-1, GM-1). Same work as OR-3.
