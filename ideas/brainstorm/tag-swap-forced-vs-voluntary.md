---
status: idea
added: 2026-11-12
---
# Tag swaps: split forced from voluntary

Tag-ins: 13.1 a match in 2v2, 23.2 in 3v3; only 9 of 1584 matches have none. `tagIn` also fires on the KO swap. Split them in
`tools/sim/fun-metrics.ts` (entrance flag and a preceding KO) and judge whether the AI overuses tag (cooldown, meter cost) and whether bench
recovery lets teams cycle damage.

Source: [snag-trap-and-team-modes-findings.md](snag-trap-and-team-modes-findings.md).
