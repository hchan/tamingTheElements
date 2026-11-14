---
status: in-progress
added: 2026-11-13
---

# Portraits and icons from the baked hero sheets

The HUD portrait, hero-select grid and panel, Versus pick tiles, garrison avatars and character details all read the legacy-layout strip
`public/assets/img/map/<hero>.png` (first frame). Only Pax had been regenerated, so eleven heroes still showed the old humanoid art.
`tools/assets/rig-gen/pax-portrait.py` now rebuilds the strip for every hero (or the named ones) as an exact crop of the sheet's idle/E frames
(deterministic, no resampling). Re-run it after any `pnpm assets:bake && pnpm assets:sheets`.

Wispera and Echo (pale air on dark floors) get a soft additive ground glow from `CharacterView` (`GLOW_SPRITES` in `src/game/views/character-view.ts`),
display only, no change to the rig parts.

2026-11-13: the strip builder moved to `tools/assets/portrait-rig/map-strips.py`; it reads the frame rects from the sheet manifest and
handles any frame size, including the 240 px portrait-rig frames of Pax, Sindarosa and Curomo. `rig-gen/pax-portrait.py` is a shim
for it. See [hero-rig-from-portraits](hero-rig-from-portraits.md) and ADR-0020.

Open: the `<hero>Large.png` 400x400 images are still legacy (nothing in src reads them); jagged cast-frame edges are a rig-generator matter
(another agent owns the rigs); the action-bar icon atlas (`hud-gen/actions.py`) was already redone and is unchanged.
