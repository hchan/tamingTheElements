---
status: done
added: 2026-11-14
---

# Phone landscape HUD text is about 6 px (r15)

At 844x390 the arena is pillarboxed to about 660 px wide with black bars, and the life numbers, SUPER percent and ROUNDS labels are about 6 px, unreadable on a phone. Use the full width (stretch the HUD into the bars) or scale HUD text up in small viewports. See 60-phone-fight-pl.png.

## Done
Hud.ts: Arcade HUD text boost up to 1.7 on phones (life line and SUPER label about 12 CSS px at 844x390); the hero name drops from the life line when it would hit the SUPER label (`compactLabel(.., noName)`). Shot check in tests/e2e/touch-fight-layout.spec.ts (land-hud).
