---
status: done
added: 2026-11-12
---
# Game Master: slow first read overwrote the editor

Found while writing `src/ui/screens/game-master.dom.test.ts`. The textarea was filled by an async `exportJson()` on mount;
if a preset or Clear was clicked before that read resolved (plausible with the IndexedDB store), the late read replaced the
preset text while the store held the preset. Fixed in `game-master.ts` with a `touched` flag (set by typing, Clear and
presets); covered by "a slow first read does not overwrite a preset or Clear".
