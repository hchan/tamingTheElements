import { describe, expect, it } from 'vitest';
import {
  characterId,
  createMatch,
  DEFAULT_SIM_FLAGS,
  encodePacket,
  hash,
  helloOf,
  LockstepSession,
  SetupHandshake,
  type MatchSetup,
  type Transport,
} from '@core/index';
import { CALM_RELAY, FakeRelay, type RelayConditions } from './fake-relay';
import { botScripts, referenceHash } from './net-match';
import { medianRtt } from '../../game/net/link-quality';
import { NetsimTransport, type NetsimConfig } from '../../game/net/netsim';
import { WebSocketTransport } from '../../game/net/ws/transport';
import { encodeText } from '../../game/net/ws/text-codec';
import { decodeFrame, encodeFrame } from '../../game/net/ws/wire';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
const LIMIT = 500;
const SCRIPT = botScripts(SETUP, LIMIT + 200);
const TICK_MS = 20;

interface Run {
  readonly cond?: RelayConditions;
  readonly netsim?: NetsimConfig;
  readonly stall?: { readonly atMs: number; readonly forMs: number };
}

/** Two sessions (rollback window 6) over WebSocketTransports and a FakeRelay on a virtual 50 Hz clock. */
function play(o: Run) {
  const clock = { ms: 0 };
  const relay = new FakeRelay(clock, 11, o.cond ?? CALM_RELAY);
  const ws = [new WebSocketTransport(relay.a, () => clock.ms), new WebSocketTransport(relay.b, () => clock.ms)] as const;
  const tr = (i: 0 | 1): Transport => (o.netsim ? new NetsimTransport(ws[i], o.netsim, () => clock.ms) : ws[i]);
  const worlds = [createMatch(SETUP), createMatch(SETUP)] as const;
  const sessions = [0, 1].map(
    (i) =>
      new LockstepSession({ world: worlds[i as 0 | 1], side: i as 0 | 1, transport: tr(i as 0 | 1), tickLimit: LIMIT, adaptive: false, rollbackWindow: 6 }),
  ) as [LockstepSession, LockstepSession];
  let wall = 0;
  while (wall < LIMIT * 20 && !sessions.every((s) => s.status === 'ended')) {
    wall++;
    clock.ms += TICK_MS;
    if (o.stall && clock.ms === o.stall.atMs) relay.stall(relay.b, o.stall.atMs + o.stall.forMs);
    relay.advance();
    for (const s of sessions) s.update(SCRIPT[s.side][s.nextStampTick] ?? 0);
  }
  return { sessions, worlds, ws, relay, wall };
}

function expectAgree(r: ReturnType<typeof play>): void {
  expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
  expect(r.sessions[0].desync).toBeUndefined();
  expect(r.sessions[1].desync).toBeUndefined();
  expect(hash(r.worlds[0].state)).toBe(hash(r.worlds[1].state));
  expect(hash(r.worlds[0].state)).toBe(referenceHash(SETUP, SCRIPT, LIMIT, 2));
}

describe('WebSocketTransport with two lockstep sessions (rollback window 6; ms figures are test estimates)', () => {
  it('agrees on a calm relay', () => {
    expectAgree(play({}));
  });

  it('agrees with 80 ms latency, 60 ms jitter (reordering) and 15% duplicates', () => {
    const r = play({ cond: { latencyMs: 80, jitterMs: 60, duplicate: 0.15 } });
    expectAgree(r);
    expect(r.sessions[0].stats.rollbacks + r.sessions[1].stats.rollbacks).toBeGreaterThan(0);
  });

  it('agrees when NetsimTransport adds latency, jitter and duplicates on top', () => {
    expectAgree(play({ cond: { latencyMs: 40, jitterMs: 20, duplicate: 0.1 }, netsim: { lat: 30, jitter: 40, loss: 0, dup: 10, seed: 3 } }));
  });

  it('survives a TCP-style stall followed by a burst (300 ms, estimate)', () => {
    const r = play({ cond: { latencyMs: 40, jitterMs: 0, duplicate: 0 }, stall: { atMs: 2000, forMs: 300 } });
    expectAgree(r);
    // The stalled side waited or rolled back: it was not frozen, and the match ended.
    expect(r.sessions[1].stats.stalls + r.sessions[1].stats.rollbacks).toBeGreaterThan(0);
  });

  it('survives a stall longer than the rollback window (1.5 s, estimate)', () => {
    expectAgree(play({ cond: { latencyMs: 40, jitterMs: 0, duplicate: 0 }, stall: { atMs: 2000, forMs: 1500 } }));
  });
});

describe('WebSocketTransport unit behaviour', () => {
  const mk = () => {
    const clock = { ms: 0 };
    const relay = new FakeRelay(clock, 1);
    return { clock, relay, a: new WebSocketTransport(relay.a, () => clock.ms), b: new WebSocketTransport(relay.b, () => clock.ms) };
  };
  const pkt = (firstTick: number, match = 0) => encodePacket({ match, flags: 0, ack: 0, firstTick, inputs: [1], hashes: [] });

  it('numbers BATCH frames (sent as base64 text)', () => {
    const { relay, a } = mk();
    a.send(pkt(0));
    a.send(pkt(1));
    expect(relay.a.sent.map((m) => (decodeFrame(m) as { seq: number }).seq)).toEqual([0, 1]);
  });

  it('endMatch drops late BATCH and PAUSE until the next startMatch', () => {
    const { relay, a } = mk();
    a.startMatch(1, false);
    a.endMatch();
    a.send(pkt(0));
    a.sendPause(1, 1);
    expect(relay.a.sent).toEqual([]);
    a.startMatch(2, false);
    a.send(pkt(0));
    expect(relay.a.sent).toHaveLength(1);
  });

  it('drops oversize packets, closed-socket sends and non-binary or malformed messages without throwing', () => {
    const { relay, a, b } = mk();
    a.send(new Uint8Array(500));
    expect(relay.a.sent).toHaveLength(0);
    relay.b.deliver('not base64!');
    relay.b.deliver(new Uint8Array([0x40]).buffer); // binary: bad in wire v3
    relay.b.deliver(encodeText(new Uint8Array([0x40]))); // base64 of a truncated frame
    expect(b.malformed).toBe(3);
    relay.a.close();
    expect(a.closed).toBe(true);
    expect(() => { a.send(pkt(0)); }).not.toThrow();
    relay.b.readyState = 1;
    relay.b.send = () => { throw new Error('boom'); };
    expect(() => { b.send(pkt(0)); }).not.toThrow();
  });

  it('numbers only BATCH and PAUSE: HASH, DESYNC and RESULT carry seq 0 and leave no gap', () => {
    const { relay, clock, a, b } = mk();
    a.send(pkt(0));
    a.sendHash(0, 50, 1);
    a.send(pkt(1));
    a.sendDesync(0, 50, 1, 2);
    a.sendPause(0, 1);
    a.sendResult(0, 1, 0, 100, 5);
    a.send(pkt(2));
    const seqs = relay.a.sent.map((m) => decodeFrame(m)).map((f) => [f?.t, (f as { seq?: number }).seq]);
    expect(seqs).toEqual([['batch', 0], ['hash', 0], ['batch', 1], ['desync', 0], ['pause', 2], ['result', 0], ['batch', 3]]);
    relay.advance();
    expect(b.receive()).toBeDefined();
    expect(b.receive()).toBeDefined();
    expect(b.receive()).toBeDefined(); // The batches arrive without waiting 40 ms for a missing number.
    expect(b.peerPause).toEqual({ matchId: 0, flags: 1 });
    clock.ms = 0;
    expect(b.receive()).toBeUndefined();
  });

  it('startMatch: a new match resets seq, reorder and control; a resume keeps them; other matchIds are dropped', () => {
    const { relay, a, b } = mk();
    a.startMatch(1, false);
    b.startMatch(1, false);
    a.send(pkt(0, 1));
    a.send(pkt(1, 1));
    a.control.send(Uint8Array.of(1));
    relay.advance();
    expect([b.receive(), b.receive()].every((p) => p !== undefined)).toBe(true);
    // Resume: nothing resets.
    a.startMatch(1, true);
    a.send(pkt(2, 1));
    expect(relay.a.sent.filter((m) => m[0] === 0x40).map((m) => (decodeFrame(m) as { seq: number }).seq)).toEqual([0, 1, 2]);
    // New match: the sender and the receiver start over.
    a.startMatch(2, false);
    b.startMatch(2, false);
    relay.advance();
    a.send(encodePacket({ match: 2, flags: 0, ack: 0, firstTick: 0, inputs: [1], hashes: [] }));
    relay.advance();
    expect(relay.a.sent.filter((m) => m[0] === 0x40).map((m) => (decodeFrame(m) as { seq: number }).seq).at(-1)).toBe(0);
    expect(b.receive()).toBeDefined();
    a.control.send(Uint8Array.of(5));
    relay.advance();
    b.tick();
    expect(b.control.receive()).toEqual(Uint8Array.of(5));
    // Frames of the old match are dropped.
    relay.b.deliver(encodeText(encodeFrame({ t: 'batch', seq: 1, packet: pkt(9, 1) })));
    relay.b.deliver(encodeText(encodeFrame({ t: 'pause', seq: 2, matchId: 1, flags: 1 })));
    expect(b.receive()).toBeUndefined();
    expect(b.staleMatch).toBe(3); // Includes the old-match batch still in flight at the switch.
    expect(b.peerPause).toBeUndefined();
  });

  it('delivers a gap after 40 ms, accepts the late frame once and drops a duplicate', () => {
    const { clock, relay, b } = mk();
    const batch = (seq: number) => encodeFrame({ t: 'batch', seq, packet: pkt(seq) });
    const feed = (bytes: Uint8Array) => { relay.b.deliver(encodeText(bytes)); };
    feed(batch(1));
    expect(b.receive()).toBeUndefined();
    feed(batch(1));
    clock.ms = 40;
    expect(b.receive()).toBeDefined();
    expect(b.receive()).toBeUndefined();
    feed(batch(0)); // Skipped over, now late: a BATCH is idempotent, so it is delivered once.
    expect(b.receive()).toBeDefined();
    feed(batch(0));
    expect(b.receive()).toBeUndefined();
  });

  it('times PING round trips, tracks peer pause, errors, and retries DESYNC/RESULT until stopped', () => {
    const { clock, relay, a, b } = mk();
    a.ping();
    clock.ms = 30;
    relay.advance();
    expect(medianRtt(a.rtts)).toBe(30);
    for (let i = 0; i < 8; i++) a.ping();
    relay.advance();
    expect(a.rtts.length).toBeLessThanOrEqual(5);
    a.sendPause(0, 1);
    relay.advance();
    b.receive();
    expect(b.peerPause).toEqual({ matchId: 0, flags: 1 });
    relay.b.deliver(encodeText(encodeFrame({ t: 'error', code: 0x000b, retryAfterSec: 60, detail: 0 })));
    expect(b.lastError?.code).toBe(0x000b);
    a.sendHash(0, 50, 7);
    a.sendDesync(0, 50, 1, 2);
    a.sendResult(0, 1, 0, 100, 5);
    const before = relay.seen.length;
    clock.ms += 500;
    a.receive();
    expect(relay.seen.length).toBe(before + 2);
    a.stopRetry();
    clock.ms += 500;
    a.receive();
    expect(relay.seen.length).toBe(before + 2);
  });

  it('resendResult re-sends the last RESULT after stopRetry, and only for the current match', () => {
    const { relay, a } = mk();
    expect(a.resendResult()).toBe(false);
    a.sendResult(0, 1, 0, 100, 5);
    a.stopRetry();
    const before = relay.seen.length;
    expect(a.resendResult()).toBe(true);
    expect(relay.seen.length).toBe(before + 1);
    a.startMatch(1, false);
    expect(a.resendResult()).toBe(false);
  });

  it('carries the setup handshake over the control link despite jitter and duplicates', () => {
    const clock = { ms: 0 };
    const relay = new FakeRelay(clock, 5, { latencyMs: 60, jitterMs: 40, duplicate: 0.3 });
    const t = [new WebSocketTransport(relay.a, () => clock.ms), new WebSocketTransport(relay.b, () => clock.ms)] as const;
    const hello = helloOf(SETUP);
    const hs = t.map((x) => new SetupHandshake(x.control, hello));
    for (let i = 0; i < 100 && !hs.every((h) => h.phase === 'go'); i++) {
      clock.ms += TICK_MS;
      relay.advance();
      for (const [i2, h] of hs.entries()) {
        t[i2]?.tick();
        h.poll();
      }
    }
    expect(hs.map((h) => h.phase)).toEqual(['go', 'go']);
  });
});
