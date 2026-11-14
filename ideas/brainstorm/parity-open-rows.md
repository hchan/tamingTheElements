---
status: idea
added: 2026-11-12
---

# Close the 5 open PARITY rows

Each open row in docs/PARITY.md needs a named passing test or an intentional-divergence decision. Found by repo-score 2026-11-12; takes Port progress from 4 to 5.

## Progress

- 2026-11-14: only 3 rows were actually `open` (U12, U14, U15; C25 and U11 already `matches`). All three are now `intentional divergence`:
  U12 gained `tests/repo/assets-manifest.test.ts` (every character has a map sprite, every element a background, files on disk);
  U15 gained a source pin in `tests/repo/parity.test.ts` for the 1200 ms beat; U14 already cites `bindings.test.ts`.
  Cited tests verified present and passing. Left in brainstorm (not done): owner sign-off for U14/U15 and the art look (U12) is still due at WP 96.
