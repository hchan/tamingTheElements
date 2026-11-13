---
status: idea
---
# Ability graphics defects found by the screenshot pass

From the headless screenshot pass in docs/ABILITY-AUDIT.md (Graphics column). Presentation-only; the first batch is fixed (src/game/fx/ability-aura*.ts, SPRITE_BOOST in projectile-view.ts; tests/e2e/ability-fx.spec.ts, SHOT_DIR saves the 1/5/10-tick shots).

Status: done (all items FIXED or OK below).

- FIXED: Rokcore Rock Pellet: tiny and low contrast on earth floors (bigger, gold halo).
- FIXED: Rokcore Rock Armour (orbiting plates) and Pax Adrenaline (rising chevrons): buff auras, shape-coded, reduced-motion static.
- FIXED: Lavax Crimson Fire (drawn at least 96 px long, full-strength pale-gold halo) and Treenoc Strangling Branches (art 1.7x thicker than its box, lime halo at 0.95). Crops (`ABILITY_ONLY=crimson-lavax,branches-treenoc`, ticks 1/5/10/30) show both readable through the whole hit on the fire floor. Pose layer: the spawn ease-in never dims below 55% alpha (was 0) and the end-of-life ghost fades over 220 ms (was 130) from 95% alpha (was 85%).
- FIXED: Fiara Fire Heal (HEAL pop) and Lavax Fire Dance (flame aura).
- FIXED: Snag cast cue (rope lash plus SNAG pop). FIXED: per-element Snag rope art: water (Curomo) draws a kelp-blue cord, air (Echo, Wispera) a wind-spun cord, Treenoc and other earth/fire holders keep the green vine (tools/assets/fx-gen/batch-g-snag-rope.py; picked by caster element in src/game/views/projectile-view.ts `snagSpriteFor`; unit test in projectile-view.test.ts).
- FIXED: Supers get a per-element in-world burst (src/game/fx/super-burst.ts), shape-coded, reduced-motion static.
- FIXED (unshot): Weather call-in banner no longer overlaps the WEATHER bar.
- FIXED: Stick (Dummy): the dart is a brown log, drawn at least 56 px long with a dark normal-blend outline (`SpriteBoost.dark`), readable on the void, sky, earth and water floors shot (`STICK_SEED=1..6`, practice battle). The pale grey-white dart seen on the fire floor was most likely another caster's bolt (the old Classic shot had a random opponent); the fire floor itself was not reproduced for Stick. Unit probes in projectile-view.test.ts and pose-layer.test.ts.
- Shot and OK: Chaos Bolt, Chaos Orb, Charge, Dash, Guard. Reproduce with `pnpm visual:abilities` (tests/visual/ability-audit.spec.ts).
