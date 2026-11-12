---
status: idea
added: 2026-11-12
---
# Longest no-control streak is 8.4 s: find what stacks

Per-fighter streaks of root or hit-stun reach 419 ticks (8.4 s; 2908 of 47 070 streaks are over 3.6 s) although the combo stun cap is 3 s
(`COMBO_STUN_CAP_TICKS` 150). Find the stacking: root plus combo plus post-cap recovery, hit-stop counted in the streak, or a real loop.
Log the event sequence of the longest streaks (the harness keeps only the maximum). Possible fix: one control-window cap across all sources, or
control immunity after any capped control.

Source: [snag-trap-and-team-modes-findings.md](snag-trap-and-team-modes-findings.md).
