---
status: done
added: 2026-11-14
---
# Round-end panel says "YOU LOSE" after round 1 of a best-of-3

Losing round 1 shows "YOU LOSE" (reads as match over), plus duplicated "PERFECT / YOU LOSE ROUND 1" text behind the panel, and the panel covers both fighters. Fix: "ROUND 1 LOST" with round pips, drop the duplicate text, keep fighters visible, reserve YOU WIN/LOSE for match end.

triaged: 2026-11-21, already fixed: round-result.ts titles ROUND n WON/LOST/DRAW (YOU WIN/LOSE only at match end); round-announcer.ts gives no PERFECT on a lost round.
