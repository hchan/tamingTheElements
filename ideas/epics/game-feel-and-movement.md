---
status: epic
added: 2026-11-16
---

# Epic: Game feel and movement smoothness

How fighting feels: movement, corners, spacing, hit weight, pacing and fairness of positioning.

- Suggested order: smoother-fighter-movement and hit feel first (highest player impact), then corner/pushback and spacing, then pacing.
- Size: L overall; sim changes move goldens (state the reason in the commit).
- Dependencies: src/core changes follow the determinism rules and re-record goldens; run balance:compare after.
- Owner-gated: No owner gate beyond a stated golden/baseline re-record reason (design is pre-approved).

Member ideas, in suggested priority order (work them as separate small work packages):

- [smoother-fighter-movement](../brainstorm/smoother-fighter-movement.md): Movement can be made smoother (render-side). Goal: smoother fighter movement on screen without touching the sim:
- [qa-hit-feel-r34-r40](../brainstorm/qa-hit-feel-r34-r40.md): Plain-hit feel: QA rounds r34 to r40. One file for the repeated "plain hits feel light" finding and its capture tooling.
- [fading-hit-strength](../brainstorm/fading-hit-strength.md): fading-hit-strength. Let a faded Fire Blast hit with lighter strength (less knockback and stun) at long range;
- [walk-cancels-lunge](../brainstorm/walk-cancels-lunge.md): Walking cancels a melee lunge. A held walk key cancels the lunge shove visually and in the AI command.
- [stepapart-tie-axis](../brainstorm/stepapart-tie-axis.md): Step-apart tie axis. When the centres tie on x (for example both at x=0), stepApart picks the away bit by a fixed rule (Cmd.right at x=0).
- [corner-pushback-y-walls](../brainstorm/corner-pushback-y-walls.md): Corner pushback on the top and bottom walls. WALL-2 corner pushback only handles the left and right walls (the pin the QA saw).
- [hard-corner-release](../brainstorm/hard-corner-release.md): Hard AI corner release. WALL-3b only holds a gap on the x axis near side walls.
- [mvc-pushblock-corner-escape](../brainstorm/mvc-pushblock-corner-escape.md): MvC pushblock / corner escape. A cornered, guarding player has no escape beyond a dash.
- [melee-wall-hold-drawn-overlap](../brainstorm/melee-wall-hold-drawn-overlap.md): Melee wall hold and drawn overlap. The melee hold distance (32 px) is measured on sim boxes.
- [hard-skew-rocks-big-heroes](../brainstorm/hard-skew-rocks-big-heroes.md): Hard skew still 0.92; rocks wall off big heroes. SIM 82/83 fixed the Hard stalemates (3 -> 0) but not the melee-vs-ranged skew (0.911 -> 0.921, spread 68pp).
- [versus-local-closer-start](../brainstorm/versus-local-closer-start.md): Local Versus: closer start or auto-approach. A headless playthrough showed 800 ms of movement and 6 attacks leaving both heroes at 100%, because they start far apart.
- [ranged-heroes-fight-at-melee-range](../brainstorm/ranged-heroes-fight-at-melee-range.md): Ranged heroes land their hits at point-blank range. Found with pnpm range:probe (tools/sim/range-probe.ts, docs/TESTING.md):
- [ranged-primary-spam](../brainstorm/ranged-primary-spam.md): Ranged primary spam: 7 heroes cast one shot for 85-99% of casts. pnpm ability:usage flags Cyclonius wind-cone, Fiara fireball, Ishimi slime-blast, Lavax crimson-fire, Morblass icicles, Rokcore rock-pellet and Sindar
- [tag-in-opacity-frozen-through-hit-stop](../in-progress/tag-in-opacity-frozen-through-hit-stop.md): The 0.8 tag-in opacity stays frozen through hit-stop. A hero that tags in is drawn at 0.8 opacity for its entrance;
- [manual-mode-pops-never-age](../done/manual-mode-pops-never-age.md): In ?manual=1 the white damage pops never age. With the driver paused (manual stepping) the shock layer's pops only advance when ageFx(true) is on, so a pop from a hit stays on screen at full alpha
- [round-transition-pacing](../brainstorm/round-transition-pacing.md): Round transition pacing. The gap between rounds runs about 20 s in play.

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### GF-1 Smoother movement and hit feel

- Members: [smoother-fighter-movement](../brainstorm/smoother-fighter-movement.md), [qa-hit-feel-r34-r40](../brainstorm/qa-hit-feel-r34-r40.md), [fading-hit-strength](../brainstorm/fading-hit-strength.md), [tag-in-opacity-frozen-through-hit-stop](../in-progress/tag-in-opacity-frozen-through-hit-stop.md), [round-transition-pacing](../brainstorm/round-transition-pacing.md)
- Size: L
- Shared files: src/game/loop/*, src/game/fx/hit-feel.ts, motion.ts, pose-layer.ts, Arena.ts
- Flags: needs browser/e2e; presentation only (no SIM bump); smoother-movement agents may already be working: check first
- Parallel: FX lane: serial with bundles touching fx/*, pose-layer.ts or Arena.ts.

### GF-2 Corner and wall behaviour

- Members: [walk-cancels-lunge](../brainstorm/walk-cancels-lunge.md), [stepapart-tie-axis](../brainstorm/stepapart-tie-axis.md), [corner-pushback-y-walls](../brainstorm/corner-pushback-y-walls.md), [hard-corner-release](../brainstorm/hard-corner-release.md), [mvc-pushblock-corner-escape](../brainstorm/mvc-pushblock-corner-escape.md), [melee-wall-hold-drawn-overlap](../brainstorm/melee-wall-hold-drawn-overlap.md)
- Size: L
- Shared files: src/core/sim/* (movement, collision), src/core/index.ts
- Flags: SIM, PC
- Parallel: Serial with every SIM bundle.

### GF-3 Ranged range keeping and local start

- Members: [hard-skew-rocks-big-heroes](../brainstorm/hard-skew-rocks-big-heroes.md), [ranged-heroes-fight-at-melee-range](../brainstorm/ranged-heroes-fight-at-melee-range.md), [ranged-primary-spam](../brainstorm/ranged-primary-spam.md), [versus-local-closer-start](../brainstorm/versus-local-closer-start.md)
- Size: M
- Shared files: src/core/agents/*, src/core/sim/*, src/core/data/*
- Flags: SIM, PC
- Parallel: Serial with every SIM bundle; after GF-2.
