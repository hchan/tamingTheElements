---
status: idea
added: 2026-11-17
---

# Menu cleanup (big)

Owner, 2026-11-17: "menu needs big cleanup" (later task; online flow comes first).

Seen while testing online play:

- Versus mixes local same-screen two-player play with the opponent/team/AI/arena options; local two players is NOT online play and must read that way ("Two players, same screen"; online lives under Online).
- The Online screen hid the Join button behind a role choice (addressed by the Online Part 1 flow, see [online-lobby](online-lobby.md)).
- Menu hierarchy, prominence and wording overall: five entries (Play, Versus, Online, Settings, Help) but unclear what each does; Versus screen is dense (opponent, team, AI level, arena, roster, details panel all at once).

To do: audit every menu screen at 360 px and desktop, decide a simple hierarchy (one primary action per screen), prominence for Online, trim options per screen, plan with Opus before building. Related: [qa-menu-bland](qa-menu-bland.md).

## Progress (stepwise)

- WP MENU-A (main menu) done: every button has a plain-words subline (data-sub, `aria-describedby`), Online stays the one gold featured entry, Play keeps first focus, Settings and Help are a smaller two-up row; phone landscape stays one row of five without sublines.
- Remaining: B Versus screen, C Settings, D Help and Play, E Online (after the OnlineClient merge).
