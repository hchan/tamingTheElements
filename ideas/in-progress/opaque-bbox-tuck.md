---
status: in-progress
added: 2026-11-15
---

# Tuck on the opaque bounding box

wallTuck uses the frame box, not the opaque pixels, so transparent padding leaves a gap or clips art at the wall. Use an opaque bbox per frame.

## Progress

2026-11-26: view side done. `src/game/views/opaque-span.ts` (measure + customData key), `opaque-scan.ts` (canvas scan of boxed portrait-rig frames when the atlas registers, in `pose-sheets.ts`), and `boxSpanX` in `hero-scale.ts` now spans the measured opaque columns, so the wall clamp in `character-view.ts` uses them. Unit test `opaque-span.test.ts`. Left: a real-game screenshot at both walls; the 80 px legacy strips are unboxed and unchanged (unmeasured). No src/core change.
