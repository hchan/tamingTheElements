import { describe, expect, it } from 'vitest';
import { encodePacket } from '../net/packet';
import { encodeFrame, type Frame } from './codec';
import {
  DISCONNECT_GRACE_MS,
  ErrorCode,
  MAX_QUEUE,
  PeerStatusEvent,
  PROTOCOL_VERSION,
  ResultStatus,
} from './constants';
import { RelayCore } from './core';
import { LoopbackSender } from './loopback';
import { InMemoryStore } from './memory-store';
import type { Json, PutOptions, RelayCtx, Store, StoreItem } from './store';

const SIM = 7;

/** A store that lets a test run another relay call at an exact point between two store calls of the first (a deterministic race). */
class RaceStore implements Store {
  /** Runs once, after the first `get`/`put` (`op`) of a key matching `key`, before the caller sees the result. */
  trap: { op: 'get' | 'put'; key: RegExp; run: () => Promise<void> } | undefined;
  constructor(private readonly inner: Store) {}
  private async fire(op: 'get' | 'put', key: string): Promise<void> {
    const t = this.trap;
    if (t === undefined || t.op !== op || !t.key.test(key)) return;
    this.trap = undefined;
    await t.run();
  }
  async get(key: string): Promise<StoreItem | undefined> {
    const r = await this.inner.get(key);
    await this.fire('get', key);
    return r;
  }
  async put(key: string, value: Json, options?: PutOptions): Promise<boolean> {
    await this.fire('put', key);
    return this.inner.put(key, value, options);
  }
  delete(key: string): Promise<void> {
    return this.inner.delete(key);
  }
  keys(prefix: string): Promise<readonly string[]> {
    return this.inner.keys(prefix);
  }
}

function harness(identity?: () => string | undefined) {
  const clock = { t: 1_000_000 };
  let x = 999;
  const randomInt = (n: number): number => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
  const mem = new InMemoryStore(() => clock.t);
  const store = new RaceStore(mem);
  const sender = new LoopbackSender();
  const core = new RelayCore(store, sender);
  const ctx = (): RelayCtx => {
    const id = identity?.();
    return { now: () => clock.t, randomInt, ...(id === undefined ? {} : { identity: id }) };
  };
  const send = (conn: string, f: Frame): Promise<void> => core.handle(conn, encodeFrame(f), ctx());
  const hello = (conn: string, sim = SIM, resume = 0): Promise<void> =>
    send(conn, { t: 'hello', ver: PROTOCOL_VERSION, simVersion: sim, resumeSession: resume });
  const frames = <K extends Frame['t']>(conn: string, t: K): Extract<Frame, { t: K }>[] =>
    sender.framesFor(conn).filter((f) => f.t === t) as Extract<Frame, { t: K }>[];
  const last = <K extends Frame['t']>(conn: string, t: K): Extract<Frame, { t: K }> =>
    frames(conn, t).at(-1) as Extract<Frame, { t: K }>;
  const conn = async (c: string): Promise<{ st: string }> =>
    (await mem.get(`conn:${c}`))?.value as unknown as { st: string };
  return { clock, mem, store, sender, core, ctx, send, hello, frames, last, conn };
}

const batch = (seq: number, match: number): Frame => ({
  t: 'batch',
  seq,
  match,
  packet: encodePacket({ match, flags: 0, ack: 0, firstTick: seq, inputs: [1], hashes: [] }),
});
const join = (h: ReturnType<typeof harness>, c: string): Promise<void> => h.send(c, { t: 'queueJoin', mode: 0 });
const result = (matchId: number, ticks = 100): Frame => ({
  t: 'result',
  seq: 0,
  matchId,
  winner: 0,
  reason: 0,
  ticks,
  finalHash: 5,
});

describe('connection records are compare-and-set', () => {
  it('QUEUE_LEAVE racing the pairing is not overwritten by the match', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    // b pairs with a; right before the match is committed a leaves the queue.
    h.store.trap = { op: 'put', key: /^match:/, run: () => h.send('a', { t: 'queueLeave' }) };
    await join(h, 'b');
    expect(h.frames('a', 'matchStart')).toHaveLength(0);
    expect(h.frames('b', 'matchStart')).toHaveLength(0);
    expect((await h.conn('a')).st).toBe('idle');
    expect((await h.conn('b')).st).toBe('queued');
    expect(h.mem.size).toBeLessThan(20);
    // a can queue again and pairs with b
    await join(h, 'a');
    expect(h.frames('a', 'error')).toHaveLength(0);
    expect(h.frames('a', 'matchStart')).toHaveLength(1);
  });

  it('a double QUEUE_JOIN queues once and answers busy once', async () => {
    const h = harness();
    await h.hello('a');
    let fired = false;
    h.store.trap = {
      op: 'get',
      key: /^conn:a$/,
      run: async () => {
        if (fired) return;
        fired = true;
        await join(h, 'a');
      },
    };
    // the trap fires on the first conn read of the outer join (the dispatch read), so the second join runs to completion first
    await join(h, 'a');
    expect(h.frames('a', 'queueState')).toHaveLength(1);
    expect(h.frames('a', 'error').map((e) => e.code)).toEqual([ErrorCode.busy]);
    const q = (await h.mem.get('queue'))?.value as unknown as { w: unknown[] };
    expect(q.w).toHaveLength(1);
  });

  it('a socket closing while it is being paired is not resurrected', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    h.store.trap = { op: 'put', key: /^match:/, run: () => h.core.handleClose('a', h.ctx()) };
    await join(h, 'b');
    expect(await h.mem.get('conn:a')).toBeUndefined();
    expect(h.frames('a', 'matchStart')).toHaveLength(0);
    expect(h.frames('b', 'matchStart')).toHaveLength(0);
    expect((await h.conn('b')).st).toBe('queued');
  });

  it('the pairing closing while the joiner vanishes puts the partner back in the queue', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    // b closes between the partner's claim and its own: the match record is dropped, a is queued again
    h.store.trap = { op: 'put', key: /^match:/, run: () => h.core.handleClose('b', h.ctx()) };
    await join(h, 'b');
    expect((await h.conn('a')).st).toBe('queued');
    await h.hello('c');
    await join(h, 'c');
    expect(h.frames('a', 'matchStart')).toHaveLength(1);
    expect(h.frames('c', 'matchStart')).toHaveLength(1);
  });

  it('the kill-switch notice is sent once when two frames race', async () => {
    const h = harness();
    await h.hello('a');
    const resting = { now: () => h.clock.t, randomInt: () => 0, resting: { retryAfterSec: 30 } };
    h.store.trap = {
      op: 'get',
      key: /^conn:a$/,
      run: () => h.core.handle('a', encodeFrame({ t: 'ping', nonce: 2 }), resting),
    };
    await h.core.handle('a', encodeFrame({ t: 'ping', nonce: 1 }), resting);
    expect(h.frames('a', 'error').filter((e) => e.code === ErrorCode.resting)).toHaveLength(1);
  });
});

describe('matches in a row and matchId', () => {
  it('counts matchId up per match, restarts nothing else, and lets the same sockets play again', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    await join(h, 'b');
    const m1 = h.last('a', 'matchStart');
    expect(m1.matchId).toBe(1);
    expect(h.last('b', 'matchStart').matchId).toBe(1);
    // still live: a second queue join is busy
    await join(h, 'a');
    expect(h.last('a', 'error').code).toBe(ErrorCode.busy);
    await h.send('a', result(1));
    await h.send('b', result(1));
    expect(h.last('b', 'resultAck').status).toBe(ResultStatus.agreed);
    await join(h, 'b');
    await join(h, 'a');
    const m2 = h.last('a', 'matchStart');
    expect(m2.matchId).toBe(2);
    expect(m2.slot).toBe(1); // b waited longer this time
    expect(h.last('b', 'matchStart')).toMatchObject({ matchId: 2, slot: 0 });
    // match-phase frames of the old match id are dropped, the new id is relayed
    await h.send('a', batch(0, 1));
    expect(h.frames('b', 'batch')).toHaveLength(0);
    await h.send('a', batch(0, 2));
    expect(h.frames('b', 'batch')).toHaveLength(1);
  });

  it('wraps matchId inside 1..255', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await h.mem.put('matchctr', 255);
    await join(h, 'a');
    await join(h, 'b');
    expect(h.last('a', 'matchStart').matchId).toBe(1);
  });

  it('uses the match id in PEER_STATUS and re-sends it on resume', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await h.mem.put('matchctr', 41);
    await join(h, 'a');
    await join(h, 'b');
    const sid = h.last('a', 'welcome').sessionId;
    await h.core.handleClose('a', h.ctx());
    expect(h.last('b', 'peerStatus')).toMatchObject({ matchId: 42, event: PeerStatusEvent.disconnected });
    await h.hello('a2', SIM, sid);
    expect(h.last('a2', 'matchStart').matchId).toBe(42);
    expect(h.last('b', 'peerStatus')).toMatchObject({ matchId: 42, event: PeerStatusEvent.back });
  });

  it('ignores seq on HASH, DESYNC and RESULT', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    await join(h, 'b');
    for (const seq of [0, 7, 0xffffffff]) {
      await h.send('a', { t: 'hash', seq, matchId: 1, tick: 50, hash: 9 });
      await h.send('b', { t: 'hash', seq, matchId: 1, tick: 50, hash: 9 });
    }
    expect(h.frames('a', 'resultAck')).toHaveLength(0);
    await h.send('a', { ...(result(1) as Extract<Frame, { t: 'result' }>), seq: 123456 });
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.waiting);
    await h.send('b', result(1));
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.agreed);
  });
});

describe('divergence, takeover, gone peers, queue cap', () => {
  it('tells both slots when the hashes diverge', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    await join(h, 'b');
    await h.send('a', { t: 'hash', seq: 0, matchId: 1, tick: 50, hash: 1 });
    await h.send('b', { t: 'hash', seq: 0, matchId: 1, tick: 50, hash: 2 });
    for (const c of ['a', 'b'])
      expect(h.last(c, 'resultAck')).toMatchObject({ matchId: 1, status: ResultStatus.disagreed });
  });

  it('takes over a slot that still looks connected, and closes the old socket', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    await join(h, 'b');
    const sid = h.last('a', 'welcome').sessionId;
    await h.hello('a2', SIM, sid);
    expect(h.last('a2', 'welcome')).toMatchObject({ resumed: 1, sessionId: sid });
    expect(h.last('a2', 'matchStart')).toMatchObject({ slot: 0, matchId: 1 });
    expect(h.sender.closed).toEqual([{ conn: 'a', code: 1000 }]);
    expect(h.frames('b', 'peerStatus')).toHaveLength(0);
    // the old socket's late close event does not disturb the new owner
    await h.core.handleClose('a', h.ctx());
    await h.send('a2', batch(0, 1));
    expect(h.frames('b', 'batch')).toHaveLength(1);
    await h.send('a', batch(1, 1));
    expect(h.frames('b', 'batch')).toHaveLength(1);
  });

  it('refuses to resume a session for another identity', async () => {
    let who = 'alice';
    const h = harness(() => who);
    await h.hello('a');
    who = 'bob';
    await h.hello('b');
    await join(h, 'a');
    await join(h, 'b');
    const sid = h.last('a', 'welcome').sessionId;
    await h.core.handleClose('a', h.ctx());
    await h.hello('thief', SIM, sid); // identity is still bob
    expect(h.last('thief', 'welcome').resumed).toBe(0);
    who = 'alice';
    await h.hello('a2', SIM, sid);
    expect(h.last('a2', 'welcome').resumed).toBe(1);
  });

  it('resolves a waiting RESULT when the peer is declared gone', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    await join(h, 'b');
    await h.send('a', result(1));
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.waiting);
    await h.core.handleClose('b', h.ctx());
    h.clock.t += DISCONNECT_GRACE_MS + 1;
    await h.core.sweep(h.ctx());
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.disagreed);
    // the survivor can queue again
    await join(h, 'a');
    expect(h.frames('a', 'error')).toHaveLength(0);
  });

  it('answers a RESULT at once when the peer is already gone', async () => {
    const h = harness();
    await h.hello('a');
    await h.hello('b');
    await join(h, 'a');
    await join(h, 'b');
    await h.core.handleClose('b', h.ctx());
    h.clock.t += DISCONNECT_GRACE_MS + 1;
    await h.core.sweep(h.ctx());
    await h.send('a', result(1));
    expect(h.last('a', 'resultAck').status).toBe(ResultStatus.disagreed);
  });

  it('caps the queue with ERROR busy', async () => {
    const h = harness();
    // fill the queue with distinct sim versions so nobody pairs
    const w = Array.from({ length: MAX_QUEUE }, (_, i): [string, number, number] => [`f${String(i)}`, 1000 + i, 0]);
    await h.mem.put('queue', { w });
    await h.hello('a');
    await join(h, 'a');
    expect(h.last('a', 'error').code).toBe(ErrorCode.busy);
    expect((await h.conn('a')).st).toBe('idle');
  });
});
