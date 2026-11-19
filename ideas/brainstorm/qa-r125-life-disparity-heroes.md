# Hero life varies widely (Sindarosa 286, Curomo 542, Rokcore 321, Echo 675)

status: idea
added: 2026-11-19

Severity: minor (balance)
Size: M

Repro: start 1v1 with `?manual=1&seed=7&hero=X&foe=Y` for each pair and compare the HUD Life values.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a77c3dce6b1857aa7/.scratch/qa-r125/10-1v1-fire-1280-a.png and /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a77c3dce6b1857aa7/.scratch/qa-r125/10-1v1-earth-1280-a.png

Suggested fix: run `balance:compare` and decide whether the spread is intended. If it is, show a role hint (glass cannon, tank) on the picker.
