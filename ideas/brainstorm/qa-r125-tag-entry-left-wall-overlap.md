# Tag-in entry still overlaps the foe next to the left wall
status: idea
added: 2026-11-21

After the tag-in direction fix (src/game/views/tag-entry.ts, qa-r125), the real-game check shows the incoming hero clears the foe in the foe-left, foe-right and right-wall cases. Next to the LEFT wall with the foe on the right, Pax's box is clamped at x=0 (0-160) while Fiara is at 99-260: about 60 px overlap at the swap tick.

Cause not confirmed (likely a render clamp at the arena edge). Options: let the slide start off-screen (hero slides in from beyond the wall), or enter from the foe-side when the away side has no room. Render-only; do not grow pose-layer.ts (966, at cap). Needs a real-game screenshot with hold-3 at the left wall.
