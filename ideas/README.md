# ideas/

One markdown file per idea, decision or planned work package, so the queue lives in the repo and not in anyone's memory.

Three folders say where an idea stands:

- `epics/`: themed groups (`status: epic`); each lists its member ideas by link, so an agent can take a whole theme. Members stay in their own folder.
- `brainstorm/`: not started (`status: idea`, or `planned` once the owner approved it).
- `in-progress/`: being built (`status: in-progress`).
- `done/`: shipped (`status: done`); kept for history.

Move a file with `git mv` when its stage changes and update `status:` to match. Each file starts with front matter:

```
---
status: idea | planned | in-progress | done
added: YYYY-MM-DD
---
```

There is **no cap**: record every idea and todo, however many, including ones the assistant thinks of itself (owner decision 2026-11-12). `tests/repo/ideas-queue.test.ts` only checks that each status matches its folder. Detailed designs still belong in `docs/FUN-DESIGN.md`; an idea file links to its row.

**Working the queue:** up to 5 agents at once (owner decision 2026-11-12), each on an idea that touches different files, each in its own `git worktree`; one agent at a time for anything that edits shared files (size budgets, `src/core/index.ts`, `docs/REPO-MAP.md`, the asset manifest). Finishing an idea may add new idea files: do that yourself, no permission needed.

## Epic index and recommended order (2026-11-16 cleanup)

Epics live in [epics/](epics/); each lists its members with a one-line summary, suggested order, size, dependencies and owner-gated flags. Members stay in their own folder; an idea may be cross-listed. Recommended order, highest value first (playable, fun and readable, then art, then new modes):

1. Fight readability and HUD: [fight-readability-and-hud](epics/fight-readability-and-hud.md)
2. Game feel and movement smoothness: [game-feel-and-movement](epics/game-feel-and-movement.md)
3. Phone, portrait, touch and performance: [platform-touch-portrait-and-perf](epics/platform-touch-portrait-and-perf.md)
4. Specials, supers and cinematics: [specials-and-cinematics](epics/specials-and-cinematics.md)
5. Abilities, AI and balance follow-ups: [abilities-ai-and-balance-followups](epics/abilities-ai-and-balance-followups.md), with the older [balance-and-ai](epics/balance-and-ai.md)
6. Menus, Tour and hero picker: [menus-tour-and-picker](epics/menus-tour-and-picker.md); accessibility and onboarding: [accessibility-and-onboarding](epics/accessibility-and-onboarding.md)
7. Art: [ability-effects-weather-terrain-art](epics/ability-effects-weather-terrain-art.md), [hero-art-and-rigging](epics/hero-art-and-rigging.md), [art-and-presentation](epics/art-and-presentation.md), [audio](epics/audio.md)
8. Roster 24 art and release (owner-gated): [roster24-art-and-release](epics/roster24-art-and-release.md)
9. Release, online and tests: [online-and-release](epics/online-and-release.md), [testing-and-qa](epics/testing-and-qa.md), [process-and-docs](epics/process-and-docs.md), [gpu-and-art-tooling](epics/gpu-and-art-tooling.md)
10. New modes and depth: [game-modes-and-progression](epics/game-modes-and-progression.md), [training-mode-and-replays](epics/training-mode-and-replays.md), [street-fighter-feel](epics/street-fighter-feel.md), [marvel-vs-capcom-team](epics/marvel-vs-capcom-team.md), [wow-arena-depth](epics/wow-arena-depth.md), [archon-board-game](epics/archon-board-game.md)

Merged on 2026-11-16 (content kept, old names recorded inside the merged file): `qa-hit-feel-r34-r40` (qa-r34/r37/r38/r39/r40 hit-feel notes), `qa-phone-and-tour-r38-r41`, `qa-phone-landscape-early` (qa-phone-landscape-touch, qa-r3-phone-landscape-docks, qa-r4-phone-fight-no-touch-controls) and `portrait-thumb-reach` (absorbed the r82 file). Four stale brainstorm copies that duplicated in-progress or done files were removed (mvc-character-select-with-ability-info, tour-select-screen-redesign, qa-r12-keybindings-gaps, qa-r12-roundend-not-reached).

## Bundle queue (2026-11-17)

A bundle is 3-6 related ideas that touch the same files, so one agent can take the whole group. Each epic has a `## Bundles` section with the members, size, shared files, flags and parallel rules (69 bundles in 23 epics). Flags: SIM = sim-changing (Opus plan, SIM_VERSION bump, golden re-record with a stated reason, one SIM bundle at a time); OWNER = owner-gated; PC = can run on the GPU PC; E2E = needs a headless browser run.

**Lanes.** Two bundles in the same lane never run together. HUD lane: Hud.ts, action-bar.ts, arcade-hud.ts, main.css. FX lane: src/game/fx/*, pose-layer.ts. Arena lane: Arena.ts. Art lane: the asset manifest. SIM lane: src/core/sim, data, agents, goldens and the balance baseline. Tools lane: tools/ci/size-budget.json, playwright config. Index lane: src/core/index.ts and docs/REPO-MAP.md.

**Shared-file rule for every agent.** Do not edit docs/REPO-MAP.md, tools/ci/size-budget.json, src/core/index.ts or the asset manifest unless your bundle owns that lane. Otherwise list the lines needed in your report and the coordinator applies them one at a time at merge.

**Already done, do not queue:** Strike circle label uses Snag, and the portrait 2v2 label fixes (qa-r105 and qa-r107 P2s, merged 2026-11-17).

**Owner-gated, do not queue:** roster24 hero art, rigging and abilities (R2-1, R2-2 in [roster24-art-and-release](epics/roster24-art-and-release.md); gate G0, the contact-sheet review, is pending). Also HA-4 (elemental being redesigns), WA-3 (matchmaking and rewards), GT-1 (using the owner PC), OR-1 (quick join parked, lobby needs a server decision) and the Archon bundles AR-1 to AR-4 (menu placement).

### Night batch (5 agents in parallel, one per lane)

| Slot | Lane | Bundle (epic) | Size | Flags | Why it fits at night |
| --- | --- | --- | --- | --- | --- |
| 1 | SIM | AB-3 Team and speed balance outliers ([abilities-ai-and-balance-followups](epics/abilities-ai-and-balance-followups.md)), then AB-1, then SF-1 | M | SIM, PC | Long balance runs; the only SIM bundle at a time |
| 2 | HUD | FR-4 Action bar and HUD style, then FR-1, FR-2, FR-3 ([fight-readability-and-hud](epics/fight-readability-and-hud.md)) | M | E2E | Readability first; finishes in-progress work |
| 3 | FX / Arena | GF-1 Smoother movement and hit feel ([game-feel-and-movement](epics/game-feel-and-movement.md)), then SC-1, AE-1 | L | E2E | Holds the FX and Arena locks |
| 4 | Art (PC) | HA-1 Sprite audit and cleanup ([hero-art-and-rigging](epics/hero-art-and-rigging.md)), then HA-2, AP-1 | L | PC, E2E | Image generation on the PC; owner sees a sheet first |
| 5 | Tools / docs | OR-2 Short and long gate ([online-and-release](epics/online-and-release.md)), then TQ-1, TQ-3, TQ-2 ([testing-and-qa](epics/testing-and-qa.md)) | M | PC, E2E | Full e2e repeats on the PC; owns size-budget.json |

### Daytime (2-3 agents, lighter work)

| Slot | Lane | Bundle (epic) | Size | Flags |
| --- | --- | --- | --- | --- |
| 1 | HUD / UI | PT-2 Phone landscape and touch controls, then PT-3 ([platform-touch-portrait-and-perf](epics/platform-touch-portrait-and-perf.md)); PT-1 only after the owner confirms the view contract | M | E2E |
| 2 | UI | MT-4 Match-end card fixes, MT-1 Picker and menu cleanup, MT-2 Tour screens ([menus-tour-and-picker](epics/menus-tour-and-picker.md)), AO-1 ([accessibility-and-onboarding](epics/accessibility-and-onboarding.md)) | S-M | E2E |
| 3 | Docs / tests | TQ-2, TQ-3 triage ([testing-and-qa](epics/testing-and-qa.md)), BA-1 synergy harness ([balance-and-ai](epics/balance-and-ai.md)), TM-1 training mode ([training-mode-and-replays](epics/training-mode-and-replays.md)) | S-M | none or E2E |

### Later (after the night SIM queue)

In order, one SIM bundle at a time: AB-4, BA-3, GF-2, GF-3, MV-1, MV-2, MV-3, SF-2, SF-3, SC-2, SC-3 to SC-5 (signature slot 3, one hero per merge), AE-5, GM-1, then WA-1 and WA-2. Non-SIM later items: AE-2 to AE-4, SC-6, MT-3, AP-2, AP-3, HA-3, AU-1, PD-1 (exclusive on index and REPO-MAP lanes). Coordinator rule: before handing out PT-1, MT-4, GF-1 or FR-4, check running agents, because portrait, match-end and smoother-movement work may already be in flight.
