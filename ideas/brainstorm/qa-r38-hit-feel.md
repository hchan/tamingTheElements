---
status: idea
added: 2026-11-14
---

# QA r38 plain-hit feel (hit-feel-capture.spec.ts, fiara vs treenoc, frames t0,1,2,4,8,16)

Sheet: ~/claudetmp/qa-r38/sheet-hit.png, frames ~/claudetmp/qa-r38/hit-fiara/fiara-hit-t*.png.

- Recoil is now visible: the foe slides roughly 40 px right over 16 ticks and tilts; the attacker stays planted. Better than r37 (none visible).
- But it is a slow slide, not a snap. SF/MvC plain hits read as 2-3 frames of freeze, then a fast shove. Here t0 to t2 look nearly identical (hit-stop is present but the pose does not change, so it reads as nothing), then a gentle drift. Suggest: bigger first-tick displacement (about 60% of the total in the first 2 ticks) then ease out.
- Spark: a small orange ring and slash, about the size of the foe's chest. Reads as a light poke. A larger white-core flash for tick 0-1 on the contact point would sell weight.
- Damage number "7" is small, white and sits beside the foe's head, easy to miss at 1280. Consider bigger, with a quick pop-scale.
- The foe fades to a ghost (alpha) during t8-t16 (stun look) which hides the recoil pose; keep it opaque and use a white/red flash instead.
- The Stun chip at the top (STUN) is fine.
- Capture tool gap: HERO=pax FOE=lavax never landed a hit within 40 steps (probably range/size at 160 px). Make the spec place by hero reach, or accept a $GAP env.

## e2e subset (E2E_PORT=7930)
Result recorded in the final report; see progress log ~/claudetmp/progress/qa-r38.log.
