import { describe, expect, it } from 'vitest';
import { conformanceCases, runAll } from './conformance';
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
      const t = createLoopbackConformance();
      const r = await runAll(t.adapter, t.hooks, { cases: [c] });
      expect(r.results[0]?.message ?? '', c.id).toBe('');
      expect(r.results[0]?.status).toBe('pass');
    });
  }
  it('passes as one run against a single shared relay, with no skips', async () => {
    const t = createLoopbackConformance();
    const r = await runAll(t.adapter, t.hooks);
    expect(r.results.filter((x) => x.status !== 'pass')).toEqual([]);
    expect(r.ok && r.skipped === 0).toBe(true);
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
