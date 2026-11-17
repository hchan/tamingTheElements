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
