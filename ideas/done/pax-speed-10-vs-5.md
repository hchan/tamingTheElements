---
status: done
added: 2026-11-15
---

# Pax speed 10 versus 5

data/characters.ts line 27 gives Pax speed 10 while other docs and the legacy data say 5. Idea only: do not change it without checking the balance baseline and legacy parity. Found while planning WALL-3.

## Progress

- 2026-11-20: already fixed; `pax` has speed 5 in `LEGACY_CHARACTERS`. Guard test: `tests/repo/pax-speed.test.ts`.
