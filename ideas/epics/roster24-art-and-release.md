---
status: epic
added: 2026-11-16
---

# Epic: Roster 24: art, icons and release

The 12 unreleased heroes: redo the art, ability icons, effects and weather, rebalance, then release.

- Suggested order: Roster24 art redo, then icons/fx/weather art, then missing portrait frames, then the 24-hero balance report, then release.
- Size: XL; the art redo is the long pole.
- Dependencies: Hero rigs and bakes (hero-art-and-rigging), ability-effects art, balance tools.
- Owner-gated: OWNER-GATED: the first roster24 art was scrapped (2026-11-16); show a sheet first. Roster24 stays hidden until the owner approves release.

Member ideas, in suggested priority order (work them as separate small work packages):

- [roster24-art-redo](../brainstorm/roster24-art-redo.md): Roster-24: redo the 12 unreleased heroes' art. Owner, 2026-11-16, after seeing a 24-portrait sheet:
- [roster24-ability-icons-fx-weather-art](../brainstorm/roster24-ability-icons-fx-weather-art.md): Ability icons, effect sprites, weather and terrain art for the 12 roster24 heroes. Goal: new artwork for each roster24 hero:
- [qa-missing-map-portrait-frames](../brainstorm/qa-missing-map-portrait-frames.md): QA: missing map-portrait frame warnings on every fight. Every match logs Phaser warnings 'Texture "%s" has no frame "%s"' (format string not interpolated) for map:<hero>~grim right0 and left0, for all eight
- [balance-report-24-heroes-after-roster24](../brainstorm/balance-report-24-heroes-after-roster24.md): Balance report across all 24 heroes after roster24 release. Goal: once roster24 ships, run pnpm sim:match --tournament --json and pnpm balance:compare across all 24 heroes in 1v1 and 2v2, report per-hero win ra
- [roster-24-heroes](../in-progress/roster-24-heroes.md) (in progress): Roster of 24: six heroes per element. Progress: batch 1 (Kindrel, Nykra, Quarrak, Hyalia) is implemented behind ?ff=roster24 (dev and test builds);

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [roster24-redo-candidates](../brainstorm/roster24-redo-candidates.md): Roster-24 redo: concept candidates, round GPU-1 (2026-11-17)

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

Both bundles are OWNER-GATED. Gate G0 (contact-sheet review of the redo candidates) is pending. Do not queue.

### R2-1 Art redo and contact-sheet review

- Members: [roster24-art-redo](../brainstorm/roster24-art-redo.md), [roster24-redo-candidates](../brainstorm/roster24-redo-candidates.md), [roster-24-heroes](../in-progress/roster-24-heroes.md)
- Size: XL
- Shared files: asset manifest, roster24 art, tools/assets/*
- Flags: OWNER-GATED (G0 pending), PC-offloadable, owner sees a sheet first
- Parallel: Not queued.

### R2-2 Icons, fx art, map portraits and balance report

- Members: [roster24-ability-icons-fx-weather-art](../brainstorm/roster24-ability-icons-fx-weather-art.md), [qa-missing-map-portrait-frames](../brainstorm/qa-missing-map-portrait-frames.md), [balance-report-24-heroes-after-roster24](../brainstorm/balance-report-24-heroes-after-roster24.md)
- Size: L
- Shared files: asset manifest, src/core/data/*, balance baseline
- Flags: OWNER-GATED (after R2-1), SIM for the balance part, PC
- Parallel: Not queued.
