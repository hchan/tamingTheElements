---
status: idea
added: 2026-11-14
---
# Touch fight layout (r12)

844x390 landscape, 2v2: the FIRST BLOOD card (stick text) sits over the arena centre and the fighters until Got it is tapped; the arena is letterboxed with black side bars so the HUD is tiny; the bench portraits overlap the SUPER label and clip the life text ("Life 62/210 HU"). Action buttons are 48px and sit bottom centre. 390x844 portrait shows a Rotate prompt over the fight with Play anyway; the card behind it is full-height text.

Fix: shrink the card on touch or dock it above the buttons, fill the width on landscape phones, move bench cards clear of the life text.

Progress 2026-11-14 (touch-letterbox): First-run card on landscape phones now sits higher (bottom 24%, max 50% wide) so it no longer covers the "TAG" caption over the swap slot or the fighters; on portrait phones it docks just under the canvas instead of the screen bottom, clear of the stick (Got it was under the stick). Landscape side bars are tinted like the HUD band (CSS) instead of dead black; the stick lives in the left bar. Asserted in tests/e2e/touch-fight-layout.spec.ts; shots in ~/claudetmp/touch-letterbox/{before,after}. Still open: truly widening the playfield into the bars needs a wider logical arena (sim change, out of scope), and bench portraits vs the SUPER label. Status stays idea.
