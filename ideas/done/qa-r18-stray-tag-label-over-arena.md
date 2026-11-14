---
status: done
added: 2026-11-14
---

# A floating "TAG" word sits above the ability bar in 2v2 (r18)

In the 2v2 arena (Curomo and Pax, arenaDemo) a small "TAG" caption floats at about x=408, y=603 (above the Tag slot, over the floor) at 1280x720, and also at 844x390 (x=277, y=319). It is the slot's hint label drawn outside the bar and reads as stray text. Idea: put it inside the slot or drop it, since the slot already says Tag and shows key 3. Check: no loose text between the arena floor and the ability bar.

Done 2026-11-14: Dropped the floating TAG caption (tag-view.ts); the third action-bar slot already reads Tag with key 3, and the HUD pill keeps the cooldown words. Owner can overrule.
