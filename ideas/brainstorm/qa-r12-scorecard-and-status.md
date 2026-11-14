---
status: idea
added: 2026-11-14
---
# QA r12 scorecard and status (headless Playwright, 1280x720, 844x390, 390x844 touch)

Method: test build on port 7970, real-time keyboard fights, Versus 1v1 and 2v2, stubbed gamepad (navigator.getGamepads), touch contexts. Screenshots in ~/claudetmp/qa-r12/ (disposable). No page errors in any run.

| Area | r11 | r12 | Note |
|---|---|---|---|
| Fun / feel | 3 | 3 | Snag lash plus SNAG word, TAG! call and bench cards read well. Sindarosa (272 life) still loses 148 life in about 1 s to Fiara (679): lopsided. |
| Graphics | 3.5 | 3.5 | Unchanged. |
| Readability | 3 | 3.5 | First-run card is now a strip above the bar and no longer covers the fighters on desktop. Round-end panel not reached (see qa-r12-roundend-not-reached). |
| Intro / first run | 3 | 3.5 | Desktop good; on touch landscape the card still covers the arena centre. |
| Mobile | 2.5 | 2.5 | Stick and 48px buttons work, but small, letterboxed, header collisions. |

Covered now: C throws Snag (works for Curomo; rope lash and SNAG word; slot greys on cooldown), 2v2 Tag key 3 (TAG! call, IN/BENCH lines, cooldown), gamepad stick moves the hero, touch controls present in fight, Key Bindings screen.
Not found: an SF key preset in Key Bindings (only Reset to defaults), see qa-r12-keybindings-gaps.
New findings: qa-r12-touch-fight-layout, qa-r12-keybindings-gaps, qa-r12-tag-and-snag-feedback, qa-r12-roundend-not-reached.
