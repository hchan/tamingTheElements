---
status: done
added: 2026-11-13
---

# Nightly gate on ability usage

Wire `pnpm ability:usage` (Arcade) into the nightly fun gates: fail when a previously ok ability turns dead, or a hero's top slot passes a committed cast-share band. Bands live in a committed JSON like tools/ci/fun-gates.json; move them only with ability:usage numbers in the commit.

Done 2026-11-14: `pnpm ability:gates` (tools/ci/ability-usage-gates.ts, bands in tools/ci/ability-usage-gates.json) runs in the nightly fun-gates workflow. Fails on a dead slot or a hero top-slot cast share above its band. Bands set from `ability:usage --seeds 8` (max share per hero plus about 0.03; no dead slots measured).
