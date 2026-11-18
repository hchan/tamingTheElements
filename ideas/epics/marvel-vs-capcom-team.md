---
status: epic
added: 2026-11-12
---

# Epic: Marvel vs Capcom team play

Assists, tag, team meter, delayed hypers, snapbacks and 3v3 selection.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [mvc-assists-and-tag](../brainstorm/mvc-assists-and-tag.md)
- [mvc-variable-assist](../brainstorm/mvc-variable-assist.md)
- [mvc-variable-counter](../brainstorm/mvc-variable-counter.md)
- [mvc-team-meter-and-dhc](../brainstorm/mvc-team-meter-and-dhc.md)
- [mvc-delayed-hyper](../brainstorm/mvc-delayed-hyper.md)
- [mvc-snapback](../brainstorm/mvc-snapback.md)
- [mvc-air-launchers](../brainstorm/mvc-air-launchers.md)
- [mvc-dash-roll-cancel](../brainstorm/mvc-dash-roll-cancel.md)
- [mvc-3v3-select-and-regen](../brainstorm/mvc-3v3-select-and-regen.md)
- [mvc-match-end-rules](../brainstorm/mvc-match-end-rules.md)
- [mvc-training-mode-assists](../brainstorm/mvc-training-mode-assists.md)
- [tag-swap-forced-vs-voluntary](../brainstorm/tag-swap-forced-vs-voluntary.md)
- [team-mode-3v3-spread](../brainstorm/team-mode-3v3-spread.md)

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [sf-crossups-and-jumps](../brainstorm/sf-crossups-and-jumps.md): Jump and cross-up

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### MV-1 Assist, tag and counter core

- Members: [mvc-assists-and-tag](../brainstorm/mvc-assists-and-tag.md), [mvc-variable-assist](../brainstorm/mvc-variable-assist.md), [mvc-variable-counter](../brainstorm/mvc-variable-counter.md), [tag-swap-forced-vs-voluntary](../brainstorm/tag-swap-forced-vs-voluntary.md), [mvc-snapback](../brainstorm/mvc-snapback.md)
- Size: L
- Shared files: src/core/sim/* (team, tag), src/core/data/*, src/core/index.ts
- Flags: SIM, PC
- Parallel: Serial with every SIM bundle.

### MV-2 Team meter, hypers and match rules

- Members: [mvc-team-meter-and-dhc](../brainstorm/mvc-team-meter-and-dhc.md), [mvc-delayed-hyper](../brainstorm/mvc-delayed-hyper.md), [mvc-match-end-rules](../brainstorm/mvc-match-end-rules.md), [mvc-3v3-select-and-regen](../brainstorm/mvc-3v3-select-and-regen.md), [team-mode-3v3-spread](../brainstorm/team-mode-3v3-spread.md)
- Size: L
- Shared files: src/core/sim/*, src/core/rules/*, picker UI for 3v3
- Flags: SIM, PC, needs browser/e2e for the picker
- Parallel: After MV-1; serial with SIM bundles.

### MV-3 Air launchers and cancels

- Members: [mvc-air-launchers](../brainstorm/mvc-air-launchers.md), [mvc-dash-roll-cancel](../brainstorm/mvc-dash-roll-cancel.md), [sf-crossups-and-jumps](../brainstorm/sf-crossups-and-jumps.md)
- Size: M
- Shared files: src/core/sim/* (jump, dash)
- Flags: SIM
- Parallel: Serial with every SIM bundle; shares sf-crossups-and-jumps with SF-2 (do it in one only).
