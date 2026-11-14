---
status: done
added: 2026-11-14
---

# Portrait touch: Rotate overlay blocks the first-run Got it (r13)

In portrait the Rotate overlay covers the hint, so Got it needs a tap on Play anyway first. The portrait hint card is long. The landscape strip is clean but omits Snag. See 90-touch-port-1v1-hint.png, 90-touch-land-1v1-hint.png.

Fix: hide the hint until the overlay is dismissed, shorten the portrait card.
