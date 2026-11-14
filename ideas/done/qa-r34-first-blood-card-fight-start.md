---
status: done
added: 2026-11-14
---

# FIRST BLOOD tutorial card sits over FIGHT! at round start

On desktop the first-run card ("FIRST BLOOD ... Got it") is already docked low in the arena while FIGHT! fades, and its text is faint against the floor. It competes with the round intro. Idea: hold the card until FIGHT! has cleared, or raise its text contrast on desktop as was done for phone.

Screenshot: ~/claudetmp/qa-r34/2v2-start-1280.png

## Resolution

Resolved 2026-11-14: the card stays hidden for INTRO_HOLD_MS (2.6 s, ROUND 1 plus FIGHT!) after the arena is built (first-run-hint.ts afterArenaCreate), so it fades after FIGHT! and shows at full contrast. Checked with headless 1280x720 screenshots (~/claudetmp/qa-r34b/start-2.png, start-4.png).
