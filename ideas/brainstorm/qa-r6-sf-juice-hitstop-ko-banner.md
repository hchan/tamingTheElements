---
status: idea
added: 2026-11-13
---

# QA r6: Street Fighter / Marvel vs Capcom feel gap (juice)

Judged from fights at 1280x720 and 1920x1080 (fight-*.png, ~/claudetmp/qa6/). Combo counters and damage numbers exist; the rest of the genre language is missing.

## Missing

- Hit-stop (2-5 frame freeze on hit) and screen shake on heavy hits.
- Screen flash and zoom on Super; a super banner with the hero name and portrait.
- A big KO / round-end banner ("K.O.", "Round 2", "Fight!") with slow-mo on the last hit.
- Character-name intro cards and a short pose at round start, instead of a 4 s dead intro.
- Hit sparks scaled to element; sound cues are untested in headless runs.
- The Archon II board layer (the second pillar of the pitch) was not visible in any flow played; surface it earlier or the Archon bits are invisible to new players.

## Constraint

Hit-stop must stay presentation-only (renderer freezes, sim ticks keep determinism) or be a deterministic sim feature with goldens re-recorded and a stated reason.
