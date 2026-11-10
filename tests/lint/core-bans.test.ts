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
});
