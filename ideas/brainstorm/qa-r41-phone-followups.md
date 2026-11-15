---
status: idea
added: 2026-11-14
---

# QA r41: phone follow-ups after the r40 fixes

r40 fixes verified at 667x375 and 844x390: Strike 1 now fits inside the right edge, the first-run hint docks left of the Strike buttons and no longer sits mid-arena, and the Tour card at 667x375 has no label collisions (stage list, FIGHT / MAIN MENU all readable).

Still open (screenshots ~/claudetmp/qa-r41/s/):
- ph-fight2.png (2v2, 667x375): names truncate to "SIND..." / "ROKC..." and the two TAG portraits sit under the centre timer, crowding the life bars. Consider hiding bench portraits' TAG caption or shrinking them on narrow widths.
- ph-picker2v2.png (667x375): "Your partne..." label truncated, and the Swap up / Clear buttons are clipped under the Fight bar; the picker needs a scroll hint or a shorter row.
- ph-fight1.png: the hint box ("Stick moves you. Tap the bar...") still covers about a third of the lower arena on 667x375 until dismissed; auto-dismiss after the first Strike would clear it.
