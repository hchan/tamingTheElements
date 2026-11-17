---
status: epic
added: 2026-11-16
---

# Epic: Platform: touch, portrait, phone and performance

Phones in landscape and portrait, thumb reach, accessibility fixes and runtime performance.

- Suggested order: Phone blockers first (joystick covers hero, versus Fight button offscreen, HUD overlap), then portrait thumb reach and tall arena, then a11y review fixes, then the performance pass.
- Size: L overall.
- Dependencies: portrait-fight-layout work packages (in progress, several agents active); avoid editing the same HUD/CSS files in parallel.
- Owner-gated: Portrait tall arena changes the 1280x720 view contract: confirm before doing.

Member ideas, in suggested priority order (work them as separate small work packages):

- [qa-r22-phone-joystick-covers-hero](../brainstorm/qa-r22-phone-joystick-covers-hero.md): Phone: virtual joystick covers the hero at the left edge. At 844x390 the roughly 130 px joystick sits over the bottom-left of the arena.
- [qa-r22-phone-versus-fight-button-offscreen](../brainstorm/qa-r22-phone-versus-fight-button-offscreen.md): Phone: Versus Fight button below the fold. At 844x390 the Versus page (p-02-versus.png) shows the options and the You/Computer cards, but the hero grid and Fight! are far below, so a player mus
- [qa-r21-phone-hud-and-card-overlap](../brainstorm/qa-r21-phone-hud-and-card-overlap.md): Phone (844x390): HUD still small, joystick covers the play field. p-fire-b-fightbanner.png: Life and SUPER text is readable but small (about 9 px effective);
- [qa-phone-landscape-early](../brainstorm/qa-phone-landscape-early.md): Phone landscape: small play area, docks, no touch controls (QA 2026-11-13, r3, r4). Earliest phone-landscape findings, kept as one file;
- [qa-phone-and-tour-r38-r41](../brainstorm/qa-phone-and-tour-r38-r41.md): Phone layout and Tour card: QA rounds r38 to r41. One file for the phone-landscape (667x375, 844x390) and Tour card findings of r38 to r41;
- [portrait-thumb-reach](../brainstorm/portrait-thumb-reach.md): Portrait: thumb reach and the 568x320 strike overlap. Deferred portrait-layout follow-ups, one file (QA r82 findings 1 and 4 are the second section).
- [portrait-tall-arena](../brainstorm/portrait-tall-arena.md): Portrait tall arena (deferred). The portrait fight uses the 1280x720 view scaled to 390 px wide (about 219 px tall), which leaves most of the screen to controls.
- [portrait-fight-layout](../in-progress/portrait-fight-layout.md) (in progress): Portrait phone fight layout. QA r79, r80 and r81 scored the portrait fight 2.5.
- [a11y-review-fixes](../in-progress/a11y-review-fixes.md) (in progress): A11y review fixes (from the 2026-11-12 reviewer pass). Findings (code reading only; axe-core not yet run):
- [performance-pass](../brainstorm/performance-pass.md): Performance pass (frame time, memory, mobile). Goal: measure and cut frame time, per-tick allocation and memory on desktop and mid-range phones;
