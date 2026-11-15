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

## Progress (hit-weight work package)

- Hit-stop: POSE_HOLD_MS 40-60 to 70-120 ms (about 4-7 frames), wall-clock, view only; zero under reduced motion.
- Recoil snaps to full on tick 0 and holds 2 ticks, then springs back; squash 0.18-0.36, push 9-18 px (was 0.12-0.26, 5-11).
- Spark: white-hot additive contact core (hit-feel `coreFrame`, drawn by hit-streak-view), streaks 4-9 with longer reach and thicker lines.
- Damage number: Hud.ts is off limits here, so a fx-owned punch-in pop (`popFrame`, shock-view `pop`) plays 1.6x to 1x over the HUD number on plain, unscaled hits; the HUD number is unchanged.
- Ghost foe: the pale see-through look came from the additive flash wash (peak 0.5, tail 0.3 over 8 frames) lifting a dark sprite. Peak 0.38, tail 0.12; the sprite alpha is never touched by a hit.
- Capture tool: hit-feel-capture.spec.ts tries gaps 160/120/90/70/55 and cmds 32 then 16 until the foe loses life; HERO=pax FOE=lavax now lands a hit.
- Frames: ~/claudetmp/hit-weight/after (fiara vs treenoc), ~/claudetmp/hit-weight/after-pax. Note: in manual stepping the core and streaks hold (paused), so t16 shows them still.
- Open: a QA pass on real-time play; the HUD number itself is still 38 px (Hud.ts owner could bump it).

## e2e subset (E2E_PORT=7930)
Result recorded in the final report; see progress log ~/claudetmp/progress/qa-r38.log.
