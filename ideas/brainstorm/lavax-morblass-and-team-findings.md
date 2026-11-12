---
status: idea
added: 2026-11-12
---
# Lavax vs Morblass and the Lavax / Wispera team gap: mechanics and a ready fix

Analysis only (no src change). Follow-up to [lavax-team-weakness](lavax-team-weakness.md), [wispera-team-dominance](wispera-team-dominance.md) and
[arcade-low-races-analysis](arcade-low-races-analysis.md). Tools (all in `tools/sim/team-weakness/`):
`trace.mts` (projectile economy per pairing), `timeline.mts` (tick log of one match), `mods.mts` (a `--import` preload that mutates the runtime
tables for what-ifs: `TTE_MODS="life:lavax=900,cd:icicles=20,def:icicles.maxActive=2,hp:..,dmg:.." tsx --import ./tools/sim/team-weakness/mods.mts <harness>`).
SIM_VERSION 38, Normal AI, 24 seeds.

## 1. Why Lavax loses 0% to Morblass (1v1)

Trace of 12 seeds (Lavax 0%, about 61 s per match):

- Water beats fire in `clash.ts`. An icicle that meets a crimson-fire shot destroys it and survives (hp = max(hp - loser/2, hp/4)), so it still
  hits. About 23 of Lavax's roughly 24 shots per match are eaten in clashes lost; none of Morblass's are.
- Cadence: icicles fire every 15 ticks with 3 active (about 75-83 shots/match); crimson-fire every 18 ticks with 2 active. Morblass hits about 48
  times per match (873 damage), Lavax about 10 (205).
- Both are light hits (32 ticks hit-stun), so the 48 icicle hits are a stun-lock: Lavax is stunned 28 s of the 49 s fight (57%) against 12.7 s
  (26%) for Morblass. Morblass hits from about 66 px, Lavax from about 156 px. Morblass dashes about 8 times a match, Lavax about 2.
- Lavax lands the first hit in only about 29% of matches (7 of 24).
- The earlier void-elements / flat-stats runs still gave 0%, so the element chart is only half of it: cadence plus stun-lock decide it.

## 2. 1v1 what-ifs (Lavax win rate stays 0.0% in nearly all; the pairing is a step function with a deterministic AI)

| change | dealt by Lavax / Morblass | first hit | win |
|---|---|---|---|
| baseline | 205 / 873 | 7/24 | 0% |
| crimson maxActive 3 or 4 | 204-206 | 17/48 | 0% |
| crimson cd 10, or speed 14 | 146-182 (worse) | | 0% |
| crimson dmg 15 (medium stun) + lavax dmg 754 | 177 | 14/48 | 0% |
| icicles cd 18 / 20 | 213 / 218 | 22/48 | 0% |
| icicles maxActive 2 | 229 | 22/48 | 0% |
| icicles maxActive 2 + cd 18 | 286 / 905 | 30/49 | 0% |
| icicles maxActive 2 + cd 20 + lavax hp 5500 | 337 / 1227 | 23/49 | 0% |
| same + lavax dmg 1070 | 406 / 1275 | 26/51 | 4.2% |
| lavax hp 6500 + dmg 1070 | 417 / 1439 | 17/50 | 4.2% |

No minimal kit tweak flips the 1v1 pairing; it needs hp and damage together with a Morblass nerf, which would ripple through every Morblass
matchup. Recommendation: do NOT chase this pairing with kit changes. Accept it as a hard counter (water beats fire is the design) unless a later
WP gives Lavax a clash-immune shot (for example the super or a heavy attack).

## 3. Team gap: the lever is `ARCADE_2V2_LIFE_PM`, not the kit

`ARCADE_2V2_LIFE_PM` scales a race's hp in 2v2/3v3: lavax 537 (hp 4000 -> 2148), morblass 960, wispera 1050 (hp 7300 -> 7665). Lavax has about 28%
of Wispera's hit points in a team match, while its kit is a 1v1 loser too.

Measured with the partners harness (24 seeds, 1584 2v2 matches, on-roster win %):

| life table | lavax | morblass | wispera | spread |
|---|---|---|---|---|
| current (lavax 537, wispera 1050) | 20.6 | 55.9 | 77.0 | 56.4 pp |
| lavax 900 | 53.9 | 56.1 | 74.3 | 44.3 pp |
| wispera 700 | 21.9 | 59.7 | 59.7 | 39.1 pp |
| lavax 900 + wispera 700 | 55.9 | 60.0 | 55.7 | 27.0 pp |

(Each other race's rate moves a little too; only the three tracked races are shown. Spread is over all 12 races.)

3v3 with lavax 900 + wispera 700 (1584 matches): lavax 47.8, morblass 60.1, wispera 52.8, spread 34.4..60.1 = 25.7 pp (baseline was lavax
about 22, wispera 71-77). The same two numbers fix both team sizes.

## Recommended WP (ready to implement)

Change `src/core/sim/arcade-numbers.ts` `ARCADE_2V2_LIFE_PM`: `lavax: 537 -> 900`, `wispera: 1050 -> 700`. Two numbers, no kit change, no 1v1
effect (1v1 uses hpPm unchanged). Needs:

- a SIM_VERSION bump (and the version.ts note), because team hp changes sim output;
- Arcade goldens and balance baselines re-recorded with the stated reason "team life table: lavax 537->900, wispera 1050->700"
  (`pnpm golden:record`, `pnpm balance:record`; Classic goldens must not move);
- update `arcade-numbers.test.ts` if it pins the values; `pnpm balance:compare` before and after;
- a re-run of `tools/sim/snag-trap-teams.mts partners 2|3 24` plus `summarize-partners.mts`; expect lavax and wispera near 55% and the
  all-race spread about 27 pp (2v2). Remaining outliers can be tuned the same way, one life number per race.

Open: the numbers are tuned against the Normal AI only; re-check with a harder AI level before shipping.
