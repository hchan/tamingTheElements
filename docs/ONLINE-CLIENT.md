# Online client (WebSocket relay)

The browser side of [ONLINE-PROTOCOL.md](ONLINE-PROTOCOL.md) (the contract; section numbers below refer to it). Code: `src/game/net/ws/config.ts` and
`online-client.ts`, over the 4a transport (`transport.ts`, `wire.ts`, `control-link.ts`). Status: client and tests only; **no menu entry and no UI**
use it yet, and the WebRTC path is untouched. Numbers marked **[estimate]** or **[choice]** are not measured.

## Configuration

One build-time value: `VITE_ONLINE_URL`, for example `https://relay.example.invalid`. `onlineConfig()` in `config.ts` is the only place that reads
`import.meta.env` for it; `parseOnlineUrl(value)` is the pure part. Only an `https://host` value counts; anything else (unset, empty, `http://`, a path)
gives `{ configured: false }`, which means "do not offer online entries". The WebSocket URL is the same host with `wss`. Nothing else in the client
knows the host.

The GitHub Pages build is static, so the value is **baked in at build time** (`VITE_ONLINE_URL=... pnpm build`, for instance as a repository variable
passed to the Actions build step). No value is committed to the repo; the itch.io build needs the same value baked into its own build (protocol open
question 10). A build without it simply has no online play.

## API (`OnlineClient`)

Everything the client touches is injected through `OnlineDeps`: `config`, `fetch`, `WebSocket` (constructor), `simVersion`, `now`, `after(ms, fn)`
(one-shot timer returning its canceller) and `random`. Tests give it fakes and a virtual clock; the app passes the browser's.

| Call | Result |
| --- | --- |
| `connect()` | `OnlineResult<WebSocketTransport>`: the connected transport for the session layer. Run once per client. |
| `joinQueue()`, `leaveQueue()`, `createRoom()`, `joinRoom(text)` | `boolean` sent (false: socket down, or the text cannot be a room code). Answers arrive as events. |
| `onEvent = (e) => ...` | `queue`, `room-created`, `room-peer`, `match`, `peer`, `result-ack`, `reconnecting`, `reconnected`, `resting`, `error`, `closed`. |
| `rttMs()`, `quality()` | Median of the transport's last 5 ping round trips and its `link-quality.ts` grade. |
| `steamStartUrl()`, `signInWithSteam(code)` | Steam only as plumbing: the `<base>/auth/openid/start` URL to navigate to, and the one-time code exchange (`POST /session {"kind":"steam","code"}`). |
| `close()` | Ends the link; the transport reports `closed`. |

`OnlineResult<T>` is `{ ok: true, value } | { ok: false, failure }`. Nothing throws on network errors. `OnlineFailure.kind`:

| kind | When | Player words (`friendlyMessage`) |
| --- | --- | --- |
| `not-configured` | no `VITE_ONLINE_URL` | "Online play is not available in this build." |
| `network` | fetch rejected, socket would not open or no WELCOME in 10 s [choice] | "Could not reach the online service..." |
| `update-needed` | ERROR `0x0003`, close 4003, or WELCOME with another version; never retried | "Update needed, reload the page." |
| `resting` | HTTP 503, ERROR `0x000B` or close 4011; `retryAfterSec` (0 = unknown) | "The game is resting. Please look again in about 1 h." (default 1 h when 0) |
| `server` | any other code of section 5 (`code`, `retryAfterSec`, HTTP `status`, 0 for a frame) | per code (room not found, room full, ...) |
| `bad-response` | a 2xx body without the expected fields | "The online service sent something unexpected..." |

After `resting` the client refuses `connect()` without any request until the wait is over (`restingSec()`); the caller should hide the entries for
that time. An in-frame `resting` is an event (the socket closes later, 4011) and is final once the socket drops: no reconnect.

## Flow

1. `POST /session {"kind":"guest"}` once; the token is kept in memory and reused until its `expiresIn` (24 h [choice]). Persisting it is the caller's job.
2. `POST /ticket` with `Authorization: Bearer <session>` for **every** socket, including reconnects. A 401 clears the session and fetches one fresh guest session.
3. Open `wss://<host>?ticket=<ticket>` (the ticket is URL-encoded). A refusal before the socket opens, or ERROR `0x0004`, gets one fresh ticket; then it is a failure.
4. HELLO `{ver 1, simVersion, resumeSession}`; WELCOME is the answer. `connect()` resolves with the transport after WELCOME. The ping timer (every 2 s) starts.
5. Lobby frames (QUEUE_STATE, ROOM_*, MATCH_START, PEER_STATUS, RESULT_ACK) are decoded by the client; everything else goes to the transport. Malformed frames
   (wrong length, bad room code or event) are dropped; the transport counts them in `malformed`. RESULT_ACK stops the transport's RESULT retry.
6. **Reconnect** when the socket drops without 4003/4011/1000: events `reconnecting` (attempt n) and `reconnected` (`resumed` from WELCOME; MATCH_START is
   re-sent by the server and arrives as a `match` event with `resumed: true`). Attempts at 0, 1, 2, 4 s then 4 s again, +0..25 % jitter, capped at 30 s, each with a
   new ticket. The window is 10 s in a match (the server's grace [choice]) and 60 s otherwise [choice]; then `closed` with `network`. A reconnect that is not
   `resumed` (for example while only queued) means the caller must join the queue again.
7. The transport is created once with a hub socket that survives reconnects. Within a match its `seq` counter, reorder buffer and ControlLink continue across a
   reconnect (`startMatch(matchId, true)`); frames sent while the socket is down are dropped, which the session's redundancy repairs.
8. **Per match.** MATCH_START carries the relay-assigned `matchId` (from 1 per pair). The client calls `transport.startMatch(matchId, resumed)`: for a new match
   (`resumed = 0`) it resets the BATCH/PAUSE seq, the reorder buffer and ControlLink; for a resume it keeps them. `resumed` is true only when a `resumed = 1` WELCOME
   preceded it, a match was in progress and the matchId is unchanged, so a duplicate MATCH_START after a resume is harmless and a new pair with matchId 1 is still new.
   Match-phase frames (BATCH, PAUSE) with another matchId are dropped (`staleMatch`); PEER_STATUS and RESULT_ACK with another matchId are not emitted. The session's
   `match` option must equal the MATCH_START matchId (it is the packet `match` byte). HASH, DESYNC and RESULT go out with seq 0 and do not use BATCH/PAUSE numbers.
9. An unsolicited RESULT_ACK `2` (relay-detected hash divergence, or a RESULT whose peer is gone) is handled like any RESULT_ACK of the current match. ERROR `0x0005`
   (busy, including the queue cap) is an `error` event. A close with code 1000 of an old socket (takeover resume) is ignored because only the current socket's close counts.
10. `inMatch` (which picks the 10 s versus 60 s reconnect budget) is cleared by RESULT_ACK for the current match and by joining a queue or room again.

## Tests

`src/testing/net/online-client.test.ts` (fake fetch, fake WebSocket, fake backend, `FakeRelay` for match frames): happy path with two clients, ping and
grade, rooms, refused and expired tickets, reconnect with backoff and continuing `seq`, giving up, kill switch (HTTP and in frame), version mismatch,
not configured, malformed frames, network errors and a silent server, Steam plumbing, two consecutive matches on one client (rematch and requeue), stale
PEER_STATUS, the 60 s idle budget after a match, unsolicited RESULT_ACK 2, matchId wrap 255 to 1, busy 0x0005 and a takeover close 1000. `ws-transport.test.ts` covers `startMatch`, the matchId filter and seq 0 for HASH/DESYNC/RESULT.

## Open points for the spec

- WELCOME carries no matchId, so a resumed connection is recognised by the re-sent MATCH_START; spec section 7 could say that MATCH_START always follows a `resumed = 1` WELCOME.
- The server's behaviour for HELLO with a `resumeSession` that is unknown (not resumed) is "WELCOME `resumed = 0`" here; section 7 does not say.
- No lobby frame is in `wire.ts` yet; `decodeLobby` in `online-client.ts` should move there when the shared codec arrives.
