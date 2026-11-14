---
status: idea
added: 2026-11-14
---

# QA r35: re-check of the r34 fixes

- PAX IN! overlap: partly fixed. The call no longer sits on the life bars, but at 1280x720 it still draws over the swapping fighters and a damage number ("30") for the first ~300 ms (tag-1280-0/1). Idea: float it higher, above the heads, or anchor it to the HUD tag slot.
- First-run card after FIGHT!: works in the normal flow (intro-3..5: ROUND 1 clears, then the card appears). Under slow SwiftShader frames the card and FIGHT! were still on screen together (rt-Earth-d-3500, rt-Air-d-3500), so the hold looks wall-clock based while FIGHT! is tick based. Idea: gate the card on the sim's round-start event, not a timer. (manual=1 shows both together by design, since the fade clock does not advance.)
- Plain-hit streaks: visible and readable top-right ("4 HITS / 53 DMG" in gold, clear of the weather chip), with stacked floating numbers and an impact ring. Recoil and shake read as modest; an SF plain hit has more hit-stop and body shove. Idea: 2-3 frames of hit-stop on every plain hit.
- Phone HUD names: bigger (test passes at >= 9.5 px on 667x375 and 844x390), but long names still truncate ("SINDARO..." at 667 and on the 844 Tour card). Idea: shorten to a 6-letter tag or drop the HP text on phones first.
