# Legacy to-do list (war/todo.html, retired)

The author's original list, each item with a disposition. **Already in legacy** = exists in the legacy code. **Planned** = covered
by the modernization plan (bugs are tracked in [KNOWN-BUGS.md](KNOWN-BUGS.md)). **Backlog** = a post-parity idea. **Dropped** =
no longer relevant.

| Item | Disposition |
|---|---|
| circus of slime / ice shards are an autokill at point blank | Backlog (balance pass) |
| capture puts a debuff; must kill within the debuff time | Backlog (design decision) |
| show the Capture icon as a new ability on chapter 2 objectives | Done ("Capture unlocked!" notice on the chapter 2 objectives screen and the action bar, parity row V25) |
| applyDamageOverride in abilities.js is questionable | Planned (fixed by the sim rewrite) |
| create wiki page / wiki - capture | Planned (docs/ game design doc) |
| limit garrison to X characters | Planned (`garrison-max-size-unenforced`) |
| add levels (EASY, NORMAL, HARD, WTF) | Already in legacy (Settings difficulty enum) |
| add sound to cinematic | Backlog |
| enter portal fiery chaos animation button | Backlog |
| garrison sort order: level, race, elementalType | Planned (`garrison-sort-ignored`) |
| treenoc entangling vines has a bug on opponent death | Planned (`vines-stacking`) |
| elemental imbalance equation: lose 1% health every 5s | Backlog |
| rotate stick | Backlog |
| change background / void background image / animated wallpaper / last-boss background | Backlog (visual polish) |
| read user.properties for authentication | Dropped (GAE login retired) |
| escape pauses the game with a menu modal; ESC will pause | Planned |
| when swapping, characters get REST points | Already in legacy (HealWithRest) |
| preferences in main menu / display size in preferences | Already in legacy (Settings) |
| draw diagram for elemental damage multiplier / reduction | Planned (docs/ game design doc) |
| pause has problems with delay / curTime | Planned (`pause-vs-date`, fixed by the tick clock) |
| improve AI for swap / heal | Planned (AI port, then improvement) |
| actionbar click (mouse) | Planned (input) |
| change color of health as you get weaker | Backlog |
| standardize buttons | Planned (UI design system) |
| change color of wispera and his bullet | Backlog |
| multiplayer | Planned (WebRTC PvP, post-parity) |
| too slow - save state and then refresh | Dropped (page-reload battle start is replaced) |
| controller | Planned (gamepad support) |
| unlock secret sprites / pax adrenaline sprites | Backlog |
