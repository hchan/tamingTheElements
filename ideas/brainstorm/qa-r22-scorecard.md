---
status: idea
added: 2026-11-14
---

# QA r22 scorecard

Headless Chromium (SwiftShader), real-time input, dev server port 7922. Screenshots in `~/claudetmp/qa-r22/` (`h-*` hero sweep, `d-*` desktop stages, `v-*` Versus, `t-*` Tour, `p-*` phone 844x390, `i-*` Curomo Ice Shock).

Scores (0-5), r21 in brackets:

- Fun: 3.5 (3.5). Versus pick now works; Tour fight is a 3v3 tag with a tutorial card, good. Hits still mostly trade.
- Graphics: 3.5 (3.5). The four staged arenas look luminous and painterly; the `?hero=&foe=` demo arena and some pale-on-pale heroes do not.
- Readability: 3.5 (4.0). Phone joystick covers the hero at the left edge; Wispera vanishes on the air stage; Fire and Earth telegraphs still weak.

Covered: all 12 heroes via `?hero=X&foe=Y` (rotating foes, no console errors; characters() reports the right pairs), four stages with hazard warn and active phases, Versus single-click pick (fixed: Curomo 545 HP, picker and fight agree), Tour stage select, FIGHT and a 40 s tour fight, phone Versus, fight, super and hazard.

Positive: the Versus single-click hero pick (r21 bug) is fixed; tide chevrons and gale band stay legible; STUN/SNAGGED/ROOTED chips are clear; the phone letterbox is gone.

Findings: qa-r22-demo-arena-dark-debug-hud, qa-r22-wispera-invisible-on-air-stage, qa-r22-phone-joystick-covers-hero, qa-r22-phone-versus-fight-button-offscreen, qa-r22-fire-earth-telegraph-still-weak, qa-r22-tour-start-needs-second-fight-click, qa-r22-ice-shock-no-visible-fx.
