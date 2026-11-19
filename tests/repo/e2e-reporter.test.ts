import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import E2eReporter, { lastStepOf } from '../../tools/ci/e2e-reporter';

const dir = join(process.cwd(), '.scratch', 'e2e-reporter-test', String(process.pid));
const step = (title: string, extra: object = {}): never => ({ title, category: 'pw:api', steps: [], ...extra }) as never;
const result = (status: string, retry: number, err?: string): never =>
  ({ status, retry, duration: 5, steps: [step('click'), step('wait', { error: { message: 'x' } })], attachments: [{ name: 'trace', path: join(dir, 't.zip') }], stderr: [], error: err ? { message: err } : undefined }) as never;
const test = (results: unknown[], outcome: string): never =>
  ({ title: 'opens the menu', tags: [], location: { file: join(process.cwd(), 'tests/e2e/menu.spec.ts'), line: 3 }, results, outcome: () => outcome }) as never;

describe('lastStepOf', () => {
  it('prefers the failing step, else the last leaf', () => {
    expect(lastStepOf([step('a'), step('b', { error: {} }), step('c')] as never)).toBe('b');
    expect(lastStepOf([step('a'), step('c')] as never)).toBe('c');
  });
});

describe('E2eReporter', () => {
  it('writes one jsonl line per attempt and a report.md', () => {
    mkdirSync(dir, { recursive: true });
    process.env['TTE_REPORT_DIR'] = dir;
    const rep = new E2eReporter();
    const failed = [result('failed', 0, 'boom\nmore'), result('failed', 1, 'boom')];
    const t = test(failed, 'unexpected');
    rep.onBegin({ workers: 1, projects: [{ retries: 1 }] } as never, { allTests: () => [t] } as never);
    rep.onTestEnd(t, failed[0] as never);
    rep.onTestEnd(t, failed[1] as never);
    rep.onEnd({ status: 'failed', duration: 10 } as never);
    const lines = readFileSync(join(dir, 'results.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({ retry: 1, status: 'failed', error: 'boom' });
    expect(existsSync(join(dir, 'report.md'))).toBe(true);
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toMatch(/^VERDICT: /);
  });

  it('never throws out of a hook', () => {
    const rep = new E2eReporter();
    expect(() => { rep.onTestEnd({} as never, {} as never); }).not.toThrow();
    expect(() => { rep.onEnd({ status: 'passed', duration: 1 } as never); }).not.toThrow();
  });
});
