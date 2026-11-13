---
status: idea
added: 2026-11-13
---

# Nightly gate on ability usage

Wire `pnpm ability:usage` (Arcade) into the nightly fun gates: fail when a previously ok ability turns dead, or a hero's top slot passes a committed cast-share band. Bands live in a committed JSON like tools/ci/fun-gates.json; move them only with ability:usage numbers in the commit.
