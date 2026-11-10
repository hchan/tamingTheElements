import { describe, expect, it } from 'vitest';
import { newEmptyState } from '@core/index';
import { buildExport, parseImport, prepareExport, runImport } from './export-import';
import { createLocalSaveStore } from './local-save-store';
import { createMemoryStorage } from './save-store';

const store = () => createLocalSaveStore(createMemoryStorage(), () => 1234);

interface Parsed {
  data: { difficulty: number };
}
const difficultyOf = (text: string): number => (JSON.parse(text) as Parsed).data.difficulty;

describe('export-import', () => {
  it('round-trips through the envelope', () => {
    const file = buildExport({ ...newEmptyState(), savedAt: 99 });
    expect(JSON.parse(file.text) as unknown).toMatchObject({ format: 'tte-save', schemaVersion: 1, savedAt: 99 });
    expect(file.filename).toBe('tte-save-99.json');
    const back = parseImport(file.text);
    expect(back.ok && back.value.savedAt).toBe(99);
  });

  it('accepts a bare save', () => {
    expect(parseImport(JSON.stringify(newEmptyState())).ok).toBe(true);
  });

  it('reports errors for bad input', () => {
    const bad = parseImport('{nope');
    expect(!bad.ok && bad.message).toContain('not valid JSON');
    expect(parseImport('[]').ok).toBe(false);
    expect(parseImport('{"format":"other"}')).toMatchObject({ ok: false });
    expect(parseImport('{"format":"tte-save"}')).toMatchObject({ ok: false });
    const future = parseImport(JSON.stringify({ format: 'tte-save', data: { schemaVersion: 99 } }));
    expect(!future.ok && future.message).toContain('newer version');
  });

  it('only persists after confirmation', async () => {
    const s = store();
    const text = buildExport({ ...newEmptyState(), difficulty: 1.12 }).text;
    expect(await runImport(s, text, () => false)).toEqual({ status: 'cancelled' });
    const r = await prepareExport(s);
    expect(r.ok && difficultyOf(r.value.text)).not.toBe(1.12);
    const done = await runImport(s, text, () => true);
    expect(done.status).toBe('imported');
    const r2 = await prepareExport(s);
    expect(r2.ok && difficultyOf(r2.value.text)).toBe(1.12);
  });

  it('does not call confirm on invalid input', async () => {
    let asked = false;
    const out = await runImport(store(), 'garbage', () => ((asked = true), true));
    expect(out.status).toBe('error');
    expect(asked).toBe(false);
  });
});
