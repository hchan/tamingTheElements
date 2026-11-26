# Status chips (ADREN, SAFE) over the crowd band are low contrast and crowd the bench portrait

status: done
added: 2026-11-19

Severity: minor
Size: S

Repro: 2v2 on the Fire stage, tag in Pax (Adrenaline), look at the left status chips under the life bar. Dark-green chips with small text sit on busy crowd silhouettes and torch glow; ADREN and SAFE are hard to read and the pair runs up to the bench portrait. The HUD scrim and edge grain look correct (no ordering regression found); this is the chip fill only.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a84dea11ac10d7faf/.scratch/qa-r126/shots/42-tag-swap-a.png

Suggested fix: raise chip fill alpha to about 0.85 with a lighter 1 px border, or darken the crowd scrim under the chip row.

triaged: 2026-11-21 real, small, but chip code is in Hud.ts (off limits this pass). Plan: next pass, failing-first test on chip fill alpha.

done: 2026-11-26. Already fixed on main by d5977de70 (CHIP_FILL_ALPHA 0.9, test "chip fill (qa-r126)" in src/game/hud/status-icons.test.ts). No further code change; border not added (fill alpha alone is the suggested fix).
