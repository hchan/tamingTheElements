---
status: idea
added: 2026-11-18
---

# Retire the WebRTC Online path

Once quick match over the relay is proven (e2e, a few weeks of play), remove `online-versus.ts`, `src/game/net/` WebRTC adapters, `tools/signal-relay/` and the `?join=` link handling; the Online entry then always uses the relay. This is MULTIPLAYER-DESIGN open question 12 and is owner-gated (deleting working code). Keep the copy and paste path as the no-server fallback until then.
