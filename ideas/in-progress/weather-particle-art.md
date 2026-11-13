---
status: in-progress
added: 2026-11-13
---

# Weather particle art pass (view only)

Per element weather (Sun, Rain, Sandstorm, Gale) three grim, desaturated, textured Phaser 4 particle layers (haze behind, flecks in front) over four generated grey textures; they ride the sky-tint fade and are absent under reduced motion. Eclipse keeps its old motes. Code in `src/game/fx/weather-particles*.ts`.

Not done yet: Phaser filters (blur or grain on the haze), freezing emitters while the sim is paused, painted fx sheets for leaves and embers, tuning visibility on the narrow-view pan camera.
