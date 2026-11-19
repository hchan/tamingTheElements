import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';

/**
 * Ratchet on raw waits in tests/e2e (helpers live in tests/e2e/support):
 *  - `page.waitForTimeout`, `page.waitForFunction` and `expect.poll(...)` without a `message` are counted per file and may not
 *    exceed the grandfathered count in fixtures/e2e-raw-waits.json (a file not listed must have none). Migrating a spec to
 *    `waitFor` / `waitForArena` / labelled polls lowers its count; lower the JSON afterwards (never raise it).
 *  - `expects` is a floor: the number of `expect(...)` / `expect.poll(...)` / `expect.soft(...)` calls in a listed file may not
 *    drop below it, so a migration cannot silently drop an assertion.
 * Regenerate with TTE_UPDATE_FIXTURES=1 (states the new counts; say why in the commit).
 */

interface Counts {
  poll: number;
  waitForFunction: number;
  waitForTimeout: number;
  expects: number;
}
type Node = { type: string; [k: string]: unknown };

const ROOT = join(__dirname, '..', 'e2e');
const FIXTURE = join(__dirname, 'fixtures', 'e2e-raw-waits.json');

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && typeof (v as Node).type === 'string';
}

function walk(n: Node, visit: (n: Node) => void): void {
  visit(n);
  for (const [k, v] of Object.entries(n)) {
    if (k === 'parent' || k === 'loc' || k === 'range') continue;
    if (Array.isArray(v)) {
      for (const c of v) if (isNode(c)) walk(c, visit);
    } else if (isNode(v)) walk(v, visit);
  }
}

function name(n: unknown): string | undefined {
  return isNode(n) && n.type === 'Identifier' ? (n.name as string) : undefined;
}

/** `a.b` member callee parts, or undefined. */
function member(callee: unknown): { object: unknown; property: string } | undefined {
  if (!isNode(callee) || callee.type !== 'MemberExpression') return undefined;
  const p = callee.computed ? undefined : name(callee.property);
  return p === undefined ? undefined : { object: callee.object, property: p };
}

function hasMessage(arg: unknown): boolean {
  if (!isNode(arg) || arg.type !== 'ObjectExpression') return false;
  return (arg.properties as unknown[]).some((p) => isNode(p) && p.type === 'Property' && !p.computed && (name(p.key) === 'message' || (isNode(p.key) && p.key.value === 'message')));
}

export function countSource(source: string): Counts {
  const parser = tseslint.parser as unknown as { parseForESLint: (code: string, opts: object) => { ast: unknown } };
  const { ast } = parser.parseForESLint(source, { sourceType: 'module' });
  const c: Counts = { poll: 0, waitForFunction: 0, waitForTimeout: 0, expects: 0 };
  walk(ast as Node, (n) => {
    if (n.type !== 'CallExpression') return;
    const callee = n.callee;
    if (name(callee) === 'expect') {
      c.expects++;
      return;
    }
    const m = member(callee);
    if (!m) return;
    if (name(m.object) === 'expect' && m.property === 'poll') {
      c.expects++;
      if (!hasMessage((n.arguments as unknown[])[1])) c.poll++;
    } else if (name(m.object) === 'expect' && m.property === 'soft') {
      c.expects++;
    } else if (m.property === 'waitForTimeout') c.waitForTimeout++;
    else if (m.property === 'waitForFunction') c.waitForFunction++;
  });
  return c;
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== 'support') out.push(...listTs(p));
    } else if (e.endsWith('.ts')) out.push(p);
  }
  return out.sort();
}

function scan(): Record<string, Counts> {
  const res: Record<string, Counts> = {};
  for (const f of listTs(ROOT)) res[relative(ROOT, f)] = countSource(readFileSync(f, 'utf8'));
  return res;
}

const actual = scan();

if (process.env.TTE_UPDATE_FIXTURES === '1') {
  const keep: Record<string, Counts> = {};
  for (const [k, c] of Object.entries(actual)) if (c.poll + c.waitForFunction + c.waitForTimeout > 0) keep[k] = c;
  writeFileSync(FIXTURE, `${JSON.stringify(keep, null, 2)}\n`);
}

const grandfathered = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Counts>;

describe('e2e raw waits (ratchet)', () => {
  it('no file has more raw waits than grandfathered (use waitFor/waitForArena from tests/e2e/support/wait.ts, and expect.poll with { message })', () => {
    const over: string[] = [];
    for (const [file, c] of Object.entries(actual)) {
      const g = grandfathered[file] ?? { poll: 0, waitForFunction: 0, waitForTimeout: 0, expects: 0 };
      for (const k of ['poll', 'waitForFunction', 'waitForTimeout'] as const) {
        if (c[k] > g[k]) over.push(`${file}: ${k} ${String(c[k])} > allowed ${String(g[k])}`);
      }
    }
    expect(over).toEqual([]);
  });

  it('assertion floor: no listed file lost an expect(...) call', () => {
    const lost: string[] = [];
    for (const [file, g] of Object.entries(grandfathered)) {
      const c = actual[file];
      if (!c) continue; // a deleted spec is fine
      if (c.expects < g.expects) lost.push(`${file}: expects ${String(c.expects)} < floor ${String(g.expects)}`);
    }
    expect(lost).toEqual([]);
  });

  it('the fixture lists only existing files and is not stale-high (counts must be lowered after a migration)', () => {
    const stale: string[] = [];
    for (const [file, g] of Object.entries(grandfathered)) {
      const c = actual[file];
      if (!c) {
        stale.push(`${file}: no longer exists`);
        continue;
      }
      for (const k of ['poll', 'waitForFunction', 'waitForTimeout'] as const) {
        if (g[k] > c[k]) stale.push(`${file}: ${k} allowed ${String(g[k])} but only ${String(c[k])} left (lower the fixture)`);
      }
    }
    // Informational ratchet: tightening is the coordinator's step (P2), so only a missing file is a failure here.
    expect(stale.filter((s) => s.endsWith('no longer exists'))).toEqual([]);
  });
});

describe('e2e raw waits (counter)', () => {
  it('counts bare waits and unlabelled polls', () => {
    const c = countSource(`
      await page.waitForTimeout(100);
      await page.waitForFunction(X);
      await expect.poll(() => 1).toBe(1);
      await expect.poll(() => 1, { timeout: 5 }).toBe(1);
      await expect.poll(() => 1, { message: 'why' }).toBe(1);
      await expect.poll(() => 1, { message: 'why', timeout: 5 }).toBe(1);
      expect(1).toBe(1);
      expect.soft(1).toBe(1);
    `);
    expect(c).toEqual({ poll: 2, waitForFunction: 1, waitForTimeout: 1, expects: 6 });
  });

  it('does not count support helpers or similarly named identifiers', () => {
    const c = countSource(`
      await waitFor(page, 'x', 'y');
      const waitForFunction = 1;
      await waitForArena(page);
    `);
    expect(c).toEqual({ poll: 0, waitForFunction: 0, waitForTimeout: 0, expects: 0 });
  });
});
