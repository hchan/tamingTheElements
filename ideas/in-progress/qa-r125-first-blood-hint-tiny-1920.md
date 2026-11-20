# First-run FIRST BLOOD hint is tiny at 1920x1080

status: in-progress
added: 2026-11-19

Progress note (2026-11-20): base font-size of `.firstRunHint` is now `clamp(11px, 1.5vh, 24px)` in `src/ui/styles/main/09-help-first-run.css` (about 16px at 1080p; short windows keep 11px). Tests: CSS pin in `tests/repo/touch-css.test.ts`, e2e at 1920x1080 in `tests/e2e/first-run-hint.spec.ts` (passed on the PC, long gate).

Severity: minor
Size: S

Repro: open `/?manual=1&seed=7&hero=curomo&foe=sindarosa` at 1920x1080 and step 95 ticks.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a77c3dce6b1857aa7/.scratch/qa-r125/10-1v1-water-1920-b.png

Suggested fix: scale the hint with the viewport (as the HUD does) instead of a fixed pixel size.
