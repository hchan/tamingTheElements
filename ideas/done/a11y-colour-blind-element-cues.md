---
status: done
added: 2026-11-12
---

# Colour-blind safe element cues in the arena

Audit fire/water/earth/air tints (trap markers, HUD bars, terrain patches) for deuteranopia and tritanopia; add shape or letter cues where colour is the only difference. Run a simulated-CVD screenshot review with Playwright.

Done 2026-11-12: HUD portrait, Arcade avatar and bench frames carry a white element silhouette on a dark chip (`src/game/hud/element-mark.ts`, same shapes as the word glyphs); Versus roster tiles show the tour-map shape beside the element word. Already word-cued: active hero text, garrison badge, details, tour pins. Not changed: hit sparks and terrain tints (colour only, decorative; the words/HUD carry identity).
