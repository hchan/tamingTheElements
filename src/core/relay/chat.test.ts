import { describe, expect, it } from 'vitest';
import { encodePacket } from '../net/packet';
import { CHAT_CAP_BIT, CHAT_DETAIL_TAG, CHAT_LIMIT_CODE, CHAT_UNDELIVERED_CODE } from './chat-rules';
import { encodeFrame, type Frame } from './codec';
import { DISCONNECT_GRACE_MS, ErrorCode, PROTOCOL_VERSION } from './constants';
import { RelayCore, type RelayEvent } from './core';
import { LoopbackSender } from './loopback';
import { InMemoryStore } from './memory-store';
import { encodeText } from './text-codec';
import type { RelayCtx } from './store';

const SIM = 7;
/** ASCII only (src/core has no TextEncoder). */
const enc = { encode: (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0)) };

function harness(chat = true) {
  const clock = { t: 1_000_000 };
  let x = 12345;
  const randomInt = (n: number): number => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
  const store = new InMemoryStore(() => clock.t);
  const sender = new LoopbackSender();
  const events: RelayEvent[] = [];
  const core = new RelayCore(store, sender, { chat, onEvent: (e) => events.push(e) });
  const ctx: RelayCtx = { now: () => clock.t, randomInt };
  const sendRaw = (conn: string, bytes: Uint8Array): Promise<void> => core.handle(conn, encodeText(bytes), ctx);
  const send = (conn: string, f: Frame): Promise<void> => sendRaw(conn, encodeFrame(f));
  const hello = (conn: string, resume = 0): Promise<void> =>
    send(conn, { t: 'hello', ver: PROTOCOL_VERSION, simVersion: SIM, resumeSession: resume });
  const last = <K extends Frame['t']>(conn: string, t: K): Extract<Frame, { t: K }> => {
    const f = sender.framesFor(conn).filter((y) => y.t === t);
    return f[f.length - 1] as Extract<Frame, { t: K }>;
  };
  const count = (conn: string, t: Frame['t']): number => sender.framesFor(conn).filter((y) => y.t === t).length;
  const start = async (): Promise<number> => {
    await hello('a');
    await hello('b');
    await send('a', { t: 'queueJoin', mode: 0 });
    await send('b', { t: 'queueJoin', mode: 0 });
    return last('a', 'matchStart').matchId;
  };
  const say = (conn: string, match: number, seq: number, text: string): Promise<void> =>
    send(conn, { t: 'chat', match, seq, bytes: enc.encode(text) });
  const outcomes = (): string[] => events.flatMap((e) => (e.kind === 'chat' ? [e.outcome] : []));
  const result = (conn: string, id: number): Promise<void> =>
    send(conn, { t: 'result', seq: 3, matchId: id, winner: 1, reason: 0, ticks: 900, finalHash: 5 });
  return { clock, store, sender, events, core, ctx, sendRaw, send, hello, last, count, start, say, outcomes, result };
}

const lastError = (h: ReturnType<typeof harness>, conn: string) => h.last(conn, 'error');

describe('RelayCore chat', () => {
  it('forwards the exact bytes to the peer with no echo', async () => {
    const h = harness();
    const id = await h.start();
    const frame = encodeFrame({ t: 'chat', match: id, seq: 0, bytes: enc.encode('hi') });
    await h.sendRaw('a', frame);
    const got = h.sender.sent.filter((s) => s.conn === 'b').pop();
    expect(got?.data).toBe(encodeText(frame));
    expect(h.count('a', 'chat')).toBe(0);
    expect(h.count('a', 'error')).toBe(0);
    expect(h.outcomes()).toEqual(['sent']);
  });

  it('advertises caps bit0 only when chat is on', async () => {
    const on = harness(true);
    await on.hello('a');
    expect(on.last('a', 'welcome').caps).toBe(CHAT_CAP_BIT);
    const off = harness(false);
    await off.hello('a');
    expect(off.last('a', 'welcome').caps).toBe(0);
  });

  it('delivers while paused', async () => {
    const h = harness();
    const id = await h.start();
    await h.send('a', { t: 'pause', seq: 0, matchId: id, flags: 1 });
    await h.say('b', id, 0, 'wait');
    expect(h.count('a', 'chat')).toBe(1);
  });

  it('answers 0x0E (tagged, socket open) while the peer is in grace', async () => {
    const h = harness();
    const id = await h.start();
    await h.core.handleClose('b', h.ctx);
    await h.say('a', id, 4, 'hello?');
    expect(lastError(h, 'a')).toMatchObject({
      code: CHAT_UNDELIVERED_CODE,
      detail: (CHAT_DETAIL_TAG << 8) | 4,
    });
    expect(h.sender.closed).toEqual([]);
    expect(h.outcomes()).toEqual(['away']);
  });

  it('answers 0x0E after the peer is gone for good', async () => {
    const h = harness();
    const id = await h.start();
    await h.core.handleClose('b', h.ctx);
    h.clock.t += DISCONNECT_GRACE_MS + 1;
    await h.say('a', id, 0, 'x');
    expect(lastError(h, 'a').code).toBe(CHAT_UNDELIVERED_CODE);
    expect(h.sender.closed.length).toBeLessThanOrEqual(0);
  });

  it('delivers after both RESULTs', async () => {
    const h = harness();
    const id = await h.start();
    await h.result('a', id);
    await h.result('b', id);
    await h.say('a', id, 0, 'gg');
    await h.say('b', id, 0, 'gg');
    expect(h.count('a', 'chat')).toBe(1);
    expect(h.count('b', 'chat')).toBe(1);
  });

  it('answers 0x0E when the peer has requeued for a rematch', async () => {
    const h = harness();
    const id = await h.start();
    await h.result('a', id);
    await h.result('b', id);
    await h.send('b', { t: 'queueJoin', mode: 0 });
    await h.say('a', id, 0, 'again?');
    expect(lastError(h, 'a').code).toBe(CHAT_UNDELIVERED_CODE);
    expect(h.count('b', 'chat')).toBe(0);
  });

  it('refuses the 4th quick line with tagged 9 and keeps the socket open', async () => {
    const h = harness();
    const id = await h.start();
    for (let i = 0; i < 3; i++) await h.say('a', id, i, 'x');
    await h.say('a', id, 3, 'x');
    const e = lastError(h, 'a');
    expect(e).toMatchObject({ code: ErrorCode.rateLimited, detail: (CHAT_DETAIL_TAG << 8) | 3 });
    expect(e.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(h.count('b', 'chat')).toBe(3);
    expect(h.sender.closed).toEqual([]);
    expect(h.outcomes()).toEqual(['sent', 'sent', 'sent', 'rate']);
    h.clock.t += 1000;
    await h.say('a', id, 4, 'x');
    expect(h.count('b', 'chat')).toBe(4);
  });

  it('answers the 101st line with 0x0D', async () => {
    const h = harness();
    const id = await h.start();
    for (let i = 0; i < 100; i++) {
      h.clock.t += 1000;
      await h.say('a', id, i, 'x');
    }
    expect(h.count('b', 'chat')).toBe(100);
    h.clock.t += 1000;
    await h.say('a', id, 100, 'x');
    expect(lastError(h, 'a').code).toBe(CHAT_LIMIT_CODE);
    expect(h.count('b', 'chat')).toBe(100);
    expect(h.outcomes().pop()).toBe('cap');
  });

  it('answers bad text with tagged 1 and keeps the socket open', async () => {
    const h = harness();
    const id = await h.start();
    await h.say('a', id, 9, '   ');
    expect(lastError(h, 'a')).toMatchObject({ code: ErrorCode.badFrame, detail: (CHAT_DETAIL_TAG << 8) | 9 });
    await h.send('a', { t: 'chat', match: id, seq: 1, bytes: new Uint8Array([0xc0, 0x80]) });
    expect(lastError(h, 'a').detail).toBe((CHAT_DETAIL_TAG << 8) | 1);
    expect(h.sender.closed).toEqual([]);
    expect(h.outcomes()).toEqual(['bad', 'bad']);
    expect(h.count('b', 'chat')).toBe(0);
  });

  it('closes 4002 on an oversize frame and 4001 on a malformed one', async () => {
    const h = harness();
    const id = await h.start();
    const big = new Uint8Array(4 + 121);
    big.set([0x70, id, 0, 121]);
    await h.sendRaw('a', big);
    expect(lastError(h, 'a').code).toBe(ErrorCode.tooBig);
    expect(h.sender.closed.pop()).toEqual({ conn: 'a', code: 4002 });
    await h.sendRaw('b', new Uint8Array([0x70, id, 0]));
    expect(h.sender.closed.pop()).toEqual({ conn: 'b', code: 4001 });
  });

  it('never writes a match:* key', async () => {
    const h = harness();
    const id = await h.start();
    const before = JSON.stringify(await h.store.get((await h.store.keys('match:'))[0] as string));
    await h.say('a', id, 0, 'hi');
    await h.say('b', id, 0, 'hi');
    expect(JSON.stringify(await h.store.get((await h.store.keys('match:'))[0] as string))).toBe(before);
    expect((await h.store.keys('chat:')).length).toBe(2);
  });

  it('leaves BATCH and RESULT agreement untouched with chat interleaved', async () => {
    const h = harness();
    const id = await h.start();
    const b = (seq: number): Frame => ({
      t: 'batch',
      seq,
      match: id,
      packet: encodePacket({ match: id, flags: 0, ack: 0, hashes: [], inputs: [] } as never),
    });
    await h.send('a', b(0));
    await h.say('a', id, 0, 'hi');
    await h.send('a', b(1));
    expect(h.count('b', 'batch')).toBe(2);
    await h.result('a', id);
    await h.say('b', id, 0, 'hi');
    await h.result('b', id);
    expect(h.events.find((e) => e.kind === 'result')).toMatchObject({ agreed: true });
    expect(h.events.some((e) => e.kind === 'desync')).toBe(false);
  });

  it('with chat off: caps 0 and 0x70 gets the same output as an unknown type', async () => {
    const h = harness(false);
    await h.start();
    const g = harness(false);
    await g.start();
    h.sender.clear();
    g.sender.clear();
    await h.sendRaw('a', new Uint8Array([0x70, 1, 0, 1, 0x68]));
    await g.sendRaw('a', new Uint8Array([0x6f, 1, 0, 1, 0x68]));
    expect(h.sender.sent).toEqual(g.sender.sent);
    expect(h.sender.closed).toEqual(g.sender.closed);
    expect(h.sender.closed[0]?.code).toBe(4001);
    expect(h.outcomes()).toEqual([]);
  });

  it('keeps the bucket across a resume', async () => {
    const h = harness();
    const id = await h.start();
    const sid = h.last('a', 'welcome').sessionId;
    for (let i = 0; i < 3; i++) await h.say('a', id, i, 'x');
    await h.core.handleClose('a', h.ctx);
    await h.hello('a2', sid);
    await h.say('a2', id, 3, 'x');
    expect(lastError(h, 'a2').code).toBe(ErrorCode.rateLimited);
  });

  it('gives a recycled u8 matchId a fresh bucket', async () => {
    const h = harness();
    const id = await h.start();
    for (let i = 0; i < 3; i++) await h.say('a', id, i, 'x');
    await h.result('a', id);
    await h.result('b', id);
    await h.send('a', { t: 'queueJoin', mode: 0 });
    await h.send('b', { t: 'queueJoin', mode: 0 });
    const id2 = h.last('a', 'matchStart').matchId;
    await h.say('a', id2, 0, 'new');
    expect(h.outcomes().pop()).toBe('sent');
  });

  it('drops a stale matchId or a queued sender silently', async () => {
    const h = harness();
    const id = await h.start();
    h.sender.clear();
    await h.say('a', (id + 1) & 0xff, 0, 'x');
    await h.hello('c');
    await h.say('c', id, 0, 'x');
    expect(h.sender.sent.filter((s) => s.conn !== 'c')).toEqual([]);
    expect(h.sender.closed).toEqual([]);
    expect(h.outcomes()).toEqual(['stale', 'stale']);
  });

  it('never puts line text in events', async () => {
    const h = harness();
    const id = await h.start();
    await h.say('a', id, 0, 'secretline');
    await h.say('a', id, 1, 'secretline');
    expect(JSON.stringify(h.events)).not.toContain('secretline');
  });
});
