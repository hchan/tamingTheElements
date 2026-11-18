import { describe, expect, it } from 'vitest';
import { CTL_MAX_UNACKED, CTL_RESEND_MS, ControlLink } from './control-link';

/** Two links joined by a wire that can drop and duplicate; `drop(n)` is a per-direction predicate on the nth emitted frame. */
function pair(drop: (side: number, n: number) => boolean = () => false, dup = false) {
  const clock = { ms: 0 };
  const links: ControlLink[] = [];
  const count = [0, 0];
  const mk = (side: 0 | 1): ControlLink =>
    new ControlLink((ctlSeq, ackCtl, body) => {
      const n = count[side] ?? 0;
      count[side] = n + 1;
      if (drop(side, n)) return;
      for (let i = 0; i < (dup ? 2 : 1); i++) links[1 - side]?.onFrame(ctlSeq, ackCtl, body);
    }, () => clock.ms);
  links.push(mk(0), mk(1));
  const run = (ms: number): void => {
    for (let t = 0; t < ms; t += 10) {
      clock.ms += 10;
      for (const l of links) l.tick(clock.ms);
    }
  };
  return { a: links[0] as ControlLink, b: links[1] as ControlLink, run };
}

const drain = (l: ControlLink): number[] => {
  const out: number[] = [];
  for (let m = l.receive(); m; m = l.receive()) out.push(m[0] as number);
  return out;
};

describe('ControlLink', () => {
  it('delivers in order, once, over a duplicating wire', () => {
    const { a, b } = pair(() => false, true);
    [1, 2, 3].forEach((n) => { a.send(new Uint8Array([n])); });
    expect(drain(b)).toEqual([1, 2, 3]);
  });

  it('resends lost messages every 200 ms and keeps order', () => {
    const { a, b, run } = pair((side, n) => side === 0 && n < 2);
    a.send(new Uint8Array([1]));
    a.send(new Uint8Array([2]));
    expect(drain(b)).toEqual([]);
    run(CTL_RESEND_MS - 10);
    expect(drain(b)).toEqual([]);
    run(10);
    expect(drain(b)).toEqual([1]);
    run(CTL_RESEND_MS);
    expect(drain(b)).toEqual([2]);
  });

  it('stops resending once acked and survives ctlSeq wrap-around', () => {
    const { a, b, run } = pair();
    const got: number[] = [];
    for (let i = 0; i < 600; i++) {
      a.send(new Uint8Array([i & 0xff]));
      b.send(new Uint8Array([(i + 1) & 0xff]));
      got.push(...drain(b));
      drain(a);
    }
    expect(got).toHaveLength(600);
    expect(got.every((v, i) => v === (i & 0xff))).toBe(true);
    run(1000);
    expect(drain(b)).toEqual([]);
  });

  it('ignores out-of-order and bogus-ack input and caps unacked sends', () => {
    const { a, b } = pair((side) => side === 1);
    b.onFrame(5, 0xff, new Uint8Array([9]));
    expect(drain(b)).toEqual([]);
    for (let i = 0; i < CTL_MAX_UNACKED + 5; i++) a.send(new Uint8Array([1]));
    a.send(new Uint8Array(0));
    a.onFrame(0, 200, new Uint8Array(0));
    expect(drain(b)).toHaveLength(CTL_MAX_UNACKED);
  });
});
