---
status: idea
---
# Ability graphics defects found by the screenshot pass

From the headless screenshot pass in docs/ABILITY-AUDIT.md (Graphics column). Presentation-only; the first batch is fixed (src/game/fx/ability-aura*.ts, SPRITE_BOOST in projectile-view.ts; tests/e2e/ability-fx.spec.ts, SHOT_DIR saves the 1/5/10-tick shots).

Status: partly done. Still open are the items not marked FIXED below.

- FIXED: Rokcore Rock Pellet: tiny and low contrast on earth floors (bigger, gold halo).
- FIXED: Rokcore Rock Armour (orbiting plates) and Pax Adrenaline (rising chevrons): buff auras, shape-coded, reduced-motion static.
- IMPROVED: Lavax Crimson Fire and Treenoc Strangling Branches: halo boost only; the sprite art and its late fade (pose layer) are untouched, so re-check with a crop.
- FIXED: Fiara Fire Heal (HEAL pop) and Lavax Fire Dance (flame aura).
- FIXED: Snag cast cue (rope lash plus SNAG pop). IMPROVED: vine art on water and air heroes still green, now with a neutral rope halo; real per-element tint needs new art.
- FIXED: Supers get a per-element in-world burst (src/game/fx/super-burst.ts), shape-coded, reduced-motion static.
- FIXED (unshot): Weather call-in banner no longer overlaps the WEATHER bar.
- Stick (Dummy): grey-white dart goes faint and translucent on the orange fire floor.
- Shot and OK: Chaos Bolt, Chaos Orb, Charge, Dash, Guard. Reproduce with `pnpm visual:abilities` (tests/visual/ability-audit.spec.ts).
