---
status: idea
added: 2026-11-16
---

# Blender rigging pilot (headless, driven by Claude Code)

Owner asked 2026-11-16 whether to rig heroes with Blender. Approved a one-hero pilot.

- Headless only: `blender -b -P script.py`, Eevee, no GUI window. Scripts live in `tools/assets/` and are reproducible.
- Pilot hero: one roster24 creature (Durrok, Quarrak or Kindrel) after the art is approved.
- Compare with `tools/assets/portrait-rig/` on bake quality, time and frame count; keep Blender only if clearly better.
- Blender is NOT installed on the Mac; installing it needs owner approval (about 400 MB, Homebrew cask or dmg).
- Risks: flat cutouts need a per-hero mesh, look must match Fiara's baked style, Cycles would load the Mac (use Eevee).
