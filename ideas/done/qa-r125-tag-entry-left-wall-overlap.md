# Tag-in entry still overlaps the foe next to the left wall
status: done
added: 2026-11-21

After the tag-in direction fix (src/game/views/tag-entry.ts, qa-r125), the real-game check shows the incoming hero clears the foe in the foe-left, foe-right and right-wall cases. Next to the LEFT wall with the foe on the right, Pax's box is clamped at x=0 (0-160) while Fiara is at 99-260: about 60 px overlap at the swap tick.

Cause not confirmed (likely a render clamp at the arena edge). Options: let the slide start off-screen (hero slides in from beyond the wall), or enter from the foe-side when the away side has no room. Render-only; do not grow pose-layer.ts (966, at cap). Needs a real-game screenshot with hold-3 at the left wall.

## Progress note (2026-11-26)
Cause: the wall case already dropped the hero in from above (dir 0), but only 90 px, so the sprite still sat on the foe. Fix (render only): a wall entry now drops from TAG_IN_DROP_PX (240 px, about a body height) via tagEntryDrop in src/game/views/tag-entry.ts; pose-math.ts uses it. Unit test in tag-entry.test.ts. Real-game headless screenshot (left wall, foe at x=180, tag on 3): the incoming hero starts faded above the foe, not on it. The screenshot spec is not committed (a new e2e needs test-tiers and e2e-durations entries).
