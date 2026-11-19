---
status: planned
added: 2026-11-19
---

# WS client fixes from the backend session's review

Source: read-only review of `src/game/net/ws/*` against the backend (2026-11-19). Items 1, 3, 4, 5, 6, 7, 8 are client work; 2 and the backend half of 3 are the backend's. Verified by reading: item 1 (online-client.ts `post`: any 503 becomes `rest`).

## High
1. Only a 503 whose body code is 0x000B (resting) is a rest. Any other 503 (backend ticket-write fail `{code:12, retryAfterSec:1}`, or an empty 503 from the gateway) is a retryable server failure with backoff; today it ends a reconnect and loses the match.
2. (Backend) WS stage throttle is a placeholder; refused frames may arrive as JSON text and count as malformed in transport.ts. Do not treat the current value as real behaviour.
3. After UTC midnight the backend may still be throttled; repeated 1006 closes must back off (and `closeFailure` should not read them as plain "could not reach").

## Medium
4. `binaryType` and a fallback that decodes an ASCII ArrayBuffer (text vs binary from PostToConnection is unmeasured).
5. Gateway text notices ("Internal server error", "Too Many Requests", "Forbidden") are counted malformed; surface them.
6. A 401 on /ticket during a reconnect mints a new guest subject, so resume fails (24 h edge only); do not silently re-mint mid-match.
7. Wrong Origin looks like a network failure; the message is misleading.
8. Backend sweep is once a minute (PEER_STATUS 2 is 10-70 s late) vs MATCH_GRACE 10 s.

## Low
9. 429 without a code: generic message. 10. Clock-skew margin on session expiry. 11. Code 9 ERROR in play is ignored (probably fine).

## Notes
- Each needs a test in the integration layer (see the WebRTC-removal plan, `.scratch/plans/webrtc-removal.md`); sequence after the removal merge to avoid two agents in `online-client.ts`.
- Estimate: item 1 is small (one condition plus tests); do it first.
