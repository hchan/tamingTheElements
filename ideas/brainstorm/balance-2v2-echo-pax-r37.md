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
