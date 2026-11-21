import { describe, expect, it } from 'vitest';
import { ESTIMATES, formatReport, measureMatch, MEASUREMENT_LABEL, PROFILES } from './online-measure';

describe('online measurement harness (virtual clock; figures are local, not estimates of a real backend)', () => {
  it('plays a short match through the relay and reports the expected shape with equal hashes', async () => {
    const r = await measureMatch({ ticks: 300, profile: PROFILES['typical'] });
    expect(r.label).toBe(MEASUREMENT_LABEL);
    expect(r.finalHashEqual).toBe(true);
    expect(r.matchesOfflineReference).toBe(true);
    expect(r.relayAgreed).toBe(true);
    expect(r.durationSec).toBeGreaterThan(5);
    expect(r.oneWayMs.samples).toBeGreaterThan(100);
    // 100 ms one way with 20 ms jitter, split over two legs: 100..120 ms.
    expect(r.oneWayMs.p50).toBeGreaterThanOrEqual(100);
    expect(r.oneWayMs.max).toBeLessThanOrEqual(120);
    expect(r.messages.total.perSec).toBeGreaterThan(150);
    expect(r.messages.total.count).toBe(r.messages.clientToRelay.count + r.messages.relayToClient.count);
    expect(r.bytes.total.perSec).toBeGreaterThan(0);
    expect(r.sessions).toHaveLength(2);
    expect(r.estimates).toBe(ESTIMATES);
    expect(JSON.parse(JSON.stringify(r)) as unknown).toEqual(r);
    const text = formatReport(r);
    expect(text).toContain(MEASUREMENT_LABEL);
    expect(text).toContain('estimate');
  });

  it('batchEvery 3 cuts messages to about a third and still agrees', async () => {
    const one = await measureMatch({ ticks: 300, batchEvery: 1 });
    const three = await measureMatch({ ticks: 300, batchEvery: 3, inputDelay: 4 });
    expect(three.finalHashEqual).toBe(true);
    // batchEvery 3 needs inputDelay >= 4: at delay 2 the 3-tick batch wait causes stalls (docs/ONLINE-MEASURE.md).
    expect(three.stalls).toBeLessThanOrEqual(one.stalls + 5);
    expect(three.relayAgreed).toBe(true);
    expect(three.messages.total.perSec).toBeLessThan(one.messages.total.perSec / 2);
  });

  it('batchEvery 3 with inputDelay 4 stalls less than batchEvery 1 with inputDelay 2 on the bad profile', async () => {
    const profile = PROFILES['bad'];
    const base = await measureMatch({ ticks: 600, batchEvery: 1, inputDelay: 2, profile });
    const three = await measureMatch({ ticks: 600, batchEvery: 3, inputDelay: 4, profile });
    expect(three.finalHashEqual).toBe(true);
    expect(three.relayAgreed).toBe(true);
    expect(three.stalls).toBeLessThanOrEqual(base.stalls);
  });

  it.each([5, 20])('batchEvery 3 / inputDelay 4 agrees with %i%% frame loss (a lost batch is repaired by the next)', async (lossPct) => {
    const profile = { ...PROFILES['typical'], lossPct };
    const r = await measureMatch({ ticks: 600, batchEvery: 3, inputDelay: 4, profile, netSeed: 7 });
    expect(r.finalHashEqual).toBe(true);
    expect(r.relayAgreed).toBe(true);
  });

  it('is deterministic for a seed and survives duplicates and reordering', async () => {
    const o = { ticks: 200, profile: PROFILES['bad'], netSeed: 5 } as const;
    const a = await measureMatch(o);
    expect(a.finalHashEqual).toBe(true);
    expect(await measureMatch(o)).toEqual(a);
  });
});
