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
- Snag: green vine art on water and air heroes; tint by caster element.
- Supers: the banner is clear but the in-world effect is subtle 30 to 65 ticks after cast; check each race again with a tight crop.
- Not shot: Weather, Charge, Dash, Guard, Capture, boss and Dummy abilities.
