---
status: done
added: 2026-11-13
---

# QA: FIRST BLOOD hint panel covers the middle of the arena

Severity: high. QA evaluator pass 2026-11-13 on main 4ddd5ca4. Screenshots: ~/claudetmp/qa/shots/vp-390x844.png (panel visible behind the rotate overlay)

The first-match hint panel sits mid-arena (about x410-870, y425-605 at 1280x720) over the fighters and obstacles and needs a click on 'Got it'. A new player's first view of combat is blocked. Dock it to a screen edge, make it non-modal, or fade it after the first move. On a phone in portrait the rotate overlay stacks on top of it and the game.

Done 2026-11-13: the card is docked top-left and fades after 8 s.
