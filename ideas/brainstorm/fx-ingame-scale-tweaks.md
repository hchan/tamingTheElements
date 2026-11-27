---
status: idea
added: 2026-11-26
---

# In-game scale/alpha tweaks for today's integrated fx (render-side only, no new art)

Source: art-director in-game check (2026-11-26) of real-game captures at 1280x720 (builder captures in `.claude/worktrees/agent-abd0b294206511f02/.scratch/fx-ingame/`, may be pruned; recapture with that script if needed). All integrated art reads fine or better than before; the director suggests ONLY scale/alpha/blend/rotation changes, no new art round:
- kindrel emberBite WEAK: roughly 50 px dark ember box, no flame colour: scale ~1.6x, alpha 1.0, additive blend, anchor at the jaw one body length ahead.
- kindrel cinderSpray WEAK: faint, lost against the lava cracks: scale ~1.5x, alpha 1.0, additive blend, spread in the facing direction.
- glimmaw abyssFlash WEAK: ~30 px flash in a box: scale ~1.8x, additive blend, keep teal.
- brazgor forgeGore WEAK: reads as a symmetric radial starburst on the target, not an arc / strike direction: rotate the sprite to the attack heading and offset ~20 px forward of the hero; if the approved arc is symmetric scale it down ~15% so it does not swallow the damage number.
- abyssor abyssalPull: no fx drawn, only the PULL label (being investigated by a builder: sprite wiring or capture timing); if it is a pull, a tether or vortex ring at 1.5x, alpha 0.8, else hold the fx for the full duration.
- hyalia stingingFilament: not seen (Phaser particle fan from `sting-fx.ts`, maybe a manual-stepping artefact): draw the fan at its spawn tick and keep it >= 0.3 s with alpha 1.0.
Note the melee fx sprite is stretched over the sim hit box (70x80 for forge-gore): scale changes belong in the view (`src/game/views/projectile-view.ts` meleeLook / ability-aura-view.ts), never the hit box. Do after the abyssalPull/stingingFilament recheck builder merges (same view files). Each tweak: a unit test on the parameter table, then a real-game capture to the art-director.

## Recheck result (builder, 2026-11-26)
- abyssor abyssalPull IS drawn: the projectile view swaps the static art for the 8-frame `abyssalPullLoop` strip (160x160 frames shown at 44x44, `projectile-view.ts` ~155-170), so the 80x80 swirl is never shown for this projectile (by design, like every sprite with a loop strip). It was invisible only because the dark-teal 44 px worm starts inside Abyssor's teal body under the procedural teal tendril and PULL pop from `paintPull`: low contrast, not a wiring bug. Fix is a view tweak (larger/lighter sprite, or drop the procedural overlap near the caster).
- hyalia stingingFilament: NOT seen in live time either (20/60/150 ms): the cast happens (Filament cooldown shows) but no violet fan and no 110x10 projectile sprite is visible; root cause unproven (probe `readyTick`, the emitter and the projectile sprite). Possible real playability defect: the ability may be invisible. Next: a small diagnosis builder.
