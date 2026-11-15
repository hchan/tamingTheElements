---
status: idea
added: 2026-11-14
---

# QA r38 smaller desktop findings (1280x720)

- Terrain chips: the r37 collision with TAG! / SINDAROSA IN! is fixed (chips hid under the call in tag-0..2 frames). The chips themselves (FIRE x2, WATER +HP, AIR x2) are still plain pill labels floating at random spots; WATER +HP and AIR x2 are low-contrast pale on the pale stage. Give them a darker plate on water and air stages.
- Earth stage: the turquoise crystal prop sits right at the fighter spawn and overlaps Rokcore; reads as clutter (sheet-a.png row 3 left).
- First-run "FIRST BLOOD" key hint bar with Got it overlaps the lower-left of the arena on every stage; it is dense (one long line of keys).
- Versus picker at 1280 is dense: the 2v2 explanatory paragraph and the ability text push hero cards partly off-screen; "More heroes below" is needed even on desktop.
- Super: the GLACIER CRASH cut-in is strong (dimmed arena, banner, element portrait). The impact burst after it is a thin white fan; make it larger for the payoff.
- In 2v2 after a tag, the incoming hero spawns overlapping the foe in my scripted frames (may be my place() artefact); worth a check that tag-in position is not on top of the opponent.
