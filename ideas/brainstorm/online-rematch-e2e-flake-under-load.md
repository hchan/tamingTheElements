---
status: idea
added: 2026-11-12
---

# online-versus Rematch e2e flaked once in a full run

`tests/e2e/online-versus.spec.ts:51` (finished online match offers a Rematch) failed once in a full `pnpm e2e` run at 3143c10 (`#onlineAgain` not visible within 40 s) and passed 3/3 alone with `pnpm e2e:flake --repeat 3`. Probably the two-page match runs slowly under SwiftShader load. Next step: repeat it inside a full run, check whether the match end needs more than 40 s, and wait on the sim tick instead of a fixed timeout.
