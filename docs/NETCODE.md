# Netcode

Groundwork for player-vs-player. No real network code exists yet: the pure protocol lives in `src/core/net/` and is tested over an in-memory link. Read [DETERMINISM.md](DETERMINISM.md) first; everything here relies on it.

## Design

**Lockstep now, rollback next.** The sim is a deterministic 50 Hz function of `(state, [cmd0, cmd1])`, and a `Command` is 4 bytes on the wire (17 bits), so only inputs travel, never state.

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
- Wire format: `src/core/net/packet.ts` (`match u8, flags u8, ack u32, firstTick u32, n u8, n*u32 inputs, m u8, m*(tick u32, hash u32)`), about 20 bytes in steady state.

## Rollback (the online default, `LockstepOptions.rollbackWindow`)

Lockstep hides latency only through input delay. With `rollbackWindow > 0` (the session default is 0 = plain lockstep; the Arena uses 8 (was 6; owner auto-approve 2026-11-26, see below) unless `?ff=lockstep` in a dev/test build) the session predicts a missing remote input (repeats the last remote command), steps ahead, and when the real input differs restores the snapshot of that tick and re-simulates to the present.

- A `SnapshotRing` (depth window + 2) is pushed before every step. `confirmed` is the first tick stepped with a predicted remote input: everything below it is final.
- Prediction runs at most `rollbackWindow` ticks past `confirmed`; beyond that the session stalls (`waiting`) exactly as lockstep does. Remote inputs older than `confirmed` are ignored.
- `reconcile` (start of each update) finds the earliest tick whose real input differs from the one used, `restoreTick`s it and re-steps to the old present. Matching predictions cost nothing.
- Hashes: a checkpoint hash is held back until its tick is confirmed, then recorded and compared. A predicted tick is never hashed, so a wrong guess cannot report a desync. The match end (win or `tickLimit`) is likewise only final once confirmed; the sim does not step past a pending end.
- Events: `UpdateResult.events` surfaces each stable id `(tick, sourceId, kind, seq)` once. Events from predicted steps show immediately; re-simulation re-emits only ids that are new or whose payload changed (a correction), and `UpdateResult.retracted` lists events shown earlier that the corrected timeline no longer produces. A renderer that only wants final events can hold events until their tick is below the confirmed frontier. Per-tick bookkeeping is dropped as ticks confirm.
- Stats: `predictedSteps`, `rollbacks`, `resimTicks`, `maxRollbackDepth`.
- Limits: agents' memory is not rewound (a live bot on a session reads the predicted world; the ring supports an `AgentSnapshot` payload if that is wanted); FramePacer (WP 07) is off under rollback because the frame advantage is then the prediction lead, not a stall signal. Tests: `src/testing/net/rollback.test.ts`.

**Measurement (WP 08, `pnpm sim:net --ticks 3000 --jitter 2 --loss 0.1 --delay 2`, 20 ms per tick, 3000 sim ticks; same final hash both modes).** Wall ticks needed and stalls per side:

| one-way latency | lockstep wall / stalls | rollback 6 wall / stalls / rollbacks / resim ticks / max depth |
| --- | --- | --- |
| 40 ms | 3132 / 132 | 3001 / 0 / 203 / 297 / 5 |
| 80 ms | 4005 / 1005 | 3004 / 3 / 279 / 873 / 6 |
| 120 ms | 5084 / 2084 | 3016 / 15 / 280 / 963 / 6 |

Rollback removes nearly all stalls (lockstep slows to 60-70% speed at 80-120 ms). Resim cost is about 0.3 extra ticks per tick on average at 120 ms (max 6 ticks in one frame), far under the 0.5 ms/tick sim budget. Decision: production defaults to window 6; `?ff=lockstep` (dev/test) turns it off; both modes pass the two-context e2e proofs.

Bookkeeping is bounded: per-tick inputs below `confirmed` (and local inputs below the peer's ack) are dropped in batches, and hash history keeps the last 64 ticks, so a hash older than that is ignored.

## Transport and trust

- Transport: online play runs over one WebSocket per player through a relay ([ONLINE-PROTOCOL.md](ONLINE-PROTOCOL.md)). Input packets are sent redundantly with acks, so loss is repaired without retransmission timers; setup, ready and rematch travel as reliable control messages. Both peers must verify an identical `MatchSetup` and `SIM_VERSION` before tick 0.
- Trust model: peers are equal and mutually distrusting only for crashes, not cheating. Both simulate everything, so a modified client can only send its own legal inputs (reserved bits are masked); hidden information does not exist in this game. Hash checks detect divergence (bugs or tampering) but do not prove who is right; there is no ranked play without a server referee.
- The earlier WebRTC path (data channels, copy-paste codes, STUN/TURN) was retired; its design is kept as history in [WEBRTC-PLAN.md](WEBRTC-PLAN.md).

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
- [x] Rollback with input prediction and event de-duplication (the Arena default, window 6; `?ff=lockstep` opts out)
- [x] Match-setup protocol over a reliable pipe: `src/core/net/handshake.ts` (simVersion, flags, seed, rosters; cheats refused) and `control.ts` (`SetupHandshake`: HELLO, READY, REJECT, never throws on junk)
- [x] Online hero pick exchange, real MatchSetup in the handshake
- [x] Results text and Rematch on the same link (match number in every packet drops the old match's late packets)
- [ ] Lobby
- [ ] Lobby / rematch UI, connection quality indicator, reconnect
- [x] Browser e2e: `tests/e2e/online-quick.spec.ts` plays a quick match through the relay. Dev/test URL switches: `?ff=netbot` (Arcade scripted AI plays the local side), `?ff=lockstep`, `?matchticks=N`, `?netsim=lat:60,jitter:20,loss:10` (seeded one-way delay, jitter, loss on each side's input receive path); probe `__TTE__.net()`
- [ ] Clock sync / frame pacing so both peers run the same wall rate (today each peer stalls to the slower one)
- [ ] Spectators and replay upload (the replay format already fits)

WebSocket-only online play (relay server, message table, sequence numbers, session flow) is specified in [ONLINE-PROTOCOL.md](ONLINE-PROTOCOL.md). The WebRTC path is retired.

An overview of the whole multiplayer design, with diagrams, is in [MULTIPLAYER-DESIGN.md](MULTIPLAYER-DESIGN.md).

### Why the window is 8 (2026-11-26)

Harness, 1000 ticks, batchEvery 3, input delay 2 (measurement, local harness, virtual clock): on the `bad` profile, window 6 gave 1318 stalls and a 21.12 s wall time, window 8 gave 169 stalls and 20.16 s, window 10 gave 12 stalls and 20.12 s. On `typical` the window barely matters (14, 8 and 8 stalls). 8 ticks is 160 ms of prediction (arithmetic, 50 Hz); 10 was not taken because a longer window also lengthens every re-simulation and the visible correction when a guess is wrong.

With window 8 and the relay's input delay of 4 (same harness settings, measurement): `typical` 2 stalls, `bad` 19 stalls, against 8 and 169 at delay 2. Rollbacks stay at about 181 to 185 per 1000 ticks whatever the delay (measurement), so delay does not reduce them; the view-only correction smoother hides them. `online:measure` now defaults to the contract `ROLLBACK_WINDOW` instead of its own 6.
