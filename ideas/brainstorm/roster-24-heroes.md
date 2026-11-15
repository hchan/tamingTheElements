---
status: idea
added: 2026-11-14
---

# Roster of 24: six heroes per element

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
