import { describe, expect, it } from 'vitest';
import { encodePacket } from '../net/packet';
import { encodeFrame, type Frame } from './codec';
import {
  DISCONNECT_GRACE_MS,
  ErrorCode,
  PeerStatusEvent,
  PROTOCOL_VERSION,
  RESTING_CLOSE_MS,
  ResultStatus,
  RoomPeerEvent,
} from './constants';
import { RelayCore, type RelayEvent } from './core';
import { LoopbackSender } from './loopback';
import { InMemoryStore } from './memory-store';
import { ReorderBuffer } from './seq';
import type { RelayCtx } from './store';

const SIM = 7;

function harness() {
  const clock = { t: 1_000_000 };
  let x = 12345;
  const randomInt = (n: number): number => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
  const store = new InMemoryStore(() => clock.t);
  const sender = new LoopbackSender();
  const events: RelayEvent[] = [];
  const core = new RelayCore(store, sender, { onEvent: (e) => events.push(e) });
  const ctx: RelayCtx = { now: () => clock.t, randomInt };
  const send = (conn: string, f: Frame): Promise<void> => core.handle(conn, encodeFrame(f), ctx);
  const hello = (conn: string, sim = SIM, resume = 0): Promise<void> =>
    send(conn, { t: 'hello', ver: PROTOCOL_VERSION, simVersion: sim, resumeSession: resume });
  const last = <K extends Frame['t']>(conn: string, t: K): Extract<Frame, { t: K }> => {
    const f = sender.framesFor(conn).filter((x) => x.t === t);
    return f[f.length - 1] as Extract<Frame, { t: K }>;
  };
  const count = (conn: string, t: Frame['t']): number =>
    sender.framesFor(conn).filter((x) => x.t === t).length;
  const start = async (): Promise<number> => {
    await hello('a');
    await hello('b');
    await send('a', { t: 'queueJoin', mode: 0 });
    await send('b', { t: 'queueJoin', mode: 0 });
    return last('a', 'matchStart').matchId;
  };
  return { clock, store, sender, events, core, ctx, send, hello, last, count, start };
}

const batch = (seq: number, match: number): Frame => ({
  t: 'batch',
  seq,
  match,
  packet: encodePacket({
    match,
    flags: 0,
    ack: 0,
    firstTick: seq,
    inputs: [seq & 0xff],
    hashes: [],
  }),
});

describe('RelayCore hello', () => {
  it('welcomes with a session id and answers ping', async () => {
    const h = harness();
    await h.hello('a');
    const w = h.last('a', 'welcome');
    expect(w).toMatchObject({ ver: PROTOCOL_VERSION, resumed: 0 });
    expect(w.sessionId).toBeGreaterThan(0);
    await h.send('a', { t: 'ping', nonce: 77 });
    expect(h.last('a', 'pong').nonce).toBe(77);
  });
  it('rejects a version mismatch and closes', async () => {
    const h = harness();
    await h.send('a', { t: 'hello', ver: 2, simVersion: SIM, resumeSession: 0 });
    expect(h.last('a', 'error')).toMatchObject({
      code: ErrorCode.versionMismatch,
      detail: PROTOCOL_VERSION,
    });
    expect(h.sender.closed).toEqual([{ conn: 'a', code: 4003 }]);
    expect(h.count('a', 'welcome')).toBe(0);
  });
  it('rejects a second hello, frames before hello, text and garbage', async () => {
    const h = harness();
    await h.send('a', { t: 'ping', nonce: 1 });
    expect(h.last('a', 'error').code).toBe(ErrorCode.badFrame);
    await h.hello('b');
    await h.hello('b');
    expect(h.last('b', 'error').code).toBe(ErrorCode.badFrame);
    await h.core.handle('c', 'hello', h.ctx);
    expect(h.last('c', 'error').code).toBe(ErrorCode.badFrame);
    await h.core.handle('d', new Uint8Array([0xee, 1, 2]), h.ctx);
    expect(h.last('d', 'error').code).toBe(ErrorCode.badFrame);
    expect(h.sender.closed.map((c) => c.conn)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('swallows a sender that throws', async () => {
    const h = harness();
    h.sender.send = () => {
      throw new Error('gone');
    };
    await expect(h.hello('a')).resolves.toBeUndefined();
  });
});

describe('RelayCore queue', () => {
  it('pairs two players and relays a match', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await h.send('a', { t: 'queueJoin', mode: 0 });
    expect(h.last('a', 'queueState').waitingSec).toBe(0);
    h.clock.t += 5000;
    await h.send('a', { t: 'ping', nonce: 1 });
    expect(h.last('a', 'queueState').waitingSec).toBe(5);
    await h.send('b', { t: 'queueJoin', mode: 0 });
    const ma = h.last('a', 'matchStart');
    const mb = h.last('b', 'matchStart');
    expect(ma.slot).toBe(0);
    expect(mb.slot).toBe(1);
    expect(ma).toMatchObject({
      seed: mb.seed,
      matchId: mb.matchId,
      simVersion: SIM,
      inputDelay: 2,
      batchEvery: 1,
    });
    expect(h.events[0]?.kind).toBe('match-start');

    // BATCH goes to the peer byte for byte with the sender's seq
    const f = batch(0, ma.matchId);
    await h.send('a', f);
    expect(h.last('b', 'batch')).toEqual(f);
    await h.send('b', batch(0, ma.matchId));
    expect(h.count('a', 'batch')).toBe(1);

    // pause and setup are relayed too
    await h.send('a', { t: 'pause', seq: 1, matchId: ma.matchId, flags: 1 });
    expect(h.last('b', 'pause').flags).toBe(1);
    const setup: Frame = { t: 'setup', seq: 2, ctlSeq: 0, ackCtl: 0, blob: new Uint8Array([9, 8]) };
    await h.send('b', setup);
    expect(h.last('a', 'setup')).toEqual(setup);
  });
  it('lets a player leave the queue and rejoin', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await h.send('a', { t: 'queueJoin', mode: 0 });
    await h.send('a', { t: 'queueLeave' });
    await h.send('b', { t: 'queueJoin', mode: 0 });
    expect(h.count('b', 'matchStart')).toBe(0);
    await h.send('a', { t: 'queueJoin', mode: 0 });
    expect(h.count('b', 'matchStart')).toBe(1);
  });
  it('does not pair different sim versions and refuses a busy player', async () => {
    const h = harness();
    await h.hello('a', 1);
    await h.hello('b', 2);
    await h.send('a', { t: 'queueJoin', mode: 0 });
    await h.send('b', { t: 'queueJoin', mode: 0 });
    expect(h.count('a', 'matchStart')).toBe(0);
    await h.send('a', { t: 'queueJoin', mode: 0 });
    expect(h.last('a', 'error').code).toBe(ErrorCode.busy);
    await h.send('a', { t: 'roomCreate' });
    expect(h.last('a', 'error').code).toBe(ErrorCode.busy);
  });
  it('removes a closed queued connection', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await h.send('a', { t: 'queueJoin', mode: 0 });
    await h.core.handleClose('a', h.ctx);
    await h.send('b', { t: 'queueJoin', mode: 0 });
    expect(h.count('b', 'matchStart')).toBe(0);
  });
  it('pairs exactly once under concurrent joins', async () => {
    const h = harness();
    for (const c of ['a', 'b', 'c', 'd']) await h.hello(c);
    await Promise.all(['a', 'b', 'c', 'd'].map((c) => h.send(c, { t: 'queueJoin', mode: 0 })));
    const started = ['a', 'b', 'c', 'd'].filter((c) => h.count(c, 'matchStart') === 1);
    expect(started).toHaveLength(4);
    expect(h.events.filter((e) => e.kind === 'match-start')).toHaveLength(2);
  });
});

describe('RelayCore rooms', () => {
  it('creates, joins by code (case-insensitive) and starts', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await h.send('a', { t: 'roomCreate' });
    const { code, ttlSec } = h.last('a', 'roomCreated');
    expect(ttlSec).toBe(600);
    await h.send('b', { t: 'roomJoin', code: code.toLowerCase() });
    expect(h.last('a', 'roomPeer').event).toBe(RoomPeerEvent.joined);
    expect(h.last('a', 'matchStart').slot).toBe(0);
    expect(h.last('b', 'matchStart').slot).toBe(1);
    // the code is spent
    await h.hello('c');
    await h.send('c', { t: 'roomJoin', code });
    expect(h.last('c', 'error').code).toBe(ErrorCode.noRoom);
  });
  it('answers no-room, sim-mismatch and expired rooms', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b', 99);
    await h.send('b', { t: 'roomJoin', code: 'ABC234' });
    expect(h.last('b', 'error').code).toBe(ErrorCode.noRoom);
    await h.send('a', { t: 'roomCreate' });
    const { code } = h.last('a', 'roomCreated');
    await h.send('b', { t: 'roomJoin', code });
    expect(h.last('b', 'error').code).toBe(ErrorCode.simMismatch);
    h.clock.t += 600_001;
    await h.hello('c');
    await h.send('c', { t: 'roomJoin', code });
    expect(h.last('c', 'error').code).toBe(ErrorCode.noRoom);
    // the host whose room expired is free again
    await h.send('a', { t: 'roomCreate' });
    expect(h.count('a', 'roomCreated')).toBe(2);
  });
  it('drops the room when the host closes', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await h.send('a', { t: 'roomCreate' });
    const { code } = h.last('a', 'roomCreated');
    await h.core.handleClose('a', h.ctx);
    await h.send('b', { t: 'roomJoin', code });
    expect(h.last('b', 'error').code).toBe(ErrorCode.noRoom);
  });
  it('answers full-house at the room cap', async () => {
    const h = harness();
    for (let i = 0; i < 2000; i++) await h.store.put(`room:Z${String(i)}`, { x: 1 });
    await h.hello('a');
    await h.send('a', { t: 'roomCreate' });
    expect(h.last('a', 'error')).toMatchObject({ code: ErrorCode.fullHouse, retryAfterSec: 30 });
  });
});

describe('RelayCore match phase', () => {
  it('drops stale matchIds and match frames from a player not in a match', async () => {
    const h = harness();
    const id = await h.start();
    await h.send('a', batch(0, id + 1));
    expect(h.count('b', 'batch')).toBe(0);
    await h.hello('c');
    await h.send('c', batch(0, id));
    expect(h.last('c', 'error').code).toBe(ErrorCode.badFrame);
  });
  it('accepts matching hashes silently and reports a mismatch as a desync', async () => {
    const h = harness();
    const id = await h.start();
    await h.send('a', { t: 'hash', seq: 0, matchId: id, tick: 50, hash: 1 });
    await h.send('b', { t: 'hash', seq: 0, matchId: id, tick: 50, hash: 1 });
    expect(h.events.some((e) => e.kind === 'desync')).toBe(false);
    await h.send('a', { t: 'hash', seq: 1, matchId: id, tick: 100, hash: 1 });
    await h.send('b', { t: 'hash', seq: 1, matchId: id, tick: 100, hash: 2 });
    expect(h.events.find((e) => e.kind === 'desync')).toMatchObject({ tick: 100, by: 'server' });
  });
  it('records a client desync report once', async () => {
    const h = harness();
    const id = await h.start();
    const d: Frame = { t: 'desync', seq: 2, matchId: id, tick: 10, localHash: 1, remoteHash: 2 };
    await h.send('a', d);
    await h.send('a', d);
    expect(h.events.filter((e) => e.kind === 'desync')).toHaveLength(1);
  });
  it('keeps only a bounded number of pending hashes', async () => {
    const h = harness();
    const id = await h.start();
    for (let i = 0; i < 100; i++)
      await h.send('a', { t: 'hash', seq: i, matchId: id, tick: i, hash: i });
    const m = await h.store.keys('match:');
    const v = (await h.store.get(m[0] as string))?.value as { hashes: unknown[] };
    expect(v.hashes.length).toBeLessThanOrEqual(64);
  });
  it('compares results: agreed, waiting, retried, disagreed', async () => {
    const h = harness();
    const id = await h.start();
    const r = (winner: number, ticks = 900): Frame => ({
      t: 'result',
      seq: 3,
      matchId: id,
      winner,
      reason: 0,
      ticks,
      finalHash: 5,
    });
    await h.send('a', r(1));
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.waiting);
    await h.send('a', r(1));
    expect(h.count('a', 'resultAck')).toBe(2);
    expect(h.count('b', 'resultAck')).toBe(0);
    await h.send('b', r(1));
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.agreed);
    expect(h.last('b', 'resultAck').status).toBe(ResultStatus.agreed);
    expect(h.events.find((e) => e.kind === 'result')).toMatchObject({
      agreed: true,
      winner: 1,
      ticks: 900,
    });
    // a late retry gets the current status
    await h.send('a', r(1));
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.agreed);
  });
  it('flags disagreeing results', async () => {
    const h = harness();
    const id = await h.start();
    await h.send('a', {
      t: 'result',
      seq: 3,
      matchId: id,
      winner: 0,
      reason: 0,
      ticks: 9,
      finalHash: 5,
    });
    await h.send('b', {
      t: 'result',
      seq: 3,
      matchId: id,
      winner: 1,
      reason: 0,
      ticks: 9,
      finalHash: 5,
    });
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.disagreed);
    expect(h.last('b', 'resultAck').status).toBe(ResultStatus.disagreed);
  });
  it('handles duplicated and reordered delivery through a ReorderBuffer', async () => {
    const h = harness();
    const id = await h.start();
    const got: number[] = [];
    const rb = new ReorderBuffer<number>();
    h.sender.listen('b', (data) => {
      const f = h.sender
        .framesFor('b')
        .find(
          (x) =>
            x.t === 'batch' &&
            x.packet.length > 0 &&
            JSON.stringify([...data]) === JSON.stringify([...encodeFrame(x)]),
        );
      if (f?.t === 'batch') for (const s of rb.push(f.seq, f.seq, h.clock.t)) got.push(s);
    });
    h.sender.hold();
    for (let s = 0; s < 4; s++) await h.send('a', batch(s, id));
    await h.send('a', batch(2, id)); // duplicate
    h.sender.release((fr) => [...fr].reverse());
    expect(got).toEqual([0, 1, 2, 3]);
  });
});

describe('RelayCore disconnect and resume', () => {
  it('tells the peer, resumes within the grace, then declares gone', async () => {
    const h = harness();
    const id = await h.start();
    const sid = h.last('a', 'welcome').sessionId;
    await h.core.handleClose('a', h.ctx);
    expect(h.last('b', 'peerStatus')).toMatchObject({
      event: PeerStatusEvent.disconnected,
      graceMs: DISCONNECT_GRACE_MS,
    });
    // batches to the absent player are dropped
    await h.send('b', batch(0, id));
    expect(h.count('a', 'batch')).toBe(0);
    h.clock.t += 3000;
    await h.hello('a2', SIM, sid);
    expect(h.last('a2', 'welcome')).toMatchObject({ resumed: 1, sessionId: sid });
    expect(h.last('a2', 'matchStart')).toMatchObject({ slot: 0, matchId: id });
    expect(h.last('b', 'peerStatus').event).toBe(PeerStatusEvent.back);
    await h.send('a2', batch(5, id));
    expect(h.count('b', 'batch')).toBe(1);

    await h.core.handleClose('b', h.ctx);
    h.clock.t += DISCONNECT_GRACE_MS + 1;
    await h.core.sweep(h.ctx);
    expect(h.last('a2', 'peerStatus')).toMatchObject({ event: PeerStatusEvent.gone });
    expect(h.events.find((e) => e.kind === 'peer-gone')).toMatchObject({ slot: 1 });
    // too late to resume
    const sidB = h.last('b', 'welcome').sessionId;
    await h.hello('b2', SIM, sidB);
    expect(h.last('b2', 'welcome').resumed).toBe(0);
  });
  it('ends the match record when both are gone, and ignores unknown sessions', async () => {
    const h = harness();
    await h.start();
    await h.core.handleClose('a', h.ctx);
    await h.core.handleClose('b', h.ctx);
    h.clock.t += DISCONNECT_GRACE_MS + 1;
    await h.core.sweep(h.ctx);
    expect(h.events.filter((e) => e.kind === 'peer-gone')).toHaveLength(2);
    await h.hello('x', SIM, 0xabcdef);
    expect(h.last('x', 'welcome').resumed).toBe(0);
    await h.core.handleClose('nobody', h.ctx);
  });
  it('does not resume after the grace even before a sweep', async () => {
    const h = harness();
    await h.start();
    const sid = h.last('a', 'welcome').sessionId;
    await h.core.handleClose('a', h.ctx);
    h.clock.t += DISCONNECT_GRACE_MS;
    await h.hello('a2', SIM, sid);
    expect(h.last('a2', 'welcome').resumed).toBe(0);
  });
});

describe('RelayCore kill switch', () => {
  const resting = { retryAfterSec: 120 };
  it('refuses a new hello with resting and closes', async () => {
    const h = harness();
    await h.core.handle(
      'a',
      encodeFrame({ t: 'hello', ver: 1, simVersion: SIM, resumeSession: 0 }),
      { ...h.ctx, resting },
    );
    expect(h.last('a', 'error')).toMatchObject({ code: ErrorCode.resting, retryAfterSec: 120 });
    expect(h.sender.closed).toEqual([{ conn: 'a', code: 4011 }]);
  });
  it('closes an idle connection at its next frame', async () => {
    const h = harness();
    await h.hello('a');
    await h.core.handle('a', encodeFrame({ t: 'queueJoin', mode: 0 }), { ...h.ctx, resting });
    expect(h.last('a', 'error').code).toBe(ErrorCode.resting);
    expect(h.sender.closed).toEqual([{ conn: 'a', code: 4011 }]);
  });
  it('lets a running match finish, then closes after the grace', async () => {
    const h = harness();
    const id = await h.start();
    const rctx = { ...h.ctx, resting };
    await h.core.handle('a', encodeFrame(batch(0, id)), rctx);
    expect(h.last('a', 'error').code).toBe(ErrorCode.resting);
    expect(h.last('b', 'batch').seq).toBe(0);
    expect(h.sender.closed).toEqual([]);
    h.clock.t += RESTING_CLOSE_MS;
    await h.core.handle('a', encodeFrame(batch(1, id)), rctx);
    expect(h.sender.closed).toEqual([{ conn: 'a', code: 4011 }]);
    expect(h.count('a', 'error')).toBe(1);
  });
});

describe('RelayCore faults', () => {
  it('answers internal on a store failure', async () => {
    const h = harness();
    await h.hello('a');
    h.store.get = () => Promise.reject(new Error('boom'));
    await h.send('a', { t: 'queueJoin', mode: 0 });
    expect(h.last('a', 'error').code).toBe(ErrorCode.internal);
  });
  it('answers internal when the store never accepts a write', async () => {
    const h = harness();
    await h.hello('a');
    h.store.put = () => Promise.resolve(false);
    await h.send('a', { t: 'queueJoin', mode: 0 });
    expect(h.last('a', 'error').code).toBe(ErrorCode.internal);
  });
});
