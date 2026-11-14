---
status: done
added: 2026-11-14
---

# Versus option rows are cut off on phone portrait (r14)

At 390x844 the Opponent, Team and Arena rows run off the right edge: Two players, 3v3 tag team, Hard and the Water, Earth and Air arena choices are not visible and nothing shows they scroll (03-versus-pp.png). The sticky footer also covers over a third of the screen and the pill overlaps the P1 card.

Fix: let each option row wrap onto two lines on narrow screens and slim the footer to the Fight button.
Fixed 2026-11-14: hints moved out of the sticky bar into the scrolling picker, option rows wrap, pill hidden under 640px. Test: tests/e2e/versus-layout.spec.ts.
