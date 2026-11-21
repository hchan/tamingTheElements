import { describe, expect, it } from 'vitest';
import { RateCounter } from '../../tools/live-rate';

describe('live tool rate counter', () => {
  it('is empty before any frame', () => {
    expect(new RateCounter().summary()).toEqual({ total: 0, seconds: 0, peakPerSec: 0, meanPerSec: 0 });
  });
  it('buckets by second and reports peak and mean over the active span', () => {
    const c = new RateCounter();
    for (const ms of [100, 200, 900, 1500, 3100]) c.record(ms);
    expect(c.summary()).toEqual({ total: 5, seconds: 4, peakPerSec: 3, meanPerSec: 1.3 });
    expect(c.text()).toContain('peak 3/s');
  });
});
