---
status: idea
---
# Ability graphics defects found by the screenshot pass

From the headless screenshot pass in docs/ABILITY-AUDIT.md (Graphics column). Presentation-only; none were fixed in that pass.

- Rokcore Rock Pellet: tiny and low contrast on earth floors.
- Rokcore Rock Armour and Pax Adrenaline: no visible buff aura; add a tinted outline or pulse.
- Lavax Crimson Fire and Treenoc Strangling Branches: fade to near-invisible or low contrast.
- Fiara Fire Heal: no feedback at full HP; Lavax Fire Dance has no speed aura.
- Snag: green vine art on water and air heroes; tint by caster element.
- Supers: the banner is clear but the in-world effect is subtle 30 to 65 ticks after cast; check each race again with a tight crop.
- Capture (weak): no projectile or cast feedback in the first 10 ticks; the foe is simply swapped at tick 30. Add a throw/flash.
- Weather: the large "Rain!" banner overlaps and clips the top WEATHER HUD bar; move or shrink it.
- Stick (Dummy): grey-white dart goes faint and translucent on the orange fire floor.
- Supers, all nine races shot: banner is clear, but the in-world effect is only a white hit-flash silhouette and damage numbers (11 to 40); each needs its own visible beam, vortex, quake or tide.
- Shot and OK: Chaos Bolt, Chaos Orb, Charge, Dash, Guard. Reproduce with `pnpm visual:abilities` (tests/visual/ability-audit.spec.ts).
