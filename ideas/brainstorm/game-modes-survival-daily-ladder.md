---
status: idea
added: 2026-11-16
---

# More game modes: survival, daily challenge, ladder

Goal: add Survival (endless run with carried-over health), a Daily Challenge (fixed seed and modifiers per date, shareable result) and a ladder, alongside the existing Archon-style board mode ideas.

Why: replay value beyond Play, Versus and Online. See [archon-board-layer](archon-board-layer.md), [wow-arena-ladder-seasons](wow-arena-ladder-seasons.md), [tour-ladder-roster-pin](tour-ladder-roster-pin.md).

- Size: L (each mode M; the board mode L).
- Dependencies: seeded sfc32 streams already exist; modifiers that change the sim need a SIM_VERSION bump and are one agent at a time. Player-facing names must avoid Classic, Arcade, ruleset and Capture.
- GPU-suitable: no (menu art stills only, optional).
- Owner-gated: yes (new modes and menu entries; the menu is fixed at five entries).
