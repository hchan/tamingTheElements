---
status: epic
added: 2026-11-16
---

# Epic: Process, docs and housekeeping

Repo hygiene, parity rows, dead code and small code-health items (cross-listed from other epics).

- Suggested order: dead-ability-cleanup and core-swap-allowed-accessor are small; parity rows and housekeeping are ongoing.
- Size: S to M each.
- Dependencies: docs/REPO-MAP.md is pinned by a test; one agent at a time on shared files.
- Owner-gated: Deleting Classic sim code is owner-gated.

Member ideas, in suggested priority order (work them as separate small work packages):

- [core-swap-allowed-accessor](../brainstorm/core-swap-allowed-accessor.md): Core swapAllowed accessor. The HUD infers why a tag is blocked (WAIT, STUN) from the phase and status flags (WP-HC1 D).
- [dead-ability-cleanup](../brainstorm/dead-ability-cleanup.md): Dead or never-used ability data. From docs/ABILITY-AUDIT.md finding 8. Hurl Rock (80 DPS) and Elemental Advantage Fire Cone have no owner;
- [parity-open-rows](../brainstorm/parity-open-rows.md): Close the 5 open PARITY rows. Each open row in docs/PARITY.md needs a named passing test or an intentional-divergence decision.
- [repo-housekeeping](../brainstorm/repo-housekeeping.md): Repo housekeeping. Clean the stale agent worktrees (agent-aeb6b63a95f3b52f9, agent-a62cdc7d8477edbf4, agent-ade3ba6ffbb851b79, agent-abae408bc9be42aaa) after checking ea
- [polish-backlog](../brainstorm/polish-backlog.md): Polish backlog (small items, split out when started). - Hidden event-log box in the Arcade battle:
