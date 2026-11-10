import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: resolve(root, 'eslint.config.js'),
  ignore: false,
});

async function lint(file: string): Promise<{ ruleId: string | null; message: string }[]> {
  const [result] = await eslint.lintFiles([resolve(root, 'tests/lint/fixtures', file)]);
  return result?.messages ?? [];
}

// [ruleId, text the message must contain]
const expected: [string, string][] = [
  ...[
    'Date',
    'performance',
    'window',
    'document',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'crypto',
    'fetch',
    'localStorage',
    'navigator',
  ].map((n): [string, string] => ['no-restricted-globals', `${n} is banned`]),
  ...[
    'random',
    'sin',
    'cos',
    'tan',
    'asin',
    'acos',
    'atan',
    'atan2',
    'sinh',
    'cosh',
    'tanh',
    'exp',
    'expm1',
    'log',
    'log1p',
    'log2',
    'log10',
    'pow',
    'cbrt',
    'hypot',
  ].map((p): [string, string] => ['no-restricted-properties', `Math.${p} is banned`]),
  ['no-restricted-properties', 'Date.now is banned'],
  ['no-restricted-syntax', '** is banned'],
  ['no-restricted-syntax', '**= is banned'],
  ['no-restricted-syntax', 'new Date is banned'],
  ['no-restricted-syntax', 'toFixed is banned'],
  ['no-restricted-imports', 'phaser is banned'],
  ['no-restricted-imports', 'node:* is banned'],
  ['no-restricted-imports', '@game/* is banned'],
  ['no-restricted-imports', '@ui/* is banned'],
  ['no-restricted-imports', '@testing/* is banned'],
  ['no-restricted-imports', 'relative paths escaping core'],
];

/** One fixture per known bypass of the original bans (determinism audit): [file, ruleId, message text]. */
const bypasses: [string, string, string][] = [
  ['bypass-math-alias.core.ts', 'no-restricted-syntax', 'Math as a value is banned'],
  ['bypass-math-computed.core.ts', 'no-restricted-syntax', 'Math[...] is banned'],
  ['bypass-math-descriptor.core.ts', 'no-restricted-syntax', 'Math as a value is banned'],
  ['bypass-math-constant.core.ts', 'no-restricted-syntax', 'Math member is banned'],
  ['bypass-globalthis-math.core.ts', 'no-restricted-globals', 'globalThis is banned'],
  ['bypass-globalthis-performance.core.ts', 'no-restricted-globals', 'globalThis is banned'],
  ['bypass-self.core.ts', 'no-restricted-globals', 'self is banned'],
  ['bypass-computed-tofixed.core.ts', 'no-restricted-syntax', 'toFixed is banned'],
  ['bypass-toprecision.core.ts', 'no-restricted-syntax', 'toPrecision is banned'],
  ['bypass-tolocalestring.core.ts', 'no-restricted-syntax', 'toLocaleString is banned'],
  ['bypass-localecompare.core.ts', 'no-restricted-syntax', 'localeCompare is banned'],
  ['bypass-intl.core.ts', 'no-restricted-globals', 'Intl is banned'],
  ['bypass-weakref.core.ts', 'no-restricted-globals', 'WeakRef is banned'],
  ['bypass-finalization-registry.core.ts', 'no-restricted-globals', 'FinalizationRegistry is banned'],
  ['bypass-queue-microtask.core.ts', 'no-restricted-globals', 'queueMicrotask is banned'],
  ['bypass-reflect.core.ts', 'no-restricted-globals', 'Reflect is banned'],
  ['bypass-sort-no-comparator.core.ts', 'no-restricted-syntax', 'sort() without a comparator is banned'],
  ['bypass-async.core.ts', 'no-restricted-syntax', 'async functions are banned'],
  ['bypass-async.core.ts', 'no-restricted-syntax', 'await is banned'],
];

describe('core purity lint bans', () => {
  it('has at least 30 banned items under test', () => {
    expect(expected.length).toBeGreaterThanOrEqual(30);
  });

  it('flags every banned item in bad.core.ts', async () => {
    const messages = await lint('bad.core.ts');
    const missing = expected.filter(
      ([ruleId, text]) => !messages.some((m) => m.ruleId === ruleId && m.message.includes(text)),
    );
    expect(missing).toEqual([]);
  }, 60_000);

  it('accepts good.core.ts with zero messages', async () => {
    expect(await lint('good.core.ts')).toEqual([]);
  }, 60_000);

  it('has an expectation for every bypass fixture', () => {
    const files = readdirSync(resolve(root, 'tests/lint/fixtures')).filter((f) => f.startsWith('bypass-'));
    expect(new Set(bypasses.map(([f]) => f))).toEqual(new Set(files));
  });

  it.each(bypasses)('%s fails lint with %s (%s)', async (file, ruleId, text) => {
    const messages = await lint(file);
    expect(messages.filter((m) => m.ruleId === ruleId).map((m) => m.message)).toContainEqual(expect.stringContaining(text));
  }, 60_000);

  it('applies the full ban lists to a real src/core file (flat config replaces rule options, so test the merged result)', async () => {
    const config = (await eslint.calculateConfigForFile(resolve(root, 'src/core/sim/step.ts'))) as {
      rules: Record<string, unknown[]>;
    };
    const options = (rule: string): string => JSON.stringify(config.rules[rule]?.slice(1));
    for (const rule of ['no-restricted-globals', 'no-restricted-properties', 'no-restricted-syntax', 'no-restricted-imports']) {
      expect([2, 'error'], rule).toContain(config.rules[rule]?.[0]);
    }
    for (const name of ['Date', 'performance', 'globalThis', 'self', 'Intl', 'WeakRef', 'FinalizationRegistry', 'queueMicrotask', 'Reflect']) {
      expect(options('no-restricted-globals')).toContain(`"name":"${name}"`);
    }
    expect(options('no-restricted-properties')).toContain('"property":"atan2"');
    for (const text of ['Math[...]', 'Math as a value', 'Math member', 'toLocaleString', 'sort()', 'await', 'async', 'toFixed']) {
      expect(options('no-restricted-syntax')).toContain(text);
    }
  }, 60_000);
});
