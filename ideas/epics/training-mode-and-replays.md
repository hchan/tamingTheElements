---
status: epic
added: 2026-11-16
---

# Epic: Training mode and replays (cross-cutting)

Training mode, replays and assists practice; members also live in other epics.

- Suggested order: sf-training-mode, then replays-and-training, then training assists.
- Size: M to L.
- Dependencies: Deterministic replay format (docs/DETERMINISM.md).
- Owner-gated: None.

Member ideas, in suggested priority order (work them as separate small work packages):

- [sf-training-mode](../brainstorm/sf-training-mode.md): Training mode. Source of the idea: Street Fighter II / Marvel vs Capcom.
- [replays-and-training](../brainstorm/replays-and-training.md): Replays and training mode. Save, watch and share replays (the replay format and hash checks exist);
- [mvc-training-mode-assists](../brainstorm/mvc-training-mode-assists.md): Assist and team training. Source of the idea: Marvel vs Capcom 2. Training mode records and replays a dummy assist;

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### TM-1 Training mode, replay viewer and assists

- Members: [sf-training-mode](../brainstorm/sf-training-mode.md), [replays-and-training](../brainstorm/replays-and-training.md), [mvc-training-mode-assists](../brainstorm/mvc-training-mode-assists.md)
- Size: L
- Shared files: new scene files, src/core/replay/*, src/ui/* (entry), docs/REPO-MAP.md, src/core/index.ts
- Flags: needs browser/e2e; assist part waits for MV-1; no existing golden changes; entry point must fit the five-entry menu (owner decision)
- Parallel: Serial with anything touching REPO-MAP.md or src/core/index.ts; parallel with FX and art.
