import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@core/index';
import { PlayOnce } from './play-once';

const ev = (tick: number, seq: number, extra = 0): SimEvent => ({ tick, sourceId: 1, kind: 22, seq, amount: extra });

describe('PlayOnce', () => {
  it('passes new events through unchanged', () => {
    const p = new PlayOnce();
    const a = [ev(1, 0), ev(1, 1)];
    expect(p.fresh(a)).toBe(a);
  });
  it('drops a correction with the same id but keeps genuinely new events', () => {
    const p = new PlayOnce();
    p.fresh([ev(5, 0, 10)]);
    const out = p.fresh([ev(5, 0, 12), ev(5, 1)]);
    expect(out.map((e) => e.seq)).toEqual([1]);
  });
  it('forgets old ticks', () => {
    const p = new PlayOnce(4);
    p.fresh([ev(1, 0)]);
    p.fresh([ev(30, 0)]);
    expect(p.fresh([ev(1, 0)]).length).toBe(1);
  });
});
