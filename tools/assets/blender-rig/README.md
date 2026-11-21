# Blender rigging pilot (headless)

Pilot for `ideas/in-progress/blender-rigging-pilot.md`. Not wired into the game: output goes to `.scratch/`, never `public/assets`.

- `bake_hero.py`: `blender -b -P` script. Builds a mesh from the painted portrait's alpha (8 px grid), a Blender armature from a
  `tools/assets/portrait-rig/spec/<hero>.json` (bone heads, feathered weight polygons, glows, shadow), skins it with the spec's
  weights, plays the spec's `<hero>.anim.json` curves, and renders every action x direction (E, SE, S, N, NE) with Eevee
  (never Cycles) at 480 px, box-filtered to 240 px frames. Output: `<out>/frames/<action>/<dir>/NN.png` and `<out>/bake.json`.
- `compare.py`: PIL contact sheet (one row per animation, Blender left, shipped portrait-rig bake right), a 1x strip beside
  Fiara and Treenoc, and `metrics.json` (foot-line steadiness, mean area, fringe fraction).

```
nice -n 15 timeout 1500 blender -b -P tools/assets/blender-rig/bake_hero.py -- \
    --spec tools/assets/portrait-rig/spec/pax.json --out .scratch/blender-pax
~/claudetmp/venv/bin/python -I tools/assets/blender-rig/compare.py --hero pax --blender .scratch/blender-pax --out .scratch/blender-pax-compare
```

Needs Blender 5.x (`/opt/homebrew/bin/blender`) and, for `compare.py`, numpy + Pillow (the `~/claudetmp/venv`).

## Results (Mac, Eevee 16 samples, 2x supersample)

| hero | frames | Blender bake | notes |
| --- | --- | --- | --- |
| Pax | 155 (9 actions x 5 dirs) | 16.5 s | matches the shipped bake in colour, pose and ground line; no holes or smearing |
| Rokcore (biped, limb bends) | 155 | 19.2 s | same; arm and leg bends identical in shape to the shipped bake |

The shipped `pnpm assets:bake` path was not timed per hero (it bakes the whole roster and writes into `imgWorkArea/`); the prep step
(`prep.py`) is under a second per hero. See the idea file for the verdict.
Durrok and Quarrak could not be piloted: Durrok has no matte in the tree, and Quarrak (`quarrak-96214.png`) is an unmatted tortoise
with no spec, so a rig for it would be a new body plan plus matte job, not a bake test.

## Limits seen

- The mesh is a flat card: the other directions are only a yaw of the same painting, exactly what the existing sx offsets do.
- The pit shading and rim light from `portrait-rig/prep.py` are not replicated, so the Blender frames read slightly flatter.
- All motion comes from the portrait-rig spec; Blender adds no new capability to a single flat painting.
