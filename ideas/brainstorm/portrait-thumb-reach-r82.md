---
status: idea
added: 2026-11-16
---

# Portrait: thumb reach and the 568x320 strike overlap (QA r82, findings 1 and 4)

## Thumb reach at 390x844 (not done in PORTRAIT-P6)

The arena plus bar end at y~315 and the stick and strikes start at y~690, leaving about 370 px of dead black. The bar (Dash, Guard, Super) is the
farthest control from the thumbs. A real fix moves either the bar down (the 44 px skirts and the bar's canvas-drawn icons are tied to the canvas,
so the bar would need its own DOM or a second camera) or makes the canvas taller (crop/zoom of the 16:9 arena, which touches the camera and
every portrait pin). Neither is small and safe, so it is not part of P6. Options, cheapest first: (1) draw the bar into a second canvas strip
placed above the strikes; (2) a taller, cropped arena camera in portrait; (3) a quick-tap Dash/Guard/Super trio beside Strike 1/2 and keep
the bar for status only. The first-run card already uses part of the gap.

## 568x320 landscape: Strike 2 over the foe sprite (not fixed)

Real by design, not a regression: `src/ui/styles/touch-strike-gutter.css` gives right-handed phones a 52 px gutter only from 640 px wide, and its
header says 568 px phones would drop the HUD under its text floors. So at 568 the strikes float over the arena edge. A fix needs a trade
against HUD text size (or a narrower 44 px stacked pair over the arena's bottom-right corner, away from where the foe stands). Shared file
main.css / touch-strike-gutter.css and the HUD floors make it a separate work package with its own screenshots.
