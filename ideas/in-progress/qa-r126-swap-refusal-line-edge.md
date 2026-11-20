# "Swap ready in 2.2s" refusal line hugs the left screen edge

status: in-progress
added: 2026-11-19

Severity: cosmetic
Size: S

Repro: ?manual=1&seed=7&ff=arcade#arcade, Team 2v2, Fight, step 91, hold 3 for one stepLive tick (tag in), step about 60 ticks, press 3 again while the tag cooldown runs. A large white "Swap ready in 2.2s" line appears at x of about 6 px, bottom-left of the arena, with no side padding, next to the grey "TAG!" call still fading. Not a regression from the swap-feedback refactor (the line works and the live region says "Tag ready in 3 seconds"), just unpolished.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a84dea11ac10d7faf/.scratch/qa-r126/shots/43-tag-refused.png

Suggested fix: give the refusal line a left inset of at least 24 px (match the bar inset) and a text shadow plate, or move it by the benched hero portrait where the TAG timer already shows, so one spot owns the cooldown message.

Progress (2026-11-20): left inset raised from 4 to 24 design px (NOTICE_INSET_X in src/game/hud/swap-notice.ts), pin test added. The line already has the engraved outline from styleCombatText; no plate added.
