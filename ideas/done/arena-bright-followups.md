---
status: done
added: 2026-11-14
---
# Arena brightness follow-ups: Ishimi FX box and dark-hero rim light

From arena-bright: the Ishimi FX rectangle bug is not fixed, dark heroes (Echo) still read dark on the air floor and need a rim light.

Done 2026-11-14:
- Ishimi: the sprite was clipped flat at the 80x80 frame edges (the rectangle). tools/assets/rig-gen/ishimi.py now fits and lifts all parts and shortens the cast tendrils; rebaked sheets have no opaque pixel on any frame edge. Checked in ability-fx e2e (ishimi-circus, ishimi-blast). The legacy circus-of-slime swirl projectile art is unchanged.
- Rim light: `GLOW_SPRITES` heroes (Echo, Wispera) get a soft additive halo behind the body besides the ground glow (src/game/views/character-view.ts). floor-backgrounds e2e now also shoots Echo on the air floor.
- Earth crystal prop redrawn (faceted shafts, inner glow, painterly dabs) in src/game/fx/terrain-props.ts.
