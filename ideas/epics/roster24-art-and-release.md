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
