---
status: done
added: 2026-11-14
---

# First-run FIRST BLOOD card stays over the arena and the super cut-in

The first-run hint card (FIRST BLOOD, Got it) sits over the lower third of the arena through the round intro and into live play until clicked. In a fresh profile it was drawn over the super cut-in band during a super and over the intro cards. Auto-dismiss it on the first move or attack key, or fade it after a few seconds, and keep it below the cut-in layer.

Shots: ~/claudetmp/qa-r16/super2-sheet.png (top row), 10-water-intro.png, 10-earth-intro.png.

## Resolution (2026-11-26)

Already implemented, no code change needed: the card (src/game/app/first-run-hint.ts) appears only after FIGHT! ends (FIGHT_OVER_EVENT, never over the intro), fades on the first key or tap, after 2.5 s of fight time, and on round over, and leaves at once on SUPER_CUT_EVENT or TAG_CALL_EVENT (or is dropped for the session if a cut came first). Pinned by src/game/app/first-run-hint.dom.test.ts (QA r91/r92). The shots predate commits 8cab9c17, cd7d8d4a, 351e9417. The brainstorm copy of this idea was a stale duplicate and was removed.
