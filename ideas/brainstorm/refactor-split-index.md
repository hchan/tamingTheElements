---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor split backlog: ranked index

Order: render-only files first (cheap, Sonnet, no golden risk), biggest first; src/core files after, each needing an Opus plan. One agent per file; REPO-MAP.md is shared, so serialise the REPO-MAP edits.

## Render-only (src/game, src/ui): Sonnet
1. [src/game/scenes/Hud.ts](refactor-split-Hud.md) (1219 lines)
2. [src/ui/screens/arcade-versus.ts](refactor-split-arcade-versus.md) (972 lines)
3. [src/game/views/pose-layer.ts](refactor-split-pose-layer.md) (966 lines)
4. [src/game/scenes/Arena.ts](refactor-split-Arena.md) (824 lines)
5. [src/game/fx/defence-view.ts](../done/refactor-split-defence-view.md) (704 lines, split 2026-11-27)
6. [src/game/hud/action-bar.ts](refactor-split-action-bar.md) (695 lines)
7. [src/game/fx/terrain-view.ts](refactor-split-terrain-view.md) (631 lines)
8. [src/game/fx/super-view.ts](refactor-split-super-view.md) (569 lines)
9. [src/ui/screens/tour.ts](refactor-split-tour.md) (542 lines)

## Deterministic core (src/core): Opus plan first, golden risk
10. [src/core/relay/core.ts](refactor-split-relay-core.md) (885 lines)
11. [src/core/agents/scripted-ai/arcade.ts](refactor-split-scripted-ai-arcade.md) (780 lines)
12. [src/core/net/session.ts](refactor-split-net-session.md) (709 lines)
13. [src/core/agents/scripted-ai/arcade-ai.ts](refactor-split-scripted-ai-arcade-ai.md) (587 lines)
14. [src/core/data/arcade.ts](refactor-split-data-arcade.md) (569 lines)
