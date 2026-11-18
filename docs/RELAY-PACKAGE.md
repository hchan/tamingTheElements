# Relay package

`@tamingtheelements/relay` is the transport-agnostic relay core of the online protocol ([ONLINE-PROTOCOL.md](ONLINE-PROTOCOL.md)),
published from this repo so a backend (serverless or a Node process) can host it without importing the game. Metadata lives in
`packages/relay/` (the repo is not a workspace); the sources are `src/core/relay/`, compiled as they are.

## Entrypoints

| Import | Contents |
|---|---|
| `@tamingtheelements/relay` | `RelayCore` (`handle`, `handleClose`, `sweep`), the wire codec (`decodeFrame`, `encodeFrame`, frame types), constants (`PROTOCOL_VERSION`, `FrameType`, `ErrorCode`, `closeCodeFor`, limits and timings), room-code rules, `ReorderBuffer`, and the `Store`, `Sender`, `RelayCtx` interfaces |
| `@tamingtheelements/relay/testing` | `InMemoryStore`, `LoopbackSender` (a conformance suite will join them later) |

The host supplies a `Store` (async get/put/delete/keys; `put` takes `ifVersion: 'absent' | number` for conditional writes and an
optional TTL), a `Sender` (send, close) and a `RelayCtx` per call (`now`, `randomInt`, optional `resting` kill switch). The core
reads no clock or randomness of its own and keeps no state between calls. It relays and compares; it never simulates.

## Semver policy

- A change to the wire format (frame layout, a type byte, an error code's meaning, `PROTOCOL_VERSION`) is a **MAJOR** bump, and
  `PROTOCOL_VERSION` changes with it.
- New optional exports, new `RelayEvent` kinds, or behaviour fixes that keep the wire unchanged are MINOR or PATCH.
- Changing the `Store` or `Sender` interface in a way that breaks an existing implementation is MAJOR.
- `./testing` follows the same rules, but may add helpers in MINOR releases.

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
- `tools/signal-relay/rooms.ts` (WebRTC signalling) imports the room-code rules from `src/core/relay/rooms-rules.ts`: one copy.
