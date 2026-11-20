---
status: idea
added: 2026-11-20
---

# perf.spec frame time bound flaky under nightly load

Nightly full e2e (commit 9f44b4c8): `tests/e2e/perf.spec.ts` "stepped battle frame time under SwiftShader stays within a very generous bound" measured 38 ms against a 35.5 ms limit. The spec already measures windows to ride out load bursts, so this is treated as load noise on the shared machine (P2 polish, does not block pushes).

Next: stress it with `pnpm e2e:flake --repeat 20 --grep "stepped battle frame time"` (PC only). Never fails = could not reproduce; fails some repeats = flaky, fix the test's windowing. The bound is not loosened here.

Same night: `match-end.spec.ts` "winner, result word, reachable buttons" (#arcadeRematch bottom 1259.8 > 720) did not reproduce on current main (short lane, PC, 5 passed). Watch the next nightly run.
