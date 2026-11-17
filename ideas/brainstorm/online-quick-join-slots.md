---
status: idea
added: 2026-11-17
---

# Online quick join with digit slots 0-9

Owner idea, 2026-11-17: besides the two-code host/join flow (kept as the secure manual option), offer a quick join: each player picks a digit 0-9 and two players who pick the same digit (0 and 0, 1 and 1, ...) are matched. Far less burden than exchanging two long codes.

Needs a rendezvous broker (two browsers cannot find each other alone); it only swaps the WebRTC handshake, the match stays peer to peer. Options: a public PeerJS broker (free, no deploy, third-party uptime) or our own relay on AWS (see [online-lobby](online-lobby.md); `src/game/net/relay.ts` and `tools/signal-relay/` already do 6-char room codes). Risks: strangers colliding on a digit, slot races (first claimer hosts, second joins), hot keys at scale.

Owner decision 2026-11-17: parked, keep manual codes only for now; pick the broker before building.
