---
paths:
  - "src/ui/**"
  - "src/game/hud/**"
  - "src/game/boot/**"
---
# Player-facing words
- Menu entries: World Tour, Versus, Online, Settings, Help.
- Never show the words Classic, Arcade, ruleset or Capture to players (Snag replaces Capture).
- Visual changes need real-game headless Playwright screenshots before being called done. Never launch a visible browser.
- Shared files, one agent at a time: main.css, Hud.ts, action-bar.ts, arcade-hud.ts, pose-layer.ts, src/game/fx/*.
