# Relay package

`@tamingtheelements/relay` is the transport-agnostic relay core of the online protocol ([ONLINE-PROTOCOL.md](ONLINE-PROTOCOL.md)),
distributed from this repo (not from an npm registry) so a backend (serverless or a Node process) can host it without importing the game. Metadata lives in
`packages/relay/` (the repo is not a workspace); the sources are `src/core/relay/`, compiled as they are.

## Entrypoints

| Import | Contents |
|---|---|
| `@tamingtheelements/relay` | `RelayCore` (`handle`, `handleClose`, `sweep`), the wire codec (`decodeFrame`, `encodeFrame`, frame types), the text codec (`encodeText`, `decodeText`), constants (`PROTOCOL_VERSION`, `FrameType`, `ErrorCode`, `closeCodeFor`, limits and timings), room-code rules, `ReorderBuffer`, and the `Store`, `Sender`, `RelayCtx` interfaces |
| `@tamingtheelements/relay/testing` | `InMemoryStore`, `LoopbackSender`, `createLoopbackConformance()` (RelayCore wired in process as a conformance target) |
| `@tamingtheelements/relay/conformance` | the wire-spec conformance suite: `runAll` / `runConformance`, `conformanceCases`, `goldenFrames`, adapter and hook types |

The host supplies a `Store` (async get/put/delete/keys; `put` takes `ifVersion: 'absent' | number` for conditional writes and an
optional TTL), a `Sender` (`send(conn, text)`, `close(conn, code)`; the close code is advisory since v3) and a `RelayCtx` per call (`now`, `randomInt`, optional `resting` kill switch, optional `identity`). The core
reads no clock or randomness of its own and keeps no state between calls. It relays and compares; it never simulates.

## Semver policy

- A change to the wire format (frame layout, a type byte, an error code's meaning, `PROTOCOL_VERSION`) is a **MAJOR** bump, and
  `PROTOCOL_VERSION` changes with it.
- New optional exports, new `RelayEvent` kinds, or behaviour fixes that keep the wire unchanged are MINOR or PATCH.
- **Capability-gated additions (amendment, chat).** A wire addition that is capability-gated and off by default is MINOR; turning it on is the operator's step. The chat frame `0x70` (ONLINE-PROTOCOL.md section 4a) is the first: WELCOME's `caps` byte (bit0 = chat) is 0 unless `RelayOptions.chat` is true, `PROTOCOL_VERSION` stays 3, and with chat off a `0x70` frame is bad-frame as before. `packages/relay` goes 1.0.0 to **1.1.0**, with the new `RelayEvent` kind `{ kind: 'chat'; match; slot; outcome }` (outcomes `sent`, `rate`, `bad`, `cap`, `away`, `stale`; counts only, no text, no length) and `RelayOptions.chat?: boolean` (default false). The conformance chat cases skip unless WELCOME `caps` bit0 is set. Deploy order: 1.1.0 with chat off, run the kit (chat cases skip), set `chat: true`, run the kit again.
- Changing the `Store` or `Sender` interface in a way that breaks an existing implementation is MAJOR.
- `./testing` follows the same rules, but may add helpers in MINOR releases.
- `./conformance` may add cases in MINOR releases (a new entrypoint or case is MINOR; `1.0.0` is the first publish). A case that only tightens
  a check the spec already demands is a PATCH. A case that encodes a changed wire rule goes with the MAJOR bump.

## Conformance suite

`@tamingtheelements/relay/conformance` checks a deployed or local relay against docs/ONLINE-PROTOCOL.md over real frames. It has no test-runner
dependency: a case is a plain `{ id, spec, title, run(adapter, hooks) }` that throws on failure, and `runAll` returns a report.

```ts
import { runAll } from '@tamingtheelements/relay/conformance';

const adapter = { connect: async () => /* open a WebSocket; return { sendText(s), sendBinary?(bytes), onText(cb), onClose(cb), close() } */ };
const report = await runAll(adapter, { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), settleMs: 100, timeoutMs: 3000 });
if (!report.ok) throw new Error(report.results.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.message}`).join('\n'));
```

- Hooks (all optional): `sleep` (default only yields; supply a real timer for a remote relay), `setResting(retryAfterSec | null)` flips the kill switch,
  `advanceTime(ms)` moves the relay clock and sweeps (grace expiry, the 60 s resting close), `simVersion` (default 1), `timeoutMs`, `settleMs`.
  Cases that need a missing hook (or `sendBinary`) report `skip`, not `fail`.
- Adapter contract: `connect(opts?: { sameIdentityAs?: ConformanceClient })`. A case that resumes a session passes the client that dropped, and the new socket must act as the same
  player (for a ticket flow: the same session token, no new `/session`), because a relay refuses a resume for another identity. An adapter whose identity is not per connection may ignore it.
- Running against a deployment (`pnpm relay:conformance`, target only from env `TTE_RELAY_URL`): `--advisory-close` reports a 1000 close that follows an ERROR frame as `4000 + code`
  (API Gateway cannot pick the close code, and the frame is the authority; a resting close with no frame still fails); `--no-binary` leaves `sendBinary` out so `malformed.binary` skips
  (a gateway that routes on the message body may never pass a binary message on); `--strict-text` fails on binary delivery. All three default off. `--retry-ordering <n>` (0-10, default 0) re-runs a failing case marked `orderSensitive` (`hash.consumed`, `batch.far-ahead-seq`) up to n more times: on a deployment where each frame is a separate concurrent invocation, two back-to-back frames can be handled out of order (measured on the live relay: in 9 runs on two bundles `hash.consumed` failed 2 times and `batch.far-ahead-seq` 3 times; with `--retry-ordering 3`, `batch.far-ahead-seq` still failed in 2 of 3 runs, so a deployment may need a higher value or a gateway that keeps order). Cause (backend owner, from AWS knowledge, not measured here): API Gateway WebSocket invokes the integration once per inbound message with no ordering guarantee within a connection and no per-connection serialization option, so `batch.far-ahead-seq` is ordering-unreliable on such a deployment and the client's reorder layer (`src/game/net/ws/reorder.ts`) is what keeps a match correct. A stale queued entry from a previous case's socket can also fail `queue.leave` now and then (the disconnect invocation races the next connect). A retry pass is reported with a message, never silently.
- `runAll(adapter, hooks, { only: ['queue.', 'resting.'] })` filters by id prefix. Case ids are grouped: `wire.golden.*` (no adapter, one byte vector per frame
  type), `wire.text.*` (golden base64 texts), `hello.*`, `version.*`, `malformed.*` (including `malformed.binary`), `queue.*`, `room.*`, `batch.*`, `setup.*`, `pause.*`, `hash.*`, `desync.*`, `result.*`, `resume.*`, `resting.*`.
- Every server frame is also checked to decode from its base64 text and re-encode to the same bytes.
- Cases never assume a clean relay, but each uses fresh connections and leaves nothing queued (disconnects on exit).
- Vitest wrapper in this repo: `src/core/relay/conformance.test.ts`, against `createLoopbackConformance()` (see it for how to glue sockets).

## Commands

```sh
corepack pnpm exec vitest run --project core src/core/relay --coverage.enabled=false   # unit tests
corepack pnpm exec vitest run --project repo tests/repo/relay-package.test.ts          # package guards
node tools/relay-package/build.mjs                                                     # tsc to packages/relay/dist (ESM + .d.ts, gitignored)
cd packages/relay && corepack pnpm pack --pack-destination ../../.scratch              # tarball
```

**Distribution (owner, 2026-11-18): no registry publish.** A release is a commit on `main` plus an annotated git tag `relay-v<version>` (for example `relay-v1.0.0`). The backend pins that tag, checks it out, and runs `node tools/relay-package/build.mjs` (or `pack`, above, for a tarball it can install). `dist/` is gitignored, so the build step is part of consuming a release.

The build rewrites relative specifiers to `.js` after `tsc` (the repo's sources are extensionless for the bundler). The package
has no dependencies.

## Notes

- `src/core/relay` is exempt from the "no async/await" lint rule only (`eslint.config.js`); every determinism ban stays on, and
  `tests/repo/relay-package.test.ts` fails if the rest of `src/core` imports it.
- `src/core/relay/text-codec.ts` is hand-written (no Buffer, btoa or atob) so it runs in Node, browsers and Workers. The game client may not import the package (depcruise), so it keeps a copy in `src/game/net/ws/text-codec.ts`; `tests/repo/relay-text-codec-drift.test.ts` fails if they differ, and `tests/repo/relay-text-codec-node.test.ts` checks the package copy against Node's `Buffer`.
- `src/core/relay/rooms-rules.ts` is the package's own copy of the room-code rules. The browser client (`src/game/net/relay.ts`) keeps its own and does not import the package; `tests/repo/room-code-rules-drift.test.ts` fails if they differ.

## Behaviour of the 0.1.0 fix round (WP-ONLINE-FIX-RELAY)

This round changes wire behaviour (matchId values, seq rules, PEER_STATUS contents), which the policy above calls MAJOR. The package is
unpublished, so it stays at 0.1.0; the first publish is the baseline.

- **Compare-and-set.** Every write of a `conn:*` record goes through `ifVersion` (retry on conflict), so QUEUE_LEAVE, a double
  QUEUE_JOIN, a close during pairing and the resting notice cannot overwrite each other. A pairing re-checks that the partner is still
  queued and still has a record; if not, nothing is started and the survivor stays queued.
- **matchId** counts up from 1 per pair on the relay (key `matchctr`, wraps inside 1..255). It is in MATCH_START (re-sent unchanged on
  resume) and in every PEER_STATUS. Match-phase frames with another matchId are dropped.
- **seq.** Only BATCH and PAUSE are numbered. HASH, DESYNC and RESULT carry seq 0 and the relay never checks it. `ReorderBuffer` drops a
  seq more than `REORDER_LEAD_MAX` (512) ahead [choice].
- **Rematch.** When a match is over (both RESULTs, hash divergence, DESYNC, or peer gone) the same sockets may QUEUE_JOIN or use rooms again.
- **Divergence.** A HASH mismatch sends an unsolicited RESULT_ACK `disagreed` (with the matchId) to both slots. A RESULT whose peer is gone,
  or whose peer the sweep declares gone, is answered RESULT_ACK `disagreed` at once instead of waiting for the TTL.
- **Resume.** A HELLO with a valid session takes over a slot that still looks connected and closes the old socket with 1000. The session is
  bound to `RelayCtx.identity` (the host's ticket subject); a different identity gets `resumed 0`. Omit `identity` if the host has none.
- **Queue cap.** `MAX_QUEUE` (2000) [choice]; a join beyond it is ERROR `busy`.

## Behaviour of the RUN-W wire round

The command bitset grew to 17 bits (Run, bit 16), so BATCH inputs are `u32` instead of `u16`: packet size `12 + 4n + 8m`, `MAX_BATCH_FRAME`
305. `PROTOCOL_VERSION` is 2 and the handshake `MAGIC` changed, so an old client or peer is refused cleanly (`version-mismatch`). The conformance
golden frames use 4-byte inputs. The package version stays 0.1.0 (nothing is published yet).

## Behaviour of the v3 wire round (RELAY-V3)

`PROTOCOL_VERSION` goes 2 to 3 and the package goes 0.1.0 to **1.0.0**. Nothing was ever published, so the first release (tag `relay-v1.0.0`) is 1.0.0 with
`PROTOCOL_VERSION` 3. An old client sends HELLO with version 2 as binary and is refused. Four changes:

- **W1. The ERROR frame is the authority; the close code is advisory.** After an ERROR frame the client decides from the frame (code, detail,
  `retryAfterSec`). It uses the close code only as a hint when no frame arrived. `Sender.close(conn, code)` is unchanged, because a host runtime
  may not be able to send a frame and a close together reliably; the code is still `closeCodeFor(error)`.
- **W2. A handshake never answers ticket-invalid (0x0004) or resting (0x000B).** The client treats any failure before WELCOME as "fetch ONE
  fresh ticket and retry once"; a second failure is a failed attempt. (A version mismatch or a resting hint is final at once.) A connecting
  client learns "resting" only from HTTP 503 on /session or /ticket. `RelayCore` therefore does not answer HELLO with ERROR resting: HELLO while
  `ctx.resting` is set closes the socket (advisory 4011) with no frame. The mid-connection resting notice (ERROR 0x000B to a connected client,
  close after the match or `RESTING_CLOSE_MS`) stays. The `ErrorCode` constants all stay defined.
- **W3. /ticket returns `{ticket, url}`.** `url` is the full `wss://` address including the ticket, so a host keeps its routing to itself.
  The client opens it unchanged (no `?ticket=` appended); anything that is not a `wss://` string is a server fault. `VITE_ONLINE_URL` is only the
  HTTP base. /session is unchanged. The 60 s ticket lifetime is a host contract in these docs, not in the response.
- **W4. Frames are base64 text in both directions** (standard alphabet, `=` padding, no line breaks). A binary message is bad-frame with
  advisory close 4001. The package owns the codec (`encodeText`, `decodeText`). `RelayCore.handle(conn, data: string, ctx)` and
  `Sender.send(conn, text: string)` take and give text. Frame layouts and the frame size limits (`MAX_BATCH_FRAME` and the rest) count decoded bytes; a
  text message is `4 * ceil(n / 3)` characters. Conformance: `malformed.text` is now `malformed.binary`, and `wire.text.*` checks golden base64 texts.

Not changed: `RESTING_CLOSE_MS` (60 s) and `DEFAULT_BATCH_EVERY` (1).

**Host contract.** (1) Serve /session and /ticket over HTTPS; answer HTTP 503 (with `retryAfterSec`) while resting. (2) /ticket returns
`{ticket, url}`; a ticket is single use and valid 60 s; `url` is the `wss://` address to open. (3) Pass each WebSocket text message to
`RelayCore.handle` as a string; for a binary message pass the empty string `''` (an empty frame is bad-frame: ERROR plus advisory close 4001) or close the socket yourself with 4001. (4) Implement `Sender.send` as one text message per call. (5) Close codes from `Sender.close` may be passed on as they are.
