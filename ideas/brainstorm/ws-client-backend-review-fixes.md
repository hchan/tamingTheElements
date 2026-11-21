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
- Each needs a test in the integration layer (the WebRTC removal has merged, so `online-client.ts` is free).
- Estimate: item 1 is small (one condition plus tests); do it first.

## Netcode review follow-ups (2026-11-19, after items 1 and 2 merged)

Review verdict: approve, no blockers. Open minor items:

- Harness test in `src/testing/net/online-client.test.ts` that asserts `binaryType === 'arraybuffer'` and text, binary, text frame order; rename the old "binary is malformed" test at line 176.
- (Done 2026-11-20, docs-online-stale; transport.ts comment was already fixed.) Docs `ONLINE-CLIENT.md:55` and `ONLINE-PROTOCOL.md:20` still say binary is malformed; document that the client also accepts base64 text in a binary frame (the relay never sends one). Fix the comment at `transport.ts:156`.
- Add a conformance case for the HTTP resting body `{"code":11,"retryAfterSec":n}` on a 503 (the resting check now depends on the body).
- `reconnect()` ignores `retryAfterSec` on a plain 503; wait the larger of the backoff and `retryAfterSec * 1000`, capped at `BACKOFF_MAX_MS`.
- Nits: comment at `online-client.ts:29` says "HTTP 503" (should say with body code 0x000B); consider requiring `res.status === 503` for the resting check; move the `binaryType` assignment inside the `try`.
- Not yet done: plan test 2d (relay golden path in ASCII-binary mode) needs `relay-socket.int.test.ts`.

## Item 4 closed: no change needed (2026-11-20)

sct-27 confirmed the backend runs our vendored relay core: HELLO while resting closes with advisory 4011 and no ERROR frame
(`src/core/relay/core.ts` ~282-284, the contract is already right); a live socket gets ERROR 0x000B with a retry hint on the
resting tick, then a close. The client already treats a 4011 close and an ERROR 0x000B as resting
(`online-client.ts` close-code hint, `online-client.test.ts` and `ws-int/online-client.int.test.ts` G4). The earlier
"ERROR then 4011 on HELLO" proposal is dropped; changing it would need a new relay version and tarball on the backend side.
Resting persists until a manual reset on the backend; the retry hint is seconds to midnight or a 3600 s estimate (sct-27).
