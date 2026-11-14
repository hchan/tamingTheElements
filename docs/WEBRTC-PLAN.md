# WebRTC online play: plan

Owner request (2026-11-13): real 2-player online play over WebRTC, as its own effort. This file is the audit and the ordered
work packages (WPs). Protocol background: [NETCODE.md](NETCODE.md); rules every WP keeps: [DETERMINISM.md](DETERMINISM.md).
Each WP is also an idea file `ideas/brainstorm/webrtc-NN-*.md` (moved to `done/` when merged).

## Audit (what exists on 2026-11-13)

| Piece | Where | State |
|---|---|---|
| Wire packet, `Transport`, `LockstepSession` (input delay 2 adaptive to 4, redundant acked inputs, stall, hash every 50 ticks, desync stop, timeout/hidden-tab forfeit, match number) | `src/core/net/` | Done, unit and property tested over `FakeNetwork` (`src/testing/net/`) |
| Rollback (prediction, restore, resim, event de-dup) | `src/core/net/session.ts` `rollbackWindow` | Done, opt-in; Arena turns it on only with `?ff=rollback` (dev/test) |
| Setup handshake (simVersion, flags, seed, rosters, cheats refused) | `src/core/net/handshake.ts`, `control.ts` | Done |
| `RTCPeerConnection` + negotiated channels (`input` id 0 unordered/unreliable, `control` id 1 reliable) | `src/game/net/peer.ts`, `rtc-channels.ts` | Done; one Google STUN server; non-trickle (waits for ICE gathering, 4 s cap) |
| Signalling codes | `peer.ts` `encodeSignal` | Base64 JSON of the whole SDP: about 1-3 KB, hard to send from a phone, no QR, no link |
| `#online` screen (host/join, hero pick swap, handshake, lockstep match, results, Rematch, linger after end) | `src/game/app/online-versus.ts`, `online-pick.ts` | Works on desktop; plain textareas, no Copy/Paste/Share buttons, no touch controls in the match |
| e2e | `tests/e2e/online-versus.spec.ts` (two pages, ONE context, Google STUN), `webrtc-peer.spec.ts` (one page) | Proves connect and >150 ticks with no desync; does not play a match to its natural end, does not compare hash lists, never two contexts |

### Missing for a real peer-to-peer match

1. **Proof**: two separate browser contexts playing a whole match to its natural end, both seeing the same result and the same
   checkpoint hashes (today only "no desync message" after 150 ticks). Needs a scripted local agent per page and a hash probe.
2. **Hermetic ICE**: tests depend on reaching `stun.l.google.com`; no `?ice=none` loopback mode.
3. **Signalling UX**: codes are kilobytes; no Copy/Paste/Share buttons, no join link, no QR. Optional free relay (room codes) absent.
4. **ICE config**: one STUN server, no user TURN option, no "strict network" diagnosis, a fixed 4 s gather wait.
5. **Disconnect**: a dropped link mid-match is only noticed by the 5 s input timeout; no Leave button, no "friend left" message, no
   handling of a Rematch the friend never answers.
6. **Frame pacing**: each peer stalls to the slower one; the faster one oscillates (stall, catch up). No frame-advantage slow-down.
7. **Lockstep or rollback**: rollback exists but is off in production; no measurement to decide the default.
8. **Mobile**: no touch buttons in online matches; the screen is not laid out for phones.
9. **Desync diagnosis**: a desync just stops the match; nothing to download for a bug report.
10. **Quality indicator**: no RTT/stall readout.

## Decisions

- **Lockstep stays the default until WP 08 measures rollback** in a two-context e2e with added latency. Rollback is already built;
  the question is only whether its re-simulation cost under SwiftShader/phones is acceptable. Both modes must pass the proof test.
- **Signalling without a paid server**: compact codes (SDP reduced to ufrag, pwd, fingerprint, candidates: about 100-200
  characters) shared by Copy, Share (Web Share API), a join link (`?join=<code>#online`) and a QR code of that link. The optional
  relay (WP 10) is a tiny WebSocket room server whose source lives in `tools/signal-relay/`; the client uses it only when a build
  sets `VITE_SIGNAL_URL`; deploying it (for example a free Cloudflare Worker) is the owner's step.
- **STUN**: Google and Cloudflare public STUN. TURN only if the player enters their own server in Settings (no shared credentials).
- **Nothing in `src/core/sim` changes.** Core-touching WPs (01, 07) only add read-only accessors or pacing hints to
  `src/core/net/session.ts`; they never change `step`, hashes or goldens. Only one core-touching WP runs at a time.
- Shared files (`docs/REPO-MAP.md`, `src/core/index.ts`, `tools/ci/size-budget.json`) are edited only by the coordinator in the
  final commit (WP 12). WPs avoid new `@core/index` exports (methods on exported classes are fine).
- Player words: never Classic, Arcade, ruleset or Capture on screen.

## Work packages (in order)

Conventions for every WP: headless browsers only; scratch in `~/claudetmp/`; gate `lint typecheck depcruise test test:legacy
build` plus the WP's e2e with its own `E2E_PORT` (7900-7999); `size:check` overages are reported, not fixed (the coordinator raises
budgets in WP 12). "Core" = touches `src/core`.

| WP | Title | Core | Can pair with |
|---|---|---|---|
| 01 | Two-context proof harness | yes (read-only accessor) | 02 |
| 02 | Compact signalling codes | no | 01 |
| 03 | Share, copy, paste, join link, QR | no | 04 |
| 04 | ICE config and connection-lost signal | no | 03 |
| 05 | Leave, friend-left, rematch timeout | no | 07 |
| 06 | Mobile: touch controls and layout | no | 08 |
| 07 | Frame-advantage pacing | yes | 05 |
| 08 | Rollback default decision | no (Arena/flags) | 06 |
| 09 | Connection quality readout and desync report | no | 10 |
| 10 | Optional relay signalling (room codes) | no | 09 |
| 11 | Soak: loss/latency injection in the browser proof | no | - |
| 12 | Coordinator: docs, REPO-MAP, budgets, ideas | no | - |

### WP 01: Two-context proof harness

Goal: an e2e that plays a full online match in two separate browser contexts over loopback WebRTC and proves both pages end with
the same winner and identical checkpoint hash lists, in lockstep and with `?ff=rollback`.

- `src/core/net/session.ts`: read-only `checkpoints(): readonly [tick, hash][]` (confirmed local checkpoint hashes, bounded like
  the hash history but kept in full for tests up to a cap, for example 4096 entries). No behaviour change; unit test.
- `src/game/platform/flags.ts`: `netbot` flag (`?ff=netbot`, dev/test only).
- `src/game/scenes/launch.ts`, `src/game/scenes/Arena.ts`: optional `net.agent` overrides the keyboard for the local side (an agent
  on a peer's own copy never changes the hash, NETCODE.md). The Arena exposes its session to the test hook.
- `src/game/platform/test-hook.ts`: `net()` probe: `{ side, status, simTick, desync, checkpoints, stats } | undefined`.
- `src/game/app/online-versus.ts`: with `?ff=netbot`, pass the Arcade scripted AI for the local side (see `arcadeEnemy` in
  `arcade-setup.ts`); with `?ice=none` (dev/test only) call `hostPeer([])` / `joinPeer(code, [])` (loopback host candidates,
  no internet).
- `tests/e2e/online-match.spec.ts` (new): two `browser.newContext()`s, connect through the real screen, both Ready, play to the
  natural match end (bots fight; bound by sim-progress stall detection, not wall time), assert same winner text, hashes equal on
  every common checkpoint tick (at least 10 checkpoints), no desync; once plain, once `arcade,rollback`. If mDNS host candidates
  do not resolve across contexts, use `--disable-features=WebRtcHideLocalIpsWithMdns` for this spec only.
- Switch `online-versus.spec.ts` to `?ice=none`.
- Acceptance: the new spec passes 3 runs in a row; unit tests for `checkpoints()` and the flag.

### WP 02: Compact signalling codes

Goal: codes short enough to paste into a chat or a QR code.

- `src/game/net/sdp-codec.ts` (new): `packSdp(sdp, type) -> string` and `unpackSdp(code) -> RTCSessionDescriptionInit`. Keep only
  ice-ufrag, ice-pwd, the sha-256 fingerprint (32 bytes), setup role, and candidates (host/srflx/relay: ip v4/v6, port, type,
  protocol udp), binary-packed then base64url, prefix `T1.`; rebuild a minimal valid data-channel SDP (`m=application ... webrtc-datachannel`,
  `a=mid:0`, `a=sctp-port:5000`, `a=max-message-size`). mDNS `.local` host names are kept as strings.
- `src/game/net/peer.ts`: `encodeSignal` emits the compact code; `decodeSignal` accepts the compact code and the old base64-JSON
  code; all errors stay plain words.
- Tests: `sdp-codec.test.ts` with recorded Chrome, Firefox and Safari SDP samples (round trip keeps every field the codec
  promises; junk, oversize and wrong-type codes throw words). `webrtc-peer.spec.ts`: the link opens with compact codes and the
  offer code is under 300 characters with `iceServers: []`.

### WP 03: Share, copy, paste, join link, QR

Goal: a phone player can join without typing.

- `src/game/app/online-share.ts` (new, DOM helpers): Copy (`navigator.clipboard.writeText`, fallback select-all), Paste
  (`clipboard.readText` when allowed), Share (`navigator.share` when present), and a QR code of the join link.
- QR encoder: `src/game/net/qr.ts`, a small byte-mode QR encoder (own code, error level L/M, versions up to 10) rendered to a canvas
  or SVG; unit-tested by decoding known vectors (or add the MIT `qrcode-generator` package if a hand encoder grows past ~300 LOC:
  +deps, name it in the commit).
- Join link: `<origin><path>?join=<code>#online`; on load, `#online` with `join` fills the friend's code and starts Join at once;
  the param is removed from the address bar after reading (history.replaceState).
- `src/game/app/online-versus.ts`: step-numbered Host/Join layout (1 send code, 2 paste answer, 3 Connect), the buttons above,
  focus order and words for screen readers.
- Tests: DOM tests for the buttons (clipboard mocked), QR unit tests, an e2e where the joiner opens the host's link (no paste on
  the joiner side) and the match connects.

### WP 04: ICE config and connection-lost signal

- `src/game/net/ice.ts` (new): default STUN list (Google, Cloudflare); `iceFromSettings(turn?)` adds a user TURN server.
- `src/game/net/peer.ts`: gathering resolves early once a srflx candidate arrived and 1 s passed, or at completion, max 4 s;
  `Peer.onState(cb)` reports `connected | disconnected | failed | closed` after open; a failure before open says whether no
  srflx candidate was gathered (strict network) in words.
- Settings: an optional "Relay server (TURN)" URL, user name and password row (`src/ui/screens/settings.ts` and its save field, see
  docs/SAVE-FORMAT.md; never logged).
- Tests: unit tests with a fake `RTCPeerConnection`; settings DOM test; save-format test for the new optional field.

### WP 05: Leave, friend-left, rematch timeout

- `src/game/net/control-mux.ts` (new): routes control-channel messages by type byte after the handshake (`BYE`, `PING`/`PONG`
  for WP 09, `REMATCH`), so the setup handshake and the pick message keep working.
- `src/game/app/online-versus.ts`: a Leave button during the match (session `forfeit()`, send `BYE`, close); the friend sees
  "Your friend left, you win" at once instead of the 5 s timeout; `Peer.onState` failed/closed mid-match shows words and a Back
  link; Rematch waits at most 60 s for the friend's pick, then says so; navigating away sends `BYE`.
- Tests: DOM tests with a fake peer; e2e: one context closes its page mid-match, the other shows the friend-left words within 3 s.

### WP 06: Mobile

- `src/game/app/online-versus.ts`: mount the shared touch buttons (`touch-controls.ts`, as `arcade-versus.ts` does) for the local
  side in online matches on touch devices.
- CSS: the online screen fits 360 px wide (full-width code boxes, 44 px targets).
- Tests: e2e with one context `{ hasTouch: true, isMobile: true, viewport: 390x844 }`: touch buttons visible during an online
  match, a tap changes our side's command; `a11y`/responsive spec still green.

### WP 07: Frame-advantage pacing (core-touching, alone)

- `src/core/net/session.ts`: track the newest remote tick seen; `frameAdvantage()` = our sim tick minus the peer's, smoothed over
  a window, as an integer. No change to stepping, inputs or hashes.
- `src/game/scenes/Arena.ts` (online driver only): when the advantage stays above 1 tick, skip one update in every N frames
  (GGPO-style), never below 0; stats count skipped frames.
- Tests: `src/testing/net/pacing.test.ts` on `FakeNetwork` with asymmetric update rates: fewer stalls with pacing than without,
  same hashes. The WP 01 proof still passes.

### WP 08: Rollback default decision

- Measure in Node (`pnpm sim:net` with latency 40/80/120 ms, jitter, loss) and in the WP 01 e2e: stalls per minute, resim ticks,
  ms per frame of resim in SwiftShader. Write the numbers into NETCODE.md.
- If acceptable: production uses `rollbackWindow` 6 (or the measured best), `?ff=lockstep` (dev/test) turns it off; else keep
  lockstep and record why. `src/game/platform/flags.ts`, `src/game/scenes/Arena.ts`.
- Tests: flags unit test; WP 01 proof in both modes.

### WP 09: Connection quality readout and desync report

- Ping/pong over the control mux (wall clock is fine outside core): RTT; with session stats (stalls, input delay, rollbacks) a small
  "Link: good/fair/poor, 48 ms" line under the HUD in online matches (words, not colour alone).
- On desync: a "Save report" button downloading JSON `{ setup, side, commands (replay format), localCheckpoints, desync }` that
  `pnpm replay` can re-run.
- Tests: unit tests for the quality words; DOM test for the report; e2e asserts the readout appears.

### WP 10: Optional relay signalling (room codes)

- `tools/signal-relay/` (new): a tiny WebSocket room relay (Node script for local/e2e, and a Cloudflare Worker variant with
  a README for the owner to deploy; no secrets in the repo). Rooms: 6-character codes, two members, 10 minute expiry, only SDP
  codes relayed, size-capped.
- `src/game/net/relay.ts` (new): client; `#online` shows "Host with a room code" / "Join with a room code" only when the build
  has `VITE_SIGNAL_URL` (dev/test may set it with `?signal=ws://...`).
- Tests: relay unit tests; e2e starts the local relay and connects two contexts with a room code only.

### WP 11: Soak: loss and latency in the browser proof

- A dev/test-only `?netsim=lat:60,jitter:20,loss:10` wrapper around the input `Transport` (seeded, in `src/game/net/`), and the
  WP 01 proof run once under it in both modes. `pnpm e2e:flake --repeat 3` on the online specs.

### WP 12: Coordinator wrap-up

- `docs/NETCODE.md` readiness checklist ticked, `docs/REPO-MAP.md` entries for new files, `tools/ci/size-budget.json` raised with
  reasons, ideas moved to `done/`, `docs/TESTING.md` lists the new specs.
