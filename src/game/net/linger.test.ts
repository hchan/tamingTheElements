import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lingerIntervalMs, lingerSession } from './linger';

describe('lingerSession', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends at most 10 updates in one second at the default batch rate (was about 50)', () => {
    const update = vi.fn();
    const stop = lingerSession({ update });
    vi.advanceTimersByTime(1000);
    stop();
    expect(update.mock.calls.length).toBeGreaterThan(0);
    expect(update.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('follows batchEvery and never goes below the floor', () => {
    expect(lingerIntervalMs(1)).toBe(100);
    expect(lingerIntervalMs(8)).toBe(160);
    expect(lingerIntervalMs(0)).toBe(100);
  });

  it('stop clears the interval', () => {
    const update = vi.fn();
    lingerSession({ update }, 5)();
    vi.advanceTimersByTime(1000);
    expect(update).not.toHaveBeenCalled();
  });
});
