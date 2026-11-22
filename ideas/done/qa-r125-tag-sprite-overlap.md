# Sprites overlap at contact during a tag swap

status: done
added: 2026-11-19

Severity: cosmetic
Size: M

Repro: 2v2 fight, stand close to the foe, hold 3 across one tick, look at the frames just after the swap.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a77c3dce6b1857aa7/.scratch/qa-r125/21-tag-a-1280.png

Suggested fix: bring the incoming hero in from off-screen, or enforce a minimum sprite spacing during the swap.

Resolved 2026-11-22: does not reproduce on main bb9274e. 2v2 Sindarosa+Pax vs Fiara, tag at a 48 px hitbox gap: Pax appears at the outgoing spot and slides in 48 px from behind (pose-math tagIn), foe stays about 130 px away; no sprite overlap beyond normal contact (the clutter is the entrance flame and damage numbers). Screenshots: .scratch/r125/tag-after-1.png, tag-after-12.png (original shot is gone with its worktree).

Resolved 2026-11-22: does not reproduce on main bb9274e. 2v2 Sindarosa+Pax vs Fiara, tag at a 48 px hitbox gap: Pax appears at the outgoing spot and slides in 48 px from behind (pose-math tagIn), foe stays about 130 px away; no sprite overlap beyond normal contact (the clutter is the entrance flame and damage numbers). Screenshots: .scratch/r125/tag-after-1.png, tag-after-12.png (original shot is gone with its worktree).
