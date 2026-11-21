---
status: in-progress
added: 2026-11-16
---

# Blender rigging pilot (headless, driven by Claude Code)

Owner asked 2026-11-16 whether to rig heroes with Blender. Approved a one-hero pilot.

- Headless only: `blender -b -P script.py`, Eevee, no GUI window. Scripts live in `tools/assets/` and are reproducible.
- Pilot hero: one roster24 creature (Durrok, Quarrak or Kindrel) after the art is approved.
- Compare with `tools/assets/portrait-rig/` on bake quality, time and frame count; keep Blender only if clearly better.
- Blender 5.3.0 is now installed at /opt/homebrew/bin/blender.
- Risks: flat cutouts need a per-hero mesh, look must match Fiara's baked style, Cycles would load the Mac (use Eevee).

## Progress note (2026-11-20, Sonnet agent, worktree branch worktree-agent-a1fa67d7d7538fcbe)

Built `tools/assets/blender-rig/` (`bake_hero.py`, `compare.py`, README): headless Blender 5.3 Eevee, mesh from the portrait alpha,
armature and weights from the existing `portrait-rig/spec/<hero>.json`, motion from `<hero>.anim.json`, 240 px frames at 2x supersample.

Results (all 9 actions x 5 dirs = 155 frames each, `nice`, Eevee 16 samples):
- Pax: 16.5 s Blender wall time. Rokcore (biped, bending limbs): 19.2 s. No holes, smearing or ribbons in either.
- Contact sheets (Blender left, shipped portrait-rig right, plus a 1x strip next to Fiara and Treenoc): in the worktree
  `.scratch/blender-pax-compare/{sheet,strip1x,strip1x_x3}.png` and `.scratch/blender-rokcore-compare/`. Metrics in `metrics.json`
  beside them: area within 1%, foot line steady within 1-2 px (portrait-rig is steadier, 0 px), fringe fraction slightly lower.
- Effort: about one session for the script; a new hero still needs a spec (bone heads and weight polygons), the same work as
  portrait-rig, because the Blender rig reuses that spec.

Verdict: NOT clearly better, so do not adopt Blender for the roster. Same painting, same bones, same skin weights, same small
motion; a flat card yawed for SE/S/N/NE is what the existing sx offsets already do, so there is no true 3D gain. Blender lacks the
rim light and pit shading of `prep.py` (the frames read slightly flatter), is a new 400 MB dependency, and is not byte-deterministic
across machines (the ss2 bake is). It would only pay off with a genuine 3D or multi-layer asset (separate painted limb layers
or a sculpted mesh), which is a different art job than this pilot.

Not done: Durrok has no matte in the tree and Quarrak (`quarrak-96214.png`) is an unmatted tortoise with no spec, so the
coordinator's second pilot used Rokcore (biped, existing spec and shipped bake). Kindrel and Ouroth not attempted. The art-director
has not judged these sheets; the verdict is mine.
