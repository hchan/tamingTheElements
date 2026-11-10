import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateReplay } from '@core/index';
import { verifyReplayText } from '../../tools/replay-verify';

const DIR = new URL('../fixtures/replays/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.replay.json'));

describe('replay fixtures', () => {
  it('has fixtures', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s verifies', (name) => {
    expect(verifyReplayText(readFileSync(new URL(name, DIR), 'utf8'))).toMatchObject({ ok: true });
  });

  it.each(files)('%s passes the pre-flight validator', (name) => {
    expect(validateReplay(JSON.parse(readFileSync(new URL(name, DIR), 'utf8'))).ok).toBe(true);
  });

  it('reports a corrupted replay as a failure', () => {
    const text = readFileSync(new URL(files[0] as string, DIR), 'utf8').replace(/"finalHash":\d+/, '"finalHash":1');
    expect(verifyReplayText(text).ok).toBe(false);
    expect(verifyReplayText('not json').ok).toBe(false);
  });
});
