---
status: idea
added: 2026-11-14
---

# Plain hits still feel light (third round running)

Hit flash and numbers are fine, but a basic strike lacks weight next to Street Fighter: little hitstop and screen punch on normal hits. Idea: a 2-3 tick freeze plus a tiny camera nudge scaled by damage on non-super hits.

## Progress

2026-11-14: Presentation-only pass done. Every plain hit now throws a directional streak fan (3/5/7/9 by strength, `hit-streak-view.ts`), squashes and shoves the victim about its feet (`recoilPose`, view-tick keyed), nudges the camera even on light hits, and the arcade thump cue is louder with a noise crack layer. All skipped under reduced motion. Unit tests added; a headless shot confirmed the victim squash, but the streak fan was not clearly visible in the arenaDemo projectile shot, so it stays in brainstorm pending a closer look at melee hits. Sim hit-stop length is unchanged (sim-side, out of scope).

2026-11-14 (verify): Root cause of the invisible fan: under manual stepping (`paused()`), the streak layer never drew, and a fresh streak is zero-length at age 0. Now it draws while paused (new fans start 50 ms in, held). Also thicker, longer (reach +22%, 260 ms, brighter element body under the pale core). Headless shots in manual Versus (`?hero=curomo&foe=rokcore&manual=1`) show a clear luminous fan at the impact; unit test `hit-streak-view.test.ts` pins first-frame visibility. Real-time bursts could not be captured (SwiftShader screenshots take ~500 ms vs a 260 ms streak); real-time uses the same draw path with age advancing. Camera shake was not separately captured (a camera effect, unit-tested, not visible in static shots). Left in brainstorm for a human look at real-time feel.

2026-11-14 (r35 hit-stop): Render-side hit-stop added (view only, sim and goldens untouched). On a landed hit `PoseLayer` holds its animation clock 40/46/52/60 ms by strength (`poseHoldMs`, hit-feel.ts) so the victim's hurt pose and the attacker's pose read as a beat while the sim keeps ticking; manual stepping keeps the hold, reduced motion skips it. Recoil squash/shove raised (squash 0.09-0.24, push 3-10 px) and light/medium/heavy camera shakes boosted x1.5/1.4/1.25 (`shakeBoost`). Unit-tested (hit-feel, event-fx, pose-layer); arcade-juice e2e passes. Real-time feel not captured (SwiftShader frame times exceed the 40-60 ms hold), so it stays in brainstorm for a human look.
