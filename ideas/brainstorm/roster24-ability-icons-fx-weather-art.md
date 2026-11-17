---
status: idea
added: 2026-11-16
---

# Ability icons, effect sprites, weather and terrain art for the 12 roster24 heroes

Goal: new artwork for each roster24 hero: ability icons for the action bar, effect sprites (projectiles, hit marks, status), and any weather and terrain pieces their kits need. Decide GPU generation versus procedural Phaser particles per asset.

Why: roster24 art was scrapped and is being redone ([roster24-art-redo](roster24-art-redo.md)); kits are not playable without icons and effects ([effect-sprite-style-pass](../in-progress/effect-sprite-style-pass.md), [weather-particle-art](../in-progress/weather-particle-art.md)).

- Size: L.
- Dependencies: final roster24 hero art; shares the asset manifest (one agent at a time).
- GPU-suitable: yes for painted icons and sprite sheets; procedural particles for simple effects need no GPU.
- Owner-gated: yes (new artwork; show a sheet first).
