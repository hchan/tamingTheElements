# Relay package

`@tamingtheelements/relay` is the transport-agnostic relay core of the online protocol ([ONLINE-PROTOCOL.md](ONLINE-PROTOCOL.md)),
published from this repo so a backend (serverless or a Node process) can host it without importing the game. Metadata lives in
`packages/relay/` (the repo is not a workspace); the sources are `src/core/relay/`, compiled as they are.

## Entrypoints

| Import | Contents |
|---|---|
| `@tamingtheelements/relay` | `RelayCore` (`handle`, `handleClose`, `sweep`), the wire codec (`decodeFrame`, `encodeFrame`, frame types), constants (`PROTOCOL_VERSION`, `FrameType`, `ErrorCode`, `closeCodeFor`, limits and timings), room-code rules, `ReorderBuffer`, and the `Store`, `Sender`, `RelayCtx` interfaces |
| `@tamingtheelements/relay/testing` | `InMemoryStore`, `LoopbackSender`, `createLoopbackConformance()` (RelayCore wired in process as a conformance target) |
| `@tamingtheelements/relay/conformance` | the wire-spec conformance suite: `runAll` / `runConformance`, `conformanceCases`, `goldenFrames`, adapter and hook types |

The host supplies a `Store` (async get/put/delete/keys; `put` takes `ifVersion: 'absent' | number` for conditional writes and an
optional TTL), a `Sender` (send, close) and a `RelayCtx` per call (`now`, `randomInt`, optional `resting` kill switch, optional `identity`). The core
reads no clock or randomness of its own and keeps no state between calls. It relays and compares; it never simulates.

## Semver policy

- A change to the wire format (frame layout, a type byte, an error code's meaning, `PROTOCOL_VERSION`) is a **MAJOR** bump, and
  `PROTOCOL_VERSION` changes with it.
- New optional exports, new `RelayEvent` kinds, or behaviour fixes that keep the wire unchanged are MINOR or PATCH.
- Changing the `Store` or `Sender` interface in a way that breaks an existing implementation is MAJOR.
- `./testing` follows the same rules, but may add helpers in MINOR releases.
- `./conformance` may add cases in MINOR releases (a new entrypoint or case is MINOR; version 0.1.0 is unpublished, so it stays). A case that only tightens
  a check the spec already demands is a PATCH. A case that encodes a changed wire rule goes with the MAJOR bump.

## Conformance suite

`@tamingtheelements/relay/conformance` checks a deployed or local relay against docs/ONLINE-PROTOCOL.md over real frames. It has no test-runner
dependency: a case is a plain `{ id, spec, title, run(adapter, hooks) }` that throws on failure, and `runAll` returns a report.

```ts
import { runAll } from '@tamingtheelements/relay/conformance';

const adapter = { connect: async () => /* open a WebSocket; return { send(bytes), sendText?(s), onFrame(cb), onClose(cb), close() } */ };
const report = await runAll(adapter, { sleep: (ms) => new Promise((r) => setTimeout(r, ms)), settleMs: 100, timeoutMs: 3000 });
if (!report.ok) throw new Error(report.results.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.message}`).join('\n'));
```

- Hooks (all optional): `sleep` (default only yields; supply a real timer for a remote relay), `setResting(retryAfterSec | null)` flips the kill switch,
  `advanceTime(ms)` moves the relay clock and sweeps (grace expiry, the 60 s resting close), `simVersion` (default 1), `timeoutMs`, `settleMs`.
  Cases that need a missing hook (or `sendText`) report `skip`, not `fail`.
- `runAll(adapter, hooks, { only: ['queue.', 'resting.'] })` filters by id prefix. Case ids are grouped: `wire.golden.*` (no adapter, one byte vector per frame
  type), `hello.*`, `version.*`, `malformed.*`, `queue.*`, `room.*`, `batch.*`, `setup.*`, `pause.*`, `hash.*`, `desync.*`, `result.*`, `resume.*`, `resting.*`.
- Every server frame is also checked to decode and re-encode to the same bytes.
- Cases never assume a clean relay, but each uses fresh connections and leaves nothing queued (disconnects on exit).
- Vitest wrapper in this repo: `src/core/relay/conformance.test.ts`, against `createLoopbackConformance()` (see it for how to glue sockets).

## Commands

```sh
corepack pnpm exec vitest run --project core src/core/relay --coverage.enabled=false   # unit tests
corepack pnpm exec vitest run --project repo tests/repo/relay-package.test.ts          # package guards
node tools/relay-package/build.mjs                                                     # tsc to packages/relay/dist (ESM + .d.ts, gitignored)
cd packages/relay && corepack pnpm pack --pack-destination ../../.scratch              # tarball
```

The build rewrites relative specifiers to `.js` after `tsc` (the repo's sources are extensionless for the bundler). The package
has no dependencies.

## Notes

- `src/core/relay` is exempt from the "no async/await" lint rule only (`eslint.config.js`); every determinism ban stays on, and
  `tests/repo/relay-package.test.ts` fails if the rest of `src/core` imports it.
- `src/core/relay/rooms-rules.ts` is the package's own copy of the room-code rules. The WebRTC signalling relay (`tools/signal-relay/rooms.ts`) keeps its own and does not import the package; `tests/repo/room-code-rules-drift.test.ts` fails if they differ.

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
