---
status: in-progress
added: 2026-11-15
---

# Pin the roster in a saved Tour run

`buildTour(hero, seed)` depends on the released roster, so a roster release (`RELEASED_CHARACTERS` / `ARCADE_RACES` change) re-rolls the ladder of a saved run: the card and fight still agree, but a resumed run's map changes. Store the roster (or the built ladder) in the save (v:2) so a resumed run keeps its opponents.

## Progress

2026-11-20: `TourRun.roster` (optional) pins the opponent pool at `startRun`; save format v:2 stores it (v1 saves still load and use the live roster); `buildTour(hero, seed, roster)` and `currentStage` use it. Tests in tour-model.test.ts.
