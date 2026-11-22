import { describe, expect, it } from 'vitest';
import { ResultPoll } from './result-poll';
import { PLAY_AGAIN_ACK_WAIT_MS, RESULT_REPOLL_CAP_MS, RESULT_REPOLL_MS, RETRY_MS, type WebSocketTransport } from './transport';

/** A virtual clock with cancellable timers, and a transport stub that counts what ResultPoll asks of it. */
function rig() {
  let now = 1000;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const t = { ticks: 0, resends: 0, stops: 0 };
  const transport = {
    tick: () => { t.ticks++; },
    resendResult: () => { t.resends++; return true; },
    stopRetry: () => { t.stops++; },
  } as unknown as WebSocketTransport;
  const poll = new ResultPoll(transport, {
    now: () => now,
    after: (ms, fn) => {
      const id = seq++;
      timers.set(id, { at: now + ms, fn });
      return () => { timers.delete(id); };
    },
  });
  const step = (ms: number): void => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = Math.max(now, next[1].at);
      next[1].fn();
    }
    now = end;
  };
  return { poll, t, step };
}

describe('ResultPoll', () => {
  it('ACK 1 does not release a held action: it runs on ACK 0 or after PLAY_AGAIN_ACK_WAIT_MS', () => {
    const r = rig();
    let ran = 0;
    r.poll.begin();
    r.poll.defer(() => { ran++; });
    r.poll.onAck(1);
    r.step(PLAY_AGAIN_ACK_WAIT_MS - 1);
    expect(ran).toBe(0);
    r.poll.onAck(1);
    expect(ran).toBe(0);
    r.step(1);
    expect(ran).toBe(1);

    const s = rig();
    let ran2 = 0;
    s.poll.begin();
    s.poll.defer(() => { ran2++; });
    s.poll.onAck(1);
    s.poll.onAck(0);
    expect(ran2).toBe(1);
  });

  it('reports a failed immediate send through the return value and onDone; a held action is accepted', () => {
    const r = rig();
    expect(r.poll.defer(() => false)).toBe(false);
    expect(r.poll.defer(() => true)).toBe(true);
    const done: boolean[] = [];
    r.poll.begin();
    expect(r.poll.defer(() => false, (ok) => { done.push(ok); })).toBe(true);
    expect(done).toEqual([]);
    r.poll.onAck(0);
    expect(done).toEqual([false]);
  });

  it('the pre-ACK resend loop stops at RESULT_REPOLL_CAP_MS from begin', () => {
    const r = rig();
    r.poll.begin();
    r.step(RESULT_REPOLL_CAP_MS + RETRY_MS);
    const n = r.t.ticks;
    expect(n).toBeGreaterThan(0);
    expect(r.poll.open).toBe(false);
    r.step(RESULT_REPOLL_CAP_MS);
    expect(r.t.ticks).toBe(n);
  });

  it('the cap spans the pre-ACK loop and the re-poll together', () => {
    const r = rig();
    r.poll.begin();
    r.step(RESULT_REPOLL_CAP_MS / 2);
    r.poll.onAck(1);
    r.step(RESULT_REPOLL_CAP_MS / 2 + RESULT_REPOLL_MS);
    const n = r.t.resends;
    expect(r.poll.open).toBe(false);
    r.step(RESULT_REPOLL_CAP_MS);
    expect(r.t.resends).toBe(n);
  });
});
