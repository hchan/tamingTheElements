---
status: done
added: 2026-11-12
---

# online-versus Rematch e2e flaked once in a full run

`tests/e2e/online-versus.spec.ts:51` (finished online match offers a Rematch) failed once in a full `pnpm e2e` run at 3143c10 (`#onlineAgain` not visible within 40 s) and passed 3/3 alone with `pnpm e2e:flake --repeat 3`. Probably the two-page match runs slowly under SwiftShader load. Next step: repeat it inside a full run, check whether the match end needs more than 40 s, and wait on the sim tick instead of a fixed timeout.

Done 2026-11-12: root cause was in the game, not the timeout. A lockstep side that reaches its match end stops being updated (the Arena driver pauses, and the screen tore the game down 1.2 s later), so it stops resending. The datagram link is lossy (`maxRetransmits: 0`; a starved page also overflows its capped inbox), and a peer one input short then never finishes: no match end, no Rematch button, until it times out. `tick -1` in the e2e message is `__TTE__.state()` with no arena. Fix: the Arena keeps answering the session (`update(0)`, receive and resend only) on a wall-clock timer after the end, and `online-versus` keeps the finished arena up until the rematch's match replaces it or the screen closes. Pinned by `src/testing/net/linger.test.ts` (silent end strands a peer on lossy seeds; lingering never does). Could not reproduce the flake locally (8 passes incl. under 10 CPU burners plus parallel vitest), so the unit test is the evidence.
