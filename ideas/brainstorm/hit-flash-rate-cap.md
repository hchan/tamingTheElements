---
status: idea
added: 2026-11-12
---

# Hit flash rate cap (a11y)

Repeated hits can flash a target more than 3 times a second (WCAG 2.3.1 general flash threshold). Add a minimum gap per target
between hit flashes in `src/game/fx/event-fx.ts` / the character view; keep the reduced-motion path at no flash or a soft tint.
Found by the a11y agent, 2026-11-12.
