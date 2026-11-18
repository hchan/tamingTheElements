---
status: done
added: 2026-11-18
---

# Relay package owns its room-code rules

The owner wants the WebRTC path untouched: `tools/signal-relay/rooms.ts` is restored to its WP10 content and no longer imports `src/core/relay/rooms-rules.ts`. The relay package keeps its own copy, and `tests/repo/room-code-rules-drift.test.ts` fails if the alphabet, length, TTL, cap, code generation, expiry or normalisation of the two differ (WP-RELAY-ROOMS-OWN).
