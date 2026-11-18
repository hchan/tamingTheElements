---
status: epic
added: 2026-11-12
---

# Epic: Street Fighter feel

Moment-to-moment combat feel: hit-stop, links, stun, crossups, supers, timers. Sim-changing items run one agent at a time.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [sf-mvc-feel](../brainstorm/sf-mvc-feel.md)
- [sf-hit-stop-juice](../done/sf-hit-stop-juice.md)
- [sf-light-medium-heavy](../brainstorm/sf-light-medium-heavy.md)
- [sf-combo-links-cancels](../brainstorm/sf-combo-links-cancels.md)
- [sf-special-move-inputs](../brainstorm/sf-special-move-inputs.md)
- [sf-chip-and-hitstun-tuning](../brainstorm/sf-chip-and-hitstun-tuning.md)
- [sf-stun-dizzy-bar](../brainstorm/sf-stun-dizzy-bar.md)
- [sf-crossups-and-jumps](../brainstorm/sf-crossups-and-jumps.md)
- [sf-throws](../brainstorm/sf-throws.md)
- [sf-super-cinematics](../brainstorm/sf-super-cinematics.md)
- [sf-round-timer-draws](../in-progress/sf-round-timer-draws.md)
- [sf-tick-draw-cpu-win](../brainstorm/sf-tick-draw-cpu-win.md)
- [sf-turbo-game-speed](../brainstorm/sf-turbo-game-speed.md)
- [health-bar-status-icons](../in-progress/health-bar-status-icons.md)

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### SF-1 Normals, links and special inputs

- Members: [sf-mvc-feel](../brainstorm/sf-mvc-feel.md), [sf-light-medium-heavy](../brainstorm/sf-light-medium-heavy.md), [sf-combo-links-cancels](../brainstorm/sf-combo-links-cancels.md), [sf-special-move-inputs](../brainstorm/sf-special-move-inputs.md), [sf-chip-and-hitstun-tuning](../brainstorm/sf-chip-and-hitstun-tuning.md)
- Size: L
- Shared files: src/core/sim/*, src/core/data/*, input mapping, goldens
- Flags: SIM (Opus plan), PC; sf-mvc-feel is the umbrella: read it first
- Parallel: Serial with every SIM bundle.

### SF-2 Dizzy, throws, jumps and status icons

- Members: [sf-stun-dizzy-bar](../brainstorm/sf-stun-dizzy-bar.md), [sf-crossups-and-jumps](../brainstorm/sf-crossups-and-jumps.md), [sf-throws](../brainstorm/sf-throws.md), [health-bar-status-icons](../in-progress/health-bar-status-icons.md)
- Size: L
- Shared files: src/core/sim/*, Hud.ts (icons)
- Flags: SIM, needs browser/e2e for the icons
- Parallel: After SF-1; serial with HUD bundles for the icon part.

### SF-3 Timer, draws and game speed

- Members: [sf-round-timer-draws](../in-progress/sf-round-timer-draws.md), [sf-tick-draw-cpu-win](../brainstorm/sf-tick-draw-cpu-win.md), [sf-turbo-game-speed](../brainstorm/sf-turbo-game-speed.md), [sf-super-cinematics](../brainstorm/sf-super-cinematics.md)
- Size: M
- Shared files: src/core/rules/*, src/game/loop/*, super cinematic fx
- Flags: SIM (draw rules), needs browser/e2e
- Parallel: Serial with SIM bundles; fx part serial with SC-1.
