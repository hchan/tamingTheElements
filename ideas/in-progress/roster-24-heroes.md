---
status: in-progress
added: 2026-11-14
---

# Roster of 24: six heroes per element

Progress: batch 1 (Kindrel, Nykra, Quarrak, Hyalia) is implemented behind `?ff=roster24` (dev and test builds); not yet released.

Owner idea (2026-11-14): today there are 12 heroes (three per element, four elements). Grow to 24: six per element, with the 12 new elementals created in the same theme (medieval-ish dark fantasy: a genre, not low brightness; luminous, painterly).

## Scope (all of it)

- Design 12 new heroes (3 more each of fire, water, earth, air): names, silhouettes and size class (dragons long, wisps tiny), stats, a signature ability set that does not duplicate existing ones, AI behaviour, personality lines for the hero picker and Help.
- Art per hero: SD-assisted portrait (see the SD portrait rig plan), baked sprite sheets, ability FX, super cut-in, locomotion flags (wings, knees, backward gait).
- Sim: new data in `src/core/data/` (characters, abilities, moves), balance fit, goldens and baselines re-recorded with a stated reason, SIM_VERSION bump. One sim-changing agent at a time.
- UI: hero picker and Tour have to hold 24 (paging or a grid), the 2v2 picker, the menu showcase, phone layout.
- Tests: every hero in the all-heroes coverage tests, balance spread 45-55%, a headless screenshot sheet.

## Staging

Ship in batches (for example 4, then 4, then 4) so `main` stays green and balanced; the Opus planner decides the order and the shared-file plan (`src/core/index.ts`, asset manifest, size-budget.json, docs/REPO-MAP.md).

## Open

- Does the void element count as a fifth type (Eternal Void exists)? The owner said 4 types x 6.
- Which of the existing heroes seed the archetype gaps (tank, rushdown, zoner, grappler, summoner, trapper)?

## Melee / ranged split (owner, 2026-11-14)

Split the 24 roughly half melee, half ranged (12 and 12; ideally 3 melee and 3 ranged per element, so every element offers both play styles). Melee heroes win by pressure, short reach and strong close-range moves; ranged heroes by spacing, projectiles and zoning. Each needs a distinct design so they do not just reskin each other, and the balance runs must show neither style dominating. Open: audit how many of the current 12 are melee vs ranged and fill the gaps with the new 12; UI should mark the style with an icon, not colour alone.

## Decisions (2026-11-14, coordinator under the owner's "you decide, be autonomous")

- Ranged-flag fix (WP 0.4) is approved: fiara, morblass and rokcore are ranged but can Charge, wispera is melee but cannot; the flag follows what the hero actually does. It changes the sim, so it runs alone (Opus, one sim-changing agent at a time) with a stated reason for any golden or baseline re-record.
- The provisional names (Kindrel, Brazgor, Ouroth, Nykra, Abyssor, Glimmaw, Durrok, Quarrak, Umbrel, Vortigal, Hyalia, Zephra) are now the working names. Renaming stays cheap until a hero ships past `?ff=roster24`.
- Next builder: WP 0.2 (roster split and HERO_STYLE table), then 0.3, then 0.4, then Batch 1.

## Parity pass after WP 0.2 (2026-11-15)

PASS, no regressions. Classic is pinned to LEGACY_CHARACTERS (14); fixtures, goldens and baselines untouched. Follow-ups:

- WP 0.3: repoint PARITY D01 (`characters.test.ts#has all 14 characters`) to `LEGACY_CHARACTERS`, since appending heroes to `CHARACTERS` makes that title false.
- Type `HERO_STYLE` as `Record<CharacterId, HeroStyle>` (now `Record<string, ...>`), and make `styleOfRace` throw on an unknown race instead of defaulting to melee.
- The style means 0.511/0.492 are right when measured with `balance:compare --ruleset arcade` (16 seeds). The 0.436/0.546 figure came from a Classic or small-sample run (about ±0.12 noise); quote the command and seed count when reporting style means.
- The first `balance:record` will add `styleSummary` to the baselines and needs a stated reason.

## WP 0.4 done (2026-11-15, SIM_VERSION 69)

The Arcade `RANGED` flag (`systems/arcade/meter.ts`) now follows `HERO_STYLE`: fiara, morblass and rokcore are ranged (no Charge, weather charge by casting), wispera is melee (Charge, weather charge by walking). The parity follow-ups above (D01, `Record<CharacterId, HeroStyle>`, `styleOfRace` throws) landed in the same commit. Numbers and the 2v2 noise note: docs/BALANCE.md "Arcade style-align (SIM_VERSION 69)". Open: `src/ui/screens/hero-info.ts` still has its own style table (`RELEASED_STYLE`, same values); point it at `HERO_STYLE`.

## Per-hero files (2026-11-19)

- [Kindrel (fire, melee, #1)](roster24-kindrel.md)
- [Brazgor (fire, melee, #2)](roster24-brazgor.md)
- [Ouroth (fire, melee, #3)](roster24-ouroth.md)
- [Quarrak (earth, ranged, #4)](roster24-quarrak.md)
- [Umbrel (earth, ranged, #5)](roster24-umbrel.md)
- [Nykra (water, melee, #6)](roster24-nykra.md)
- [Abyssor (water, melee, #7)](roster24-abyssor.md)
- [Glimmaw (water, ranged, #8)](roster24-glimmaw.md)
- [Durrok (earth, melee, #9)](roster24-durrok.md)
- [Zephra (air, ranged, #10)](roster24-zephra.md)
- [Hyalia (air, ranged, #11)](roster24-hyalia.md)
- [Vortigal (air, melee, #12)](roster24-vortigal.md)

## Progress note (2026-11-22): proposed roster24 audit gate (7 items)

A hero in `RELEASED_ROSTER24` (src/core/data/release.ts) ships only when all seven hold; release is one hero at a time:

1. Art: approval.json from the art-director for portrait, sprite sheet and map portrait (full body, no human face or hands on elementals), keyed into `public/assets/` by an in-repo `tools/` script, with licence and credit lines.
2. Abilities: every ability has an icon, an effect sprite or procedural fx, a sound and an `ability-lessons` line; no dead ability (see ideas/done/dead-ability-cleanup.md).
3. Sim: the hero characterization and ability unit tests pass; golden replays still match in Node, Chromium, Firefox and WebKit; any sim change carries a SIM_VERSION bump and a stated re-record reason.
4. Balance: `pnpm sim:match --tournament --json` and `pnpm balance:compare` show win rate within the agreed band in 1v1 and 2v2 with the hero added; baseline re-recorded with a reason.
5. UI: pickers, Help, tour and arena screens show the hero; `?ff=roster24` is no longer needed for it; saved picks fall back to a released hero while it is hidden (test in src/game/app/arcade-pick.test.ts).
6. Build and assets: asset manifest and `UNRELEASED_ROSTER24_HEROES` updated, size budget and `release-guard` tests green, `gate:commit` green.
7. Browser: `pnpm e2e:smoke` plus the hero pick-and-fight spec pass via the router (nightly full run clean or known-red only), with a real-game screenshot reviewed by the art-director.
