---
status: idea
added: 2026-11-12
---
# Snag-then-trap lockdown and 2v2 / 3v3 Arcade: measurements (SIM_VERSION 36)

Analysis only: no change to src/core, fixtures or the version. Harness: `tools/sim/snag-trap-teams.mts`
(`tsx tools/sim/snag-trap-teams.mts snag 24 out.json`, `... teams 2|3 24 out.json`). 12 races, all 66 pairings, 24 seeds each = 1584 matches
per run, Normal AI (level 3), sides alternate, Arcade. `balance:compare` not run.

## 1. Snag then trap (1v1, 1584 matches, 8.96 M ticks)

Only 4 races carry a Snag (curomo 2102 hits, echo 2736, treenoc 2043, wispera 2381), so 905 of 1584 matches (57%) contain at least one root.

| Measure | Value |
|---|---|
| Snag hits that rooted | 9262 (5.8 a match; 8735 expired, 79 freed by fire, 11 wasted on a guard) |
| Rooted foe then takes a trap hit during the root (+5 ticks) | **13** (0.14% of roots) in 13 matches (0.8% of all, 1.4% of Snag matches) |
| Trap hit within 2 s of the snag but after the root | 14 more |
| Trap damage during a root | 273 of 73 626 trap damage (0.4%) and of 3.59 M total (0.008%) |
| All damage dealt while the foe is rooted (+5 ticks) | 511 283 = **14.2%** of all damage |
| Snagging team wins matches where it snagged | 549 of 1048 team-matches = 52.4% (barely above a coin flip) |
| Snag-then-trap team wins | 5 of 13 |
| Traps overall | 11 438 placed, 3524 overlap triggers, 2707 trap hits (1.7 a match, 2% of damage) |

- Answer: the Snag-then-trap lockdown does not happen with the shipped AI. The AI never places a trap where a Snag will root the foe, and it does
  not Snag toward a trap; the 13 cases are accidents. It decides nothing (13 matches of 1584).
- The root itself (60 ticks, then 75 ticks immune) is by design not chainable; the 14.2% of damage in the window is the normal follow-up of
  Snag's own stun and the owner's shots, not the trap.
- Control streaks (fighter rooted or in hit-stun without a break, counted per tick, hit-stop included): 47 070 streaks of
  at least 1.2 s; median 2.04 s, p99 4.32 s; 14 013 over 2.4 s and 2908 over 3.6 s; **longest 419 ticks = 8.4 s**. Control tick share is 43% of
  fighter time (hit-stun dominates; read it as an upper bound).
- 8.4 s is far over the 3 s combo stun cap (`COMBO_STUN_CAP_TICKS`), so something stacks beyond one combo: root plus a stun chain plus a fresh combo
  after the cap's recovery, or counted hit-stop. No near-unbreakable loop: the longest streak is a single 8.4 s, and 14 of 1584 matches
  ended as 30 s no-HP-change stalemates (0.9%), none involving Snag specifically (not tabulated by race).

## 2. 2v2 and 3v3 (1584 matches each)

Partners are fixed by the harness (the race 6 later in the list for 2v2; 4 and 8 later for 3v3), so a race's rate is the rate of its roster, not of
the race alone.

| | 2v2 | 3v3 |
|---|---|---|
| KO | 1572 (99.2%) | 1570 (99.1%) |
| Stalemate (30 s no HP change) | 12 (0.8%) | 14 (0.9%) |
| Timeout (match cap) | 0 | 0 |
| Draws | 14 | 14 |
| Match length p50 / p90 / max | 189 s / 266 s / 390 s | 249 s / 377 s / 436 s |
| Rounds ending on the clock (`timeOver`) | 132 (0.08 a match) | 1752 (1.1 a match) |
| Tag-ins | 20 684 (13.1 a match) | 36 776 (23.2 a match) |
| Matches with no tag | 9 | 9 |
| Win-rate spread (lead race) | **24.6% (pax) to 69.7% (curomo)** = 45 pp | **10.6% (sindarosa) to 85.2% (fiara, wispera)** = 75 pp |

2v2 order: curomo 69.7, morblass 64.8, sindarosa 61.4, fiara 60.6, treenoc 60.2, lavax 58.0, wispera 56.1, ishimi 50.0, echo 33.0, rokcore 29.2,
cyclonius 27.3, pax 24.6.

3v3 order: fiara 85.2, wispera 85.2, pax 81.4, echo 62.5, treenoc 60.6, morblass 58.3, curomo 47.3, rokcore 40.5, ishimi 36.4, cyclonius 14.0,
lavax 12.5, sindarosa 10.6.

- The spread is wider than 1v1 (41 to 56%, see arcade-low-races-analysis). Rankings flip: pax is 56% in 1v1, 25% in 2v2 and 81% in 3v3; sindarosa
  is 61% in 2v2 and 11% in 3v3. Most of this is roster synergy and element/weather coverage of the fixed partner set, not the lead race.
- Stalemates and timeouts are not a problem (0.8 to 0.9% stalemates, no match timeout). 3v3 has about 13 times the round clock expiries of 2v2
  (1.1 vs 0.08 a match): rounds drag in 3v3.
- Tag swaps are used heavily (13 and 23 a match; tag-ins also include the forced swap on a KO, not separated here) and nearly every match
  uses them (9 of 1584 with none).
- Not measured: which swaps are voluntary vs forced, bench recovery effects, 2v2 with random partners.

## Follow-up ideas (each its own file)
- [snag-trap-ai-combo](snag-trap-ai-combo.md): teach the AI to Snag into its own trap (or lay a trap, then rope the foe over it).
- [control-streak-8s-investigation](control-streak-8s-investigation.md): longest no-control streak is 8.4 s; find what stacks past the 3 s cap.
- [team-mode-3v3-spread](team-mode-3v3-spread.md): 3v3 spans 10.6% to 85.2% by roster; randomise partners and re-fit.
- [team-harness-random-partners](team-harness-random-partners.md): the fixed-partner harness confounds race with roster.
- [tag-swap-forced-vs-voluntary](tag-swap-forced-vs-voluntary.md): split tag-ins in fun-metrics and judge whether tag is overused.
