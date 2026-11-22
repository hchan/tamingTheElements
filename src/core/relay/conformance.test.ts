import { describe, expect, it } from 'vitest';
import { conformanceCases, runAll, type ConformanceCase } from './conformance';
import { createLoopbackConformance } from './conformance-loopback';

// Thin vitest wrapper: the suite itself is framework-agnostic (docs/RELAY-PACKAGE.md). One vitest case per conformance case.
describe('relay wire-spec conformance (RelayCore + InMemoryStore + LoopbackSender)', () => {
  it('has unique ids and a spec section on every case', () => {
    const ids = conformanceCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(conformanceCases.every((c) => c.spec.length > 0 && c.title.length > 0)).toBe(true);
  });
  for (const c of conformanceCases) {
    it(`${c.id} (spec ${c.spec}): ${c.title}`, async () => {
      const t = createLoopbackConformance({ chat: true });
      const r = await runAll(t.adapter, t.hooks, { cases: [c] });
      expect(r.results[0]?.message ?? '', c.id).toBe('');
      expect(r.results[0]?.status).toBe('pass');
    });
  }
  it('passes as one run against a single shared relay with chat on, with no skips', async () => {
    const t = createLoopbackConformance({ chat: true });
    const r = await runAll(t.adapter, t.hooks);
    expect(r.results.filter((x) => x.status !== 'pass')).toEqual([]);
    expect(r.ok && r.skipped === 0).toBe(true);
  });
  it('has the chat cases, none order-sensitive', () => {
    const chat = conformanceCases.filter((c) => c.id.startsWith('chat.'));
    expect(chat.map((c) => c.id)).toEqual(
      expect.arrayContaining(['chat.forward', 'chat.bad-text', 'chat.rate', 'chat.oversize', 'chat.stale-match', 'chat.limit', 'chat.undelivered', 'chat.after-result']),
    );
    expect(chat.some((c) => c.orderSensitive === true)).toBe(false);
  });
  it('skips every chat case (and nothing else) when the relay has chat off', async () => {
    const t = createLoopbackConformance();
    const n = conformanceCases.filter((c) => c.id.startsWith('chat.')).length;
    const all = await runAll(t.adapter, t.hooks);
    expect(all.failed).toBe(0);
    expect(all.skipped).toBe(n);
    expect(n).toBeGreaterThanOrEqual(8);
    const only = await runAll(t.adapter, t.hooks, { only: ['chat'] });
    expect(only.results).toHaveLength(n);
    expect(only.results.every((r) => r.status === 'skip' && /chat/.test(r.message ?? ''))).toBe(true);
  });
  it('skips (not fails) the hook-dependent cases without hooks', async () => {
    const t = createLoopbackConformance();
    const r = await runAll(t.adapter, {}, { only: ['resting.', 'resume.after'] });
    expect(r.failed).toBe(0);
    expect(r.skipped).toBe(5);
  });
  it('reports a failure instead of throwing', async () => {
    const t = createLoopbackConformance();
    const bad = { id: 'x', spec: '0', title: 'x', run: () => Promise.reject(new Error('boom')) };
    const r = await runAll(t.adapter, t.hooks, { cases: [bad] });
    expect(r).toMatchObject({ ok: false, failed: 1 });
  });
});

describe('runAll retryOrderSensitive', () => {
  const t = createLoopbackConformance();
  /** A case that fails its first `failures` runs. */
  const flaky = (id: string, failures: number, orderSensitive: boolean): ConformanceCase => {
    let n = 0;
    return { id, spec: '4', title: id, ...(orderSensitive ? { orderSensitive: true as const } : {}), run: () => (n++ < failures ? Promise.reject(new Error('out of order')) : Promise.resolve()) };
  };
  it('marks exactly the two order-sensitive cases', () => {
    expect(conformanceCases.filter((c) => c.orderSensitive === true).map((c) => c.id)).toEqual(expect.arrayContaining(['batch.far-ahead-seq', 'hash.consumed']));
    expect(conformanceCases.filter((c) => c.orderSensitive === true)).toHaveLength(2);
  });
  it('fails without retries (default)', async () => {
    const r = await runAll(t.adapter, t.hooks, { cases: [flaky('a', 1, true)] });
    expect(r.results[0]?.status).toBe('fail');
  });
  it('passes on a retry and says so', async () => {
    const r = await runAll(t.adapter, t.hooks, { cases: [flaky('a', 2, true)], retryOrderSensitive: 2 });
    expect(r.results[0]).toMatchObject({ status: 'pass', message: 'passed on attempt 3 (order-sensitive)' });
  });
  it('still fails when the retries run out', async () => {
    const r = await runAll(t.adapter, t.hooks, { cases: [flaky('a', 3, true)], retryOrderSensitive: 2 });
    expect(r.results[0]).toMatchObject({ status: 'fail', message: 'out of order' });
  });
  it('never retries a case that is not order-sensitive', async () => {
    const r = await runAll(t.adapter, t.hooks, { cases: [flaky('a', 1, false)], retryOrderSensitive: 5 });
    expect(r.results[0]?.status).toBe('fail');
  });
});

