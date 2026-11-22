# Tour: ROUND 1 banner frame shows a dark fire floor, no crowd, on an Air stage

status: done
added: 2026-11-19

Severity: minor
Size: M

Repro: ?manual=1&seed=7&ff=arcade#tour, pick Fiara, Rokcore, Curomo, Start tour, Fight on Stage 1 (Air). Right after the arena is ready (about tick 90, ROUND 1 banner) the floor is dark volcanic rock with orange streaks and the crowd band is missing; at step 100 the correct pale Air floor and crowd are drawn. A stale or default floor layer shows for the first moments, then pops. Versus 1v1 does not show it. Possibly the tall-fills or HUD-scrim move changed draw order; worth a bisect against the refactor commits.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a84dea11ac10d7faf/.scratch/qa-r126/shots/52-tour-after.png (bad frame); good frame /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a84dea11ac10d7faf/.scratch/qa-r126/shots/53-tour-fight.png

Suggested fix: make viewsReady include the stage floor and crowd, or hold the ROUND banner until they are drawn.

triaged: 2026-11-21 real, medium: draw order / viewsReady for floor and crowd in Tour; needs a bisect. Plan: medium planner.
Resolution (2026-11-21): does not reproduce on current main. Same repro (?manual=1&seed=7&ff=arcade,holdSplash#tour, Fiara/Rokcore/Curomo, Stage 1 Air), headless Chromium SwiftShader 1280x720: the ROUND 1 banner frame (right after arena ready) and the FIGHT! frame both show the pale Air floor and the crowd band; terrain() reports stage 4 / backdrop "air" from tick 1. Screenshots: .scratch/r126/s1.png (ROUND 1) and .scratch/r126/s89.png (FIGHT) in the agent-aa8bdbaec66f59e35 worktree. Likely fixed by the later floor-band/HUD-scrim work. No code change.
