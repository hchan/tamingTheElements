---
status: idea
added: 2026-11-14
---

# Arcade 2v2: do the Echo / Pax outliers survive random partners? (r37)

Follow-up to [balance-outliers.md](balance-outliers.md). Analysis only: no sim, data or baseline change. SIM_VERSION as of main at 8667a05b.
Both runs: 16 seeds, 66 pairings, 1056 matches each, Arcade 2v2, scripted AI level 3, difficulty 1, all KO (no stalemates, no timeouts, 0 draws),
median 103 s. Tools: `tools/sim/snag-trap-teams.mts teams 2 16` and `... partners 2 16`. Raw JSON was in `~/claudetmp/b2v2/`.

## Results

`teams` = the fixed-roster tournament (each race is one of the two leads; 176 games per race, SE about 3.8 pp).
`partners` = leads are the pairing, partners drawn per match from a seeded stream; "any" = team win rate over every roster the race is on
(about 350 games, SE about 2.7 pp); "lead" = as lead only (176 games).

| race | teams (n=176) | partners any (n) | partners lead (n=176) |
|---|---|---|---|
| curomo | 50.6 | 62.0 (366) | 58.5 |
| cyclonius | 57.4 | 43.9 (351) | 51.1 |
| echo | 57.4 | 53.6 (351) | 61.9 |
| fiara | 44.9 | 51.4 (362) | 47.7 |
| ishimi | 44.9 | 39.6 (336) | 33.0 |
| lavax | 55.1 | 47.6 (370) | 43.2 |
| morblass | 50.0 | 48.4 (368) | 50.0 |
| pax | 44.9 | 64.2 (352) | 64.8 |
| rokcore | 51.7 | 51.2 (344) | 47.7 |
| sindarosa | 47.7 | 38.8 (338) | 34.1 |
| treenoc | 52.8 | 54.0 (350) | 56.8 |
| wispera | 42.6 | 44.0 (336) | 51.1 |

## Findings

- Echo persists, mildly. 57.4 (teams, 16 seeds; was 58.0 at 8 seeds) and 61.9 as lead with random partners (about +3 SE), but only 53.6
  over all rosters (about +1.3 SE). Echo wins more when it is the lead than when it is the partner, so it is strong as the main fighter
  and about average when it carries nothing. Echo is strongly partner-dependent in the pair table: echo+curomo 80.6% (36), but
  echo+cyclonius 28.6% (35), echo+wispera 40.6% (32), echo+rokcore 41.7% (24).
- Pax does NOT persist; it flips. 44.9 in the fixed tournament (was 43.2) but 64.2 (any) / 64.8 (lead) with random partners, the best race
  in the table (+5 SE). So the fixed-roster 43.2 is a partner/matchup artefact (which partner the fixed tournament gives Pax), not a weak
  Pax. Good Pax pairs: pax+curomo 78.6% (28), pax+rokcore 75.8% (33), pax+cyclonius 71.4% (35), pax+lavax 70.0% (30).
  Buffing Pax (the r36 idea of +5 percent life) would make a 64% race stronger. Do not.
- The real low outliers under random partners are Sindarosa (38.8) and Ishimi (39.6), both about -4 SE, and Curomo is high (62.0, +4 SE).
  Cyclonius also swings 57.4 -> 43.9 between harnesses, so single-harness numbers for any race carry about +-10 pp of roster effect.
- The two harnesses disagree by more than the sampling error for Pax, Cyclonius, Curomo, Lavax: roster composition, not race strength,
  dominates the 2v2 tournament. Fixed-roster tournament win rates should not drive tuning on their own.

## Tuning proposal (for a later sim-change WP; not done here)

Use the random-partner `any` rate as the target metric (about 350 games per race at 16 seeds; 32 seeds halves the SE to about 2 pp).
Goal: bring every race inside 45 to 55.

1. Pax: leave `ARCADE_2V2_LIFE_PM` Pax (612) alone, or nudge DOWN about 3 percent (about 595) only after a 32-seed rerun if it still sits
   above 58. Do not raise it. Expected: Pax any 64 -> about 59 to 61.
2. Curomo (62.0): 2v2 life multiplier down about 4 percent. Expected: about -3 to -4 pp.
3. Sindarosa (38.8) and Ishimi (39.6): 2v2 life multiplier UP about 6 percent each (the earlier probe showed Sindarosa moves about 9 pp
   from a 7 percent change in other races' life, so the response is large; start at +5). Expected: about +4 to +6 pp each.
4. Echo: only trim if still above 56 as lead after the above; 640 -> about 615 (-4 percent). Echo any is already within noise (53.6).
5. Validate with `partners 2 32` plus `pnpm balance:compare --ruleset arcade --team-size 2`; change at most 2 races per step, because
   untouched races previously swung 11 to 16 pp from one life change (see balance-outliers.md). Re-recording the baseline needs a stated reason.

Caveat: one AI level (3), one difficulty; scripted AI may mis-use some partner kits (for example Echo with Cyclonius), so some pair
effects can be AI behaviour rather than kit strength.

## Progress

- 2026-11-14, SIM_VERSION 60: step 1 done for Curomo and Sindarosa only (Arcade 2v2 life 800 to 768, 773 to 812). 32-seed random-partner run
  (`partners 2 32`, 704 matches), team win rate over all rosters, before to after: curomo 59.2 to 57.2, sindarosa 42.6 to 46.4; other races moved
  at most 3.7 pp (fiara 54.3 to 50.6, cyclonius 43.4 to 45.2, ishimi 37.8 to 39.2, pax 59.8 to 59.4, echo 54.2 to 52.6). Still open: Ishimi (39.2),
  Cyclonius (45.2), Wispera (41.9), Pax (59.4), Curomo (57.2); steps 2 to 4 not done. Arcade 2v2 baseline and Arcade goldens re-recorded.
- 2026-11-14, SIM_VERSION 61: step 2 done for Pax and Ishimi only (Arcade 2v2 life 612 to 594, 633 to 671). 32-seed random-partner run (`partners 2 32`,
  2112 matches), team win rate over all rosters, before to after: pax 59.4 to 54.7, ishimi 39.2 to 41.6; others: curomo 57.2 to 56.9, cyclonius 45.2 to 44.3,
  echo 52.6 to 52.8, fiara 50.6 to 49.7, lavax 50.6 to 52.0, morblass 50.1 to 51.3, rokcore 51.5 to 51.4, sindarosa 46.4 to 44.8, treenoc 54.9 to 57.6,
  wispera 41.9 to 42.6. Still open: Wispera (42.6), Ishimi (41.6), Cyclonius (44.3), Sindarosa (44.8), Treenoc (57.6), Curomo (56.9). Arcade 2v2 baseline and Arcade goldens re-recorded.
- 2026-11-14, SIM_VERSION 62: step 3 done for Treenoc and Wispera only (Arcade 2v2 life 715 to 680, 600 to 640). 32-seed random-partner run (`partners 2 32`, 2112 matches), team win rate over all rosters, before to after: treenoc 57.6 to 51.8, wispera 42.6 to 48.8; others: curomo 56.9 to 57.8, cyclonius 44.3 to 43.6, echo 52.8 to 55.2, fiara 49.7 to 49.4, ishimi 41.6 to 40.6, lavax 52.0 to 50.1, morblass 51.3 to 49.6, pax 54.7 to 55.3, rokcore 51.4 to 51.4, sindarosa 44.8 to 46.2. Still open: Ishimi (40.6), Cyclonius (43.6), Curomo (57.8), Echo (55.2, just over). Arcade 2v2 baseline and Arcade goldens re-recorded.
- 2026-11-14, SIM_VERSION 63: step 4 done for Curomo and Ishimi only (Arcade 2v2 life 768 to 736, 671 to 720; life alone sufficed, no other lever). 32-seed random-partner run (`partners 2 32`, 2112 matches), team win rate over all rosters, before to after: curomo 57.8 to 53.2, ishimi 40.6 to 48.6; others: cyclonius 43.6 to 40.9, echo 55.2 to 54.5, fiara 49.4 to 49.0, lavax 50.1 to 48.9, morblass 49.6 to 51.7, pax 55.3 to 55.7, rokcore 51.4 to 51.1, sindarosa 46.2 to 45.4, treenoc 51.8 to 52.0, wispera 48.8 to 48.8. Still open: Cyclonius (40.9, next step: +life), Pax (55.7, just over). Arcade 2v2 baseline and Arcade goldens re-recorded.
- 2026-11-14, SIM_VERSION 64: step 5 done for Cyclonius and Pax only (Arcade 2v2 life 788 to 843, 594 to 575; life alone sufficed). 32-seed random-partner run (`partners 2 32`, 2112 matches), team win rate over all rosters, before to after: cyclonius 40.9 to 50.7, pax 55.7 to 53.3; others: curomo 53.2 to 53.1, echo 54.5 to 52.8, fiara 49.0 to 49.0, ishimi 48.6 to 47.1, lavax 48.9 to 50.0, morblass 51.7 to 50.1, rokcore 51.1 to 48.3, sindarosa 45.4 to 44.1, treenoc 52.0 to 51.7, wispera 48.8 to 49.4. Still open: Sindarosa (44.1, just under; next step: +life about 4 percent). Arcade 2v2 baseline and Arcade goldens re-recorded.
- 2026-11-14, SIM_VERSION 65: step 6 done for Sindarosa only (Arcade 2v2 life 812 to 845, +4 percent). 32-seed random-partner run (`partners 2 32`, 2112 matches), team win rate over all rosters, before to after: sindarosa 44.1 to 47.5; others: curomo 53.1 to 51.6, cyclonius 50.7 to 50.4, echo 52.8 to 52.5, fiara 49.0 to 49.2, ishimi 47.1 to 47.7, lavax 50.0 to 50.1, morblass 50.1 to 48.5, pax 53.3 to 54.3, rokcore 48.3 to 48.3, treenoc 51.7 to 50.6, wispera 49.4 to 49.1. All twelve races are inside 45-55. Arcade 2v2 baseline and Arcade goldens re-recorded.
- 2026-11-17, SIM_VERSION 86: Arcade 2v2 life retune (ishimi 720 to 670, morblass 920 to 865, fiara 760 to 730, cyclonius 770 to 810; wispera 632 to 650 and treenoc 714 to 695 with matching 1v1 life changes). 32-seed random-partner run (2112 matches), team win rate, before to after: ishimi 58.4 to 52.4, morblass 56.8 to 54.3, fiara 56.3 to 52.3, cyclonius 45.3 to 50.3, echo 43.8 to 48.2, pax 54.4 to 55.4, treenoc 43.7 to 44.7, wispera 46.3 to 45.6. Open: Pax, Treenoc. Both Arcade baselines and Arcade goldens re-recorded.
