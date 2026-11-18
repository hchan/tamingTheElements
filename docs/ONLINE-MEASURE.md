# Online measurement harness (WP-ONLINE-4c)

`pnpm online:measure` plays one full match between two `LockstepSession`s over `WebSocketTransport`, through the real `RelayCore` (`InMemoryStore`, `LoopbackSender`) on a
virtual clock (1 ms steps, a 50 Hz update every 20 ms). Nothing touches a real network, a real clock or a hostname. Code: `src/testing/net/online-measure.ts`, CLI
`tools/online-measure.ts` (run through `tsx --tsconfig tsconfig.app.json` so the `@core` alias resolves), tests `src/testing/net/online-measure.test.ts` and `batch-every.test.ts`.

## Reading the numbers

Every figure the harness prints is labelled **measurement (local harness, virtual clock)**. It measures the protocol's own cost (frames, bytes, rollbacks, stalls) under a
*modelled* link. It does **not** measure a serverless backend. The two figures in [ONLINE-PROTOCOL.md](ONLINE-PROTOCOL.md) section 9 stay **estimates** and are printed
next to the measurements as such: "about 67 billed msgs/s per match" and "90-120 ms one-way on serverless".

- **One-way latency** (p50, p95, max, ms): virtual time from a client's `send` of a BATCH to its first delivery at the other client's socket, per BATCH seq (duplicates
  ignored). It is the modelled link (see below), not a server cost; with 100 ms and 20 ms jitter it reads 100..120 ms.
- **Messages per second**: client-to-relay frames the relay handled plus relay-to-client frames it sent, over the sim seconds of the match. This is the billing unit of the
  estimate (1 in + 1 out). It includes PING/PONG (every 2 s), the HASH checkpoints (every 50 ticks, both sides) and the final RESULT exchange. Relay duplicates created by the
  modelled link are not counted twice on the way down (the sender did not send them).
- **Bytes per second**: the same frames, whole encoded size.
- **Rollbacks, stalls**: summed over both sessions (`SessionStats`). **Final hashes**: both worlds' `hash(state)`; also compared with an offline no-network run and with the
  relay's own agreement on the RESULT frames.

## Link profile

`LinkProfile`: one-way client-to-client `latencyMs` split over the two legs (client to relay, relay to client), `jitterMs` (random 0..jitter, so frames reorder), `dupPct`,
`reorderPct` (extra 40 ms hold on the way down), `lossPct` (keep 0 for a WebSocket, which is reliable; useful only to stress the reorder buffer). Presets: `ideal`
(all 0), `typical` (100 ms, 20 ms jitter), `bad` (120 ms, 60 ms jitter, 2% dup, 5% reorder). Seeded (`--seed`): the same run gives the same report. HELLO and the queue
(before MATCH_START) are not impaired and not counted.

## Usage

```
pnpm online:measure [--ticks 3000] [--batch-every 1] [--profile ideal|typical|bad] [--latency ms] [--jitter ms] [--dup pct] [--reorder pct] [--loss pct]
                    [--delay 2] [--rollback 6] [--seed 11] [--json]
```

Text table by default, the full report as JSON with `--json`. Exit code 0 when the final hashes are equal, 1 when not, 2 on a usage error.

## `batchEvery`

`LockstepOptions.batchEvery` (default 1, so nothing changes today) makes the session send a packet every N updates. Each packet still carries all unacked inputs, so
nothing is lost, only delayed by up to N-1 updates. `setHidden`, `forfeit` and the update that ends the match or the link send at once. The relay's MATCH_START carries
`batchEvery`; the harness passes the value to `RelayCore` and to both sessions. Game code does not use it yet.

## Sample (3000 ticks, `typical` profile, rollback window 6, input delay 2; all measurement, local harness, virtual clock)

| batchEvery | msgs/s per match | bytes/s | one-way ms p50 / p95 / max | rollbacks | stalls | hashes equal |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 204.1 | 14399 | 110 / 117 / 120 | 602 | 6 | yes |
| 2 | 104.0 | 7183 | 110 / 117 / 120 | 580 | 126 | yes |
| 3 | 70.6 | 4792 | 110 / 118 / 120 | 557 | 250 | yes |

`batchEvery 3` lands at 70.6 msgs/s against the estimate of about 67: the estimate counts only BATCH frames (2 x 16.7 x 2); PING/PONG, HASH and RESULT add about 3.6
msgs/s. Stalls rise with `batchEvery` because the input arrives up to 2 updates later on top of 100 ms of link; the stall rate at 3 (250 of 6000 updates, about 4%) is
near the "poor" threshold in `link-quality.ts`, which supports open question 2 in the protocol spec (input delay floor).
