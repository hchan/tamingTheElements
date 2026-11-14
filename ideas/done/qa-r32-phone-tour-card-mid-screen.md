---
status: done
added: 2026-11-14
---

# Phone tour hint card is docked, but sits over the lower arena

Fixed: on 844x390 the hint card no longer covers the name banners or ROUND 1. It now floats just above the action bar and blocks the floor in front of the fighters until Got it is tapped. Make it auto-dismiss on first move or shrink it to one line.

Shot: ~/claudetmp/qa-r32/tour-p-fight-1.png.

## Resolution (2026-11-14)

The card already left on the first tap or key and after 2.5 s; the shot caught it before that. Landscape phones now get one short line (`firstRunPhoneLine`: stick, buttons, Snag only when a hero has it) instead of two wrapped paragraphs, and the strip sits lower (`bottom: 19vh`, just above the action bar). Checked at 844x390 (`~/claudetmp/tour-card-r32/land-card.png`). The Got it button stays 44 px tall (touch target), so the strip is one text line plus that button.
