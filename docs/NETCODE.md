# Netcode

Groundwork for player-vs-player. No real network code exists yet: the pure protocol lives in `src/core/net/` and is tested over an in-memory link. Read [DETERMINISM.md](DETERMINISM.md) first; everything here relies on it.

## Design

**Lockstep now, rollback next.** The sim is a deterministic 50 Hz function of `(state, [cmd0, cmd1])`, and a `Command` is 2 bytes, so only inputs travel, never state.

- `Transport` (`src/core/net/transport.ts`): `send(bytes)` / `receive()`. Contract is an unreliable, unordered datagram pipe (loss, duplication, reordering, delay all allowed).
- `LockstepSession` (`src/core/net/session.ts`): the host calls `update(localCommand)` once per wall tick.
  1. Local command is stamped for tick `simTick + inputDelay` (2, raised one step at a time to at most 4 when stalls pile up; never lowered).
  2. Every packet carries all inputs the peer has not acked (up to 64), the next tick we still need from the peer (`ack`), and the last 4 state hashes. Loss is therefore repaired by the next packet, with no retransmit timers.
  3. The world steps only when both inputs for the current tick exist. Otherwise `update` reports `waiting` and the sim does not move.
  4. A state hash is recorded every `hashInterval` ticks (50) and at match end. A mismatch sets `desync` to the first divergent checkpoint tick and stops stepping.
  5. Remote input is untrusted: bad packets are dropped, reserved command bits are masked, ticks far ahead are ignored.
- Time is counted in `update` calls, never read from a clock. `timeoutTicks` (250 = 5 s) without any packet forfeits the peer (`forfeitReason: 'timeout'`, we win); `forfeit()` concedes explicitly.
- **Hidden-tab policy.** On `visibilitychange` the host calls `setHidden(true)`, which sends a packet with the `paused` flag at once, then stops updating (browsers throttle hidden timers). The peer shows `remote-paused` and uses `pauseTimeoutTicks` (1500 = 30 s) instead. On return the host calls `setHidden(false)` and keeps updating; the buffered inputs let both catch up. After the grace period the peer forfeits the hidden player.
- Bots/agents may run on a peer's own copy of the shared world: `SimState` is mutated only by `step`, and an agent keeps its random stream (`AgentRng`, `seedSfc32(seed, 'ai.p1' | 'ai.p2')`) and memory to itself, so consulting it never changes the hash. Only the commands it returns travel. `src/testing/net/lockstep.test.ts` plays a live bot on one peer and checks every checkpoint.
- Wire format: `src/core/net/packet.ts` (`match u8, flags u8, ack u32, firstTick u32, n u8, n*u16 inputs, m u8, m*(tick u32, hash u32)`), about 20 bytes in steady state.

## Rollback (opt-in, `LockstepOptions.rollbackWindow`)

Lockstep hides latency only through input delay. With `rollbackWindow > 0` (default 0 = plain lockstep) the session predicts a missing remote input (repeats the last remote command), steps ahead, and when the real input differs restores the snapshot of that tick and re-simulates to the present.

- A `SnapshotRing` (depth window + 2) is pushed before every step. `confirmed` is the first tick stepped with a predicted remote input: everything below it is final.
- Prediction runs at most `rollbackWindow` ticks past `confirmed`; beyond that the session stalls (`waiting`) exactly as lockstep does. Remote inputs older than `confirmed` are ignored.
- `reconcile` (start of each update) finds the earliest tick whose real input differs from the one used, `restoreTick`s it and re-steps to the old present. Matching predictions cost nothing.
- Hashes: a checkpoint hash is held back until its tick is confirmed, then recorded and compared. A predicted tick is never hashed, so a wrong guess cannot report a desync. The match end (win or `tickLimit`) is likewise only final once confirmed; the sim does not step past a pending end.
- Events: `UpdateResult.events` surfaces each stable id `(tick, sourceId, kind, seq)` once. Events from predicted steps show immediately; re-simulation re-emits only ids that are new or whose payload changed (a correction), and `UpdateResult.retracted` lists events shown earlier that the corrected timeline no longer produces. A renderer that only wants final events can hold events until their tick is below the confirmed frontier. Per-tick bookkeeping is dropped as ticks confirm.
- Stats: `predictedSteps`, `rollbacks`, `resimTicks`, `maxRollbackDepth`.
- Limits: agents' memory is not rewound (a live bot on a session reads the predicted world; the ring supports an `AgentSnapshot` payload if that is wanted); the Arena (`ArenaLaunch.net`) does not enable it yet. Tests: `src/testing/net/rollback.test.ts`.

Bookkeeping is bounded: per-tick inputs below `confirmed` (and local inputs below the peer's ack) are dropped in batches, and hash history keeps the last 64 ticks, so a hash older than that is ignored.

## WebRTC plan

- Input channel: `pc.createDataChannel('input', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 })`. Unordered and unreliable on purpose: stale inputs are useless and the redundancy above replaces retransmission.
- Control channel: a second, reliable and ordered channel (`negotiated: true, id: 1`) for setup only: match setup (seed, rosters, `simVersion`, flags), ready, rematch, chat. Both peers must verify an identical `MatchSetup` and `SIM_VERSION` before tick 0.
- Signalling: manual copy-paste of SDP offer/answer is enough for a first playtest; later a tiny serverless relay (for example a Cloudflare Worker or a WebSocket room keyed by short code). Signalling never carries gameplay.
- NAT: public STUN to start; a TURN relay (self-hosted coturn or a managed service) is needed for symmetric NATs and costs bandwidth, so it is a later, optional item.
- Trust model: peers are equal and mutually distrusting only for crashes, not cheating. Both simulate everything, so a modified client can only send its own legal inputs (reserved bits are masked); hidden information does not exist in this game. Hash checks detect divergence (bugs or tampering) but do not prove who is right; there is no ranked play without a server referee. `war/WEB-INF/user.properties` is unrelated and must not be touched by this work.

## Readiness checklist

- [x] Deterministic sim, no wall clock, seeded RNG, state hash (DETERMINISM.md)
- [x] Snapshot / restore and snapshot ring
- [x] Inputs are a 2-byte `Command` per player per tick
- [x] `Transport` interface with unreliable, unordered semantics
- [x] Input delay 2, adaptive to 4
- [x] Redundant inputs with acks, loss repaired without timers
- [x] Stall (`waiting`) instead of stepping on missing input
- [x] Periodic state hash exchange and desync report with first divergent tick
- [x] Timeout forfeit, explicit forfeit, hidden-tab pause message (tick-counted clock)
- [x] Seeded in-memory `FakeTransport` (latency, jitter, loss, duplication, reordering)
- [x] Two-session bot-vs-bot tests at 0, 10, 30 percent loss, property test over network conditions
- [x] Headless `pnpm sim:net`
- [x] Session snapshot hook for rollback
- [x] Rollback with input prediction and event de-duplication (opt-in `rollbackWindow`; not yet used by the Arena)
- [x] Match-setup protocol over a reliable pipe: `src/core/net/handshake.ts` (simVersion, flags, seed, rosters; cheats refused) and `control.ts` (`SetupHandshake`: HELLO, READY, REJECT, never throws on junk)
- [x] `RTCDataChannel` adapters `inputTransport` (id 0) and `controlPipe` (id 1) in `src/game/net/rtc-channels.ts` (binary only, capped inbox, send never throws; unit-tested with a fake channel)
- [x] Creating the `RTCPeerConnection` and its two negotiated channels
- [x] Manual copy-paste signalling screen (`#online`, shown with the Arcade preview; connects, runs the setup handshake, then plays a fixed Arcade 1v1 in lockstep: host is side 0, joiner side 1; `ArenaLaunch.net` makes the Arena step through a `LockstepSession`, no pause, hidden tab via `setHidden`)
- [x] Online hero pick exchange, real MatchSetup in the handshake
- [x] Results text and Rematch on the same link (match number in every packet drops the old match's late packets)
- [ ] Lobby, relay room codes
- [ ] Relay signalling (short room codes) and TURN
- [ ] Lobby / rematch UI, connection quality indicator, reconnect
- [ ] Browser e2e with two pages
- [ ] Clock sync / frame pacing so both peers run the same wall rate (today each peer stalls to the slower one)
- [ ] Spectators and replay upload (the replay format already fits)
