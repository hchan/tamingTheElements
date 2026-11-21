---
status: idea
triaged: real (large, subjective feel; most items done, 3 small leftovers, needs human real-time look)
added: 2026-11-14
---

# Plain-hit feel: QA rounds r34 to r40

One file for the repeated "plain hits feel light" finding and its capture tooling. Frame paths cited below were scratch files of the QA runs and may no longer exist.

Merged from: `qa-r34-plain-hit-feel`, `qa-r37-hit-feel-capture`, `qa-r38-hit-feel`, `qa-r39-hit-feel`, `qa-r40-hit-feel-and-stages` (old file names kept here so older scorecards that cite them still resolve).

<!-- merged from qa-r34-plain-hit-feel.md (added 2026-11-14) -->
## Plain hits still feel light (third round running)

Hit flash and numbers are fine, but a basic strike lacks weight next to Street Fighter: little hitstop and screen punch on normal hits. Idea: a 2-3 tick freeze plus a tiny camera nudge scaled by damage on non-super hits.

### Progress

2026-11-14: Presentation-only pass done. Every plain hit now throws a directional streak fan (3/5/7/9 by strength, `hit-streak-view.ts`), squashes and shoves the victim about its feet (`recoilPose`, view-tick keyed), nudges the camera even on light hits, and the arcade thump cue is louder with a noise crack layer. All skipped under reduced motion. Unit tests added; a headless shot confirmed the victim squash, but the streak fan was not clearly visible in the arenaDemo projectile shot, so it stays in brainstorm pending a closer look at melee hits. Sim hit-stop length is unchanged (sim-side, out of scope).

2026-11-14 (verify): Root cause of the invisible fan: under manual stepping (`paused()`), the streak layer never drew, and a fresh streak is zero-length at age 0. Now it draws while paused (new fans start 50 ms in, held). Also thicker, longer (reach +22%, 260 ms, brighter element body under the pale core). Headless shots in manual Versus (`?hero=curomo&foe=rokcore&manual=1`) show a clear luminous fan at the impact; unit test `hit-streak-view.test.ts` pins first-frame visibility. Real-time bursts could not be captured (SwiftShader screenshots take ~500 ms vs a 260 ms streak); real-time uses the same draw path with age advancing. Camera shake was not separately captured (a camera effect, unit-tested, not visible in static shots). Left in brainstorm for a human look at real-time feel.

2026-11-14 (r35 hit-stop): Render-side hit-stop added (view only, sim and goldens untouched). On a landed hit `PoseLayer` holds its animation clock 40/46/52/60 ms by strength (`poseHoldMs`, hit-feel.ts) so the victim's hurt pose and the attacker's pose read as a beat while the sim keeps ticking; manual stepping keeps the hold, reduced motion skips it. Recoil squash/shove raised (squash 0.09-0.24, push 3-10 px) and light/medium/heavy camera shakes boosted x1.5/1.4/1.25 (`shakeBoost`). Unit-tested (hit-feel, event-fx, pose-layer); arcade-juice e2e passes. Real-time feel not captured (SwiftShader frame times exceed the 40-60 ms hold), so it stays in brainstorm for a human look.

<!-- merged from qa-r37-hit-feel-capture.md (added 2026-11-14) -->
## QA r37: capture a clean plain-hit frame sequence for hit-feel review

The QA harness (~/claudetmp/qa37/play.mjs `hit` mode) places both fighters at x 800/900 and they overlap, hiding recoil and hit-stop. Add a stable e2e/tool that places fighters at melee range without overlap, fires one strike, and saves frames at ticks 0,1,2,4,8,16 (hit-stop, recoil distance, spark, number, streak). That would let reviewers score plain-hit weight objectively instead of from stills.

<!-- merged from qa-r38-hit-feel.md (added 2026-11-14) -->
## QA r38 plain-hit feel (hit-feel-capture.spec.ts, fiara vs treenoc, frames t0,1,2,4,8,16)

Sheet: ~/claudetmp/qa-r38/sheet-hit.png, frames ~/claudetmp/qa-r38/hit-fiara/fiara-hit-t*.png.

- Recoil is now visible: the foe slides roughly 40 px right over 16 ticks and tilts; the attacker stays planted. Better than r37 (none visible).
- But it is a slow slide, not a snap. SF/MvC plain hits read as 2-3 frames of freeze, then a fast shove. Here t0 to t2 look nearly identical (hit-stop is present but the pose does not change, so it reads as nothing), then a gentle drift. Suggest: bigger first-tick displacement (about 60% of the total in the first 2 ticks) then ease out.
- Spark: a small orange ring and slash, about the size of the foe's chest. Reads as a light poke. A larger white-core flash for tick 0-1 on the contact point would sell weight.
- Damage number "7" is small, white and sits beside the foe's head, easy to miss at 1280. Consider bigger, with a quick pop-scale.
- The foe fades to a ghost (alpha) during t8-t16 (stun look) which hides the recoil pose; keep it opaque and use a white/red flash instead.
- The Stun chip at the top (STUN) is fine.
- Capture tool gap: HERO=pax FOE=lavax never landed a hit within 40 steps (probably range/size at 160 px). Make the spec place by hero reach, or accept a $GAP env.

### Progress (hit-weight work package)

- Hit-stop: POSE_HOLD_MS 40-60 to 70-120 ms (about 4-7 frames), wall-clock, view only; zero under reduced motion.
- Recoil snaps to full on tick 0 and holds 2 ticks, then springs back; squash 0.18-0.36, push 9-18 px (was 0.12-0.26, 5-11).
- Spark: white-hot additive contact core (hit-feel `coreFrame`, drawn by hit-streak-view), streaks 4-9 with longer reach and thicker lines.
- Damage number: Hud.ts is off limits here, so a fx-owned punch-in pop (`popFrame`, shock-view `pop`) plays 1.6x to 1x over the HUD number on plain, unscaled hits; the HUD number is unchanged.
- Ghost foe: the pale see-through look came from the additive flash wash (peak 0.5, tail 0.3 over 8 frames) lifting a dark sprite. Peak 0.38, tail 0.12; the sprite alpha is never touched by a hit.
- Capture tool: hit-feel-capture.spec.ts tries gaps 160/120/90/70/55 and cmds 32 then 16 until the foe loses life; HERO=pax FOE=lavax now lands a hit.
- Frames: ~/claudetmp/hit-weight/after (fiara vs treenoc), ~/claudetmp/hit-weight/after-pax. Note: in manual stepping the core and streaks hold (paused), so t16 shows them still.
- Open: a QA pass on real-time play; the HUD number itself is still 38 px (Hud.ts owner could bump it).

### e2e subset (E2E_PORT=7930)
Result recorded in the final report; see progress log ~/claudetmp/progress/qa-r38.log.

<!-- merged from qa-r39-hit-feel.md (added 2026-11-14) -->
## QA r39 hit feel (heavier plain hits, WP merged as 0f810ec2)

Frames: ~/claudetmp/qa39/hit/fiara-hit-t00..t16.png (fiara vs treenoc, lava), pax-hit-t02.png (pax vs lavax, sand), curomo-hit-*.png, stage shots ~/claudetmp/qa39/s/stage-*-hit.png, tour ~/claudetmp/qa39/s/tour-fight-hit.png.

Better than r38:
- Contact core plus orange streak fan is now unmistakable at t00-t08; it lingers (still on screen at t08), which sells hit-stop.
- Foe turns a pale ghost wash while keeping its silhouette, so you can still see who got hit. Fiara-vs-Treenoc t00 reads well.
- Big damage number with a heavy outline; STUN chip appears in the top row at once.
- pax vs lavax capture now lands (r38: never landed in 40 steps).

Still weak, ordered by value:
1. Numbers too small relative to life: "7" on a 571 bar moves it a pixel. Street Fighter's light hit still chips visibly. Idea: show a brief white "lost life" ghost segment on the foe bar so the hit reads on the HUD.
2. Duplicate number: at t00 a second small "7" floats about 150 px to the right of the big one (Fiara hit, and the "9" on the Tour hit). Looks like a stale or double pop. Check hit-juice spawns one number only.
3. Multi-hit stacking (Pax vs Lavax t02): "3", "38", "8" overlap into an unreadable blob over the foe; stagger the pops or merge them into one growing total (combo counter).
4. The white core is a flat disc with no texture; at lava stage with a bright core it hides the foe's face for ~8 ticks. Smaller core, brighter ring, more shards.
5. Attacker does not move: no lunge or recoil, only the foe moves (same as r38 note). Even a 4 px forward nudge plus 1-frame stretch on the attacker would add weight.
6. No screen shake on a plain hit (reserved for supers is fine, but a 1-2 px 3-frame nudge is what MvC light hits have).

### Progress (2026-11-14, hit-impact agent)

Done (presentation only, no src/core): (2) duplicate number removed, a popped plain hit shows only the lingering pop (640 ms, rising), the HUD number stays for scaled hits, supers and reduced motion; (3) pops landing within 420 ms / 110 px merge into one growing total; (4) core is smaller (20-44 px) and element-tinted (halo, pale ring, pale heart) instead of a flat white disc; (5) attacker lunge 4-9 px forward over 8 ticks (`lungeOffset`, `CharacterView.lunge`); (6) light-hit camera nudge 55 ms at 0.0016 (about 2 px with the boost). Lunge and shake are off under reduced motion. Frames: ~/claudetmp/hit-impact/fiara-hit-t*.png. Still open: (1) foe life-bar ghost segment (HUD files, other agent).

### Progress (2026-11-14, ghost-bar agent)

(1) done: the active hero bars (both sides, 1v1 and 2v2) already had a yellow lost-life trail; it is now time-based (`stepTrail` with the frame delta): holds 500 ms, drains at 0.07% of max life per ms (about 1.4 s for a full bar), at least 3 px wide with a pale highlight line so a light chip still reads. Reduced motion: holds, then vanishes (no glide). Unit test in slim-hud.test.ts; shots via tests/e2e/ghost-bar-shot.spec.ts (SHOT_DIR), frames in ~/claudetmp/ghost/. Bench chips have no ghost.

<!-- merged from qa-r40-hit-feel-and-stages.md (added 2026-11-14) -->
## QA r40 hit feel and stages

Screenshots: ~/claudetmp/qa-r40/s/hit-{2,4,6,8,13}.png (Pax vs Rokcore on lava), stage-*-hit.png, super-*.png.

- Hit pop: Pax special lands a very large "38" with a white starburst and an arena-edge dashed AoE box; Rokcore shows a yellow chip on its life bar and a STUN tag. Reads as an event. The burst is still a flat white fan; a short ember or rock shard layer tied to the defender element would add texture.
- Stills cannot show lunge or hit-stop. A capture test (hit-feel-capture) exists; add an assertion for the attacker's displacement over frames so a regression is caught.
- Terrain chips: contrast fixed on the pale gale stage (AIR x2 dark pills with a light border). On rain (WATER +HP) the pills read well; the underlying tile patches are faint, so the glyph inside each patch matters more than the patch.
- Earth (sand) stage: Rokcore spawn zone is clear of tall props; the crystal prop sits at mid-right, not in a spawn. Sand stage banner pills "SAND +20%" and "SAND 9" read.
- In the 2v2 start frame the "FIRE x2" chip at x=595 overlaps the Fiara foe silhouette edge (chip over a character): chips should draw below characters.
- Super frame: "FIGHT!" intro text is drawn under the super effect at tick ~91; harmless but looks like overlapping text.

### Progress

- 2026-11-14 (chip-layer): chips and words stay above the floor patches (-0.7) and below every fighter layer (lowest -0.6); depths are now the exported `CHIP_DEPTH`/`LABEL_DEPTH` and part of the terrain probe, pinned by a unit test on all four stages. The QA overlap was the fade lag: a chip that appeared (round start, after a banner) with a fighter on it showed at full alpha and eased down; it now starts faint and fades 2x faster. Contrast fix from r38 untouched. Screenshots: ~/claudetmp/chip-shots/{fire,earth,air}-2v2.png (water stage could not be forced in the headless script).
- Not done: attacker-displacement assertion in hit-feel-capture (owned by the hit-feel agent), FIGHT! vs super overlap, ember/shard hit layer.

## Triage plan (2026-11-21)

- Done per Progress notes: streaks, hit-stop, recoil, lunge, shake, pop merge, ghost bar, chip depth. Open: (a) attacker-displacement assertion in tests/e2e/hit-feel-capture.spec.ts (no lunge check there yet), (b) FIGHT! text under the super effect, (c) ember/shard hit layer (art/feel).
- (a) is small, a builder task (e2e via the router); (b) and (c) need a real-time look and art-director sign-off.
- Keep in brainstorm until a human confirms real-time feel; split (a) into its own idea if wanted.
