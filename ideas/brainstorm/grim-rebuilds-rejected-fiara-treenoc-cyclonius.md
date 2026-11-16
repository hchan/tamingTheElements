---
status: idea
added: 2026-11-15
---

# Grim rebuilds of Fiara, Treenoc and Cyclonius were rejected

Owner, 2026-11-15: "Fiara and Treenoc: original is better than your new one", then Cyclonius too (its small 80x80 info-card and
picker portrait read as a dark smudge).

What was reverted (art only, back to the state at `81253fee^`): the rigs, baked sheets and map portrait strips of Fiara, Treenoc and
Cyclonius. Fiara is again the owner-approved sheet cut from the legacy sprite (1480d536), Treenoc the 8ab87307 rig-gen version,
Cyclonius the pre-pilot rig. Removed with them: `tools/assets/rig-gen/fiara.py`. Rebuilds that were rejected: 81253fee (pilot grim rigs),
234d08c6 + c482ffd0 (Treenoc/Fiara grim rebuild and regenerated map strips).

Lessons for any future redo of these three:
- Judge at the size the player sees: the 80x80 portrait on the picker and info card, not the 4096 px sheet.
- Grim and desaturated lost to the original's readable silhouette and colour; keep the legacy colour identity and contrast.
- Needs an explicit owner yes on a side-by-side with the legacy portrait before replacing a hero's art.

Status: brainstorm only; nothing planned.
