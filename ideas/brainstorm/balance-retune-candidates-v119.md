---
status: idea
added: 2026-11-26
---

# Balance retune candidates after v119 (24 heroes)

Source: read-only analyst report on the recorded v119 baselines (seed 1 only; seed-41 hold-out not run; balance:compare not run). Any retune needs a SIM_VERSION bump, baseline re-record with a stated reason, and the split-agent flow (code+tests, measure, bump+docs, record at low load, band tests).


Source: recorded fixtures only, nothing re-recorded, nothing run. `balance:compare` was NOT run: load was 31-41 (limit "about 20"),
so it was not cheap. All numbers below are MEASUREMENTS from the recorded baselines (scripted vs scripted, aiLevel 3, Arcade).
Noise (estimate): 1v1 ~368 games/hero, SE ~2.6 pp; 2v2 ~184 games/hero, SE ~3.7 pp. 2v2 misses of under 4 pp are within noise.
Health: 1v1 4416 matches, 4 stalemates, 0 timeouts; 2v2 2208 matches, 1 stalemate, 0 timeouts.

Note: arcade-full-baseline.json is byte-identical in winRates to arcade-baseline.json (both 24 heroes, 4416 matches), so "1v1" and
"full roster" are the same data here; there is no separate legacy-12 Arcade view in the fixtures. baseline.json is Classic-12
(recorded 2026-11-10), not relevant to Arcade.

## Outside 45-55%

1v1 / full roster (18 of 24 outside; only abyssor .543, brazgor .462, curomo .454, echo .465, fiara .514, ishimi .462 inside):
- High: morblass .614, cyclonius .603, treenoc .590, hyalia .586, rokcore .582, sindarosa .573, glimmaw .567, lavax .567, zephra .553, umbrel .552
- Low: pax .372, wispera .386, durrok .399, kindrel .410, ouroth .425, nykra .440, quarrak .440, vortigal .442
- Style: melee mean .449, ranged .551; cross melee-vs-ranged .402 (SE .010). 5 of bottom 6 are melee, 5 of top 6 ranged.
  Gap by element: air -.150, fire -.119, earth -.071, water -.069.

2v2 (7 of 24 outside):
- High: ouroth .598, glimmaw .584, durrok .565
- Low: morblass .418, quarrak .435, vortigal .435, zephra .435
- Style flips: melee .518, ranged .482, cross .534 (SE .015). Fire gap +.080 is the largest.
- Inside but near the edge: sindarosa .451, hyalia .454, echo .467, pax .467.

## Ranked retune candidates (max 5)

1. morblass: 1v1 .614 (highest) but 2v2 .418 (lowest). A 19.6 pp swing between views. Evidence: both baselines. Docs note morblass
   already has 1.124x its 1v1 life in 2v2, so the lever is the 1v1 numbers (trim damage or life) and/or a higher 2v2 life factor.
2. pax: 1v1 .372 (lowest of 24, 5 pp under the band, ~4.8 SE under 50). Melee, so part of the melee-vs-ranged 1v1 gap. 2v2 .467 is fine,
   so raise 1v1 life/damage only (the 2v2 table is separate).
3. vortigal: low in both views (.442 / .435), ranged; the only hero low in 1v1 and 2v2 besides quarrak (.440 / .435).
   Consistent two-view signal beats a single-view one. Retune quarrak together as one 2-hero round, vortigal first.
4. ouroth: 1v1 .425 but 2v2 .598 (second-highest). Same divergence shape as morblass inverted: raise 1v1 power, trim 2v2 life factor.
5. glimmaw: high in both views (.567 / .584), ranged; the only hero above band in both. Small nerf. (cyclonius .603 1v1 is next
   if a sixth is wanted, but its 2v2 is .505, so single-view only.)

Structural note (not a per-hero item): the 1v1 melee/ranged gap (cross .402) is why 5 of the 6 weakest are melee. Per-hero fixes for
pax, wispera, durrok, kindrel are likely cheaper as one melee-wide 1v1 life/damage nudge than four tunings. Decide with the owner/coordinator.

## Caveats
- Single seed set (seed 1). The seed-41 hold-out was not run, so seed-dependent misses of 3 pp or less are not trustworthy.
- Prior R5 note (2026-11-25) had all heroes inside 45-55 on the released roster at v114; the v117/v118 stun nerf and R8 retune moved
  the spread back out (e.g. treenoc .492 -> .590, curomo .454 same). Confirms the stun nerf shifted balance; see commits 12fab59b, af537f0d.
- Any retune needs a SIM_VERSION bump and a baseline re-record with a stated reason (the coordinator and owner decide; not done here).
- No stalemate or timeout rise is visible (4 and 1, 0 timeouts), so no degenerate strategy signal.
