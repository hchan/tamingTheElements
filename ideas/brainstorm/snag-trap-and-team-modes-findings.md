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
- Not measured here: which swaps are voluntary vs forced, bench recovery effects. Random partners: section 3.

## 3. Random partners (re-measure, same day)

Harness mode `partners` (`tsx tools/sim/snag-trap-teams.mts partners 2|3 24 out.json`, tables by `tsx tools/sim/summarize-partners.mts out.json`).
Same 66 pairings x 24 seeds = 1584 matches, Arcade, Normal AI, sides alternate. The two leads are the pairing; every partner is drawn from a
seeded sfc32 stream (`seedSfc32(matchSeed ^ pairing, 'partners')`) among races on neither roster, so all 2N races on a match are distinct and
the run is reproducible (a 1-seed rerun is byte-identical). `tools/sim/run-match.ts` gained an optional `rosterA` (tools only; `rosterB` existed).
"On roster" = team win rate over every roster the race is on, as lead or partner (about 500 to 820 rosters a race); lead = only as the pairing's lead (264 each).

| | 2v2 | 3v3 |
|---|---|---|
| KO / stalemate / timeout | 1573 / 11 / 0 | 1575 / 9 / 0 |
| Tags a match | 12.9 | 24.9 |
| Round clock expiries a match | 0.17 | 1.48 |
| Length p50 / p90 | 190 s / 277 s | 259 s / 389 s |
| On-roster spread | **20.6% (lavax) to 77.0% (wispera)** = 56 pp | **22.0% (lavax) to 71.3% (wispera)** = 49 pp |

On-roster win %, 2v2: wispera 77.0, curomo 57.1, morblass 55.9, sindarosa 55.6, treenoc 55.5, pax 51.4, fiara 50.6, ishimi 50.6, echo 46.0,
rokcore 42.5, cyclonius 33.4, lavax 20.6.

On-roster win %, 3v3: wispera 71.3, curomo 57.2, morblass 56.8, ishimi 55.3, fiara 53.3, pax 53.0, sindarosa 52.0, treenoc 51.7, echo 47.9,
rokcore 41.3, cyclonius 35.2, lavax 22.0.

- The 10.6 to 85.2% fixed-partner spread was mostly roster luck, as suspected: pax (81% fixed 3v3) is 53% and sindarosa (11%) is 52% once partners
  vary. Fixed-partner 2v2 and 3v3 rankings barely agreed; random ones agree closely (same top 1, same bottom 3: wispera, then rokcore,
  cyclonius, lavax last), so the per-race effect is real and stable across team sizes.
- A real spread remains: about 50 pp, wider than 1v1 (41 to 56%). Two outliers carry it: **wispera** (71 to 77%) and **lavax** (21 to 22%); the
  middle nine races sit in 46 to 57%. Wispera as a partner is a strong carry: best pairs are X+wispera at 80 to 95% (fiara+wispera 94.6% in 2v2,
  morblass+wispera 83.7% in 3v3). Lavax drags any roster to 6 to 20% (ishimi+lavax 6.3% in 2v2, cyclonius+lavax 7.8% in 3v3).
- Lead-only rates agree with on-roster rates within about 8 pp (wispera 78, lavax 19 to 22), so the effect is the race's kit, not a leader
  bonus. Rokcore's lead rate (34 to 36) is below its on-roster rate (41 to 43): it is a slightly better partner than lead.
- Clock expiries and stalemates: 3v3 still drags (1.5 expiries a match vs 0.17); stalemates 0.6 to 0.7%, no match timeouts.
- Caveats: 24 seeds a pairing, each roster drawn once, so a pair table row has about 40 to 160 matches (one standard error about 4 to 8 pp);
  pair synergy is noisy and only the extremes above are read. The scripted agent is the same Normal AI for every roster.

## Follow-up ideas (each its own file)
- [snag-trap-ai-combo](snag-trap-ai-combo.md): teach the AI to Snag into its own trap (or lay a trap, then rope the foe over it).
- [control-streak-8s-investigation](control-streak-8s-investigation.md): longest no-control streak is 8.4 s; find what stacks past the 3 s cap.
- [team-mode-3v3-spread](team-mode-3v3-spread.md): re-measured with random partners: still about 50 pp, from two outlier races.
- [team-harness-random-partners](team-harness-random-partners.md): done (mode `partners`); the pair-synergy table needs more seeds.
- [tag-swap-forced-vs-voluntary](tag-swap-forced-vs-voluntary.md): split tag-ins in fun-metrics and judge whether tag is overused.
- [wispera-team-dominance](wispera-team-dominance.md): wispera is on the winning roster 71 to 77% of the time in teams.
- [lavax-team-weakness](lavax-team-weakness.md): lavax is 21 to 22% in teams and sinks any roster it joins.
- [team-pair-synergy-more-seeds](team-pair-synergy-more-seeds.md): rerun `partners` at 200+ seeds to make the pair table readable.
