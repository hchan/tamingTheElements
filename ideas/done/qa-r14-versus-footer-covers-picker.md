---
status: done
added: 2026-11-14
---

# Versus sticky footer hides half the picker at 1280x720 (r14)

At 1280x720 the Fight bar, arena hint and Back button take about 330 px of the 720 px screen (03-versus-d.png, 30-picker-2v2.png). With 2v2 selected the partner slot and most hero tiles are hidden behind it, and the tag-team life hint and the More heroes below pill overlap each other.

Fix: keep only Fight and Back in the sticky bar, move the two hint paragraphs into the scrolling content above the hero list, and drop the pill when the list is already visible.
Fixed 2026-11-14: hints moved out of the sticky bar into the scrolling picker, option rows wrap, pill hidden under 640px. Test: tests/e2e/versus-layout.spec.ts.
