import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffDurations, renderDurations, summarize, type PwResults } from '../../tools/ci/e2e-durations';
import { buildImporters, globToRegExp, grepFor, listSpecs, loadDurations, loadRules, orphanSpecs, selectSpecs, type Durations, type Rules } from '../../tools/ci/touched-specs';

const rules = loadRules();
const durations = loadDurations();
const allSpecs = listSpecs();
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);

const real = (changed: string[], over: { budgetSec?: number; maxTests?: number } = {}) =>
  selectSpecs(changed, rules, durations, allSpecs, { budgetSec: over.budgetSec ?? rules.budgetSec, maxTests: over.maxTests ?? rules.maxTests, importers: buildImporters(), testsIn: () => 0 });

// A small synthetic world for the pure rules.
const smallRules: Rules = {
  schema: 1,
  noE2e: ['docs/**', '**/*.md', 'tools/assets/**'],
  infra: ['vite.config.ts', 'src/game/loop/**'],
  areas: [
    { area: 'tour', globs: ['src/game/app/tour*.ts'], specs: ['tour.spec.ts', 'tour-win.spec.ts'] },
    { area: 'styles', globs: ['src/ui/styles/**'], specs: ['responsive.spec.ts', 'help-controls.spec.ts'], narrow: 'stem' },
    { area: 'png', globs: ['tools/assets/png-lite.ts'], specs: ['sprite.spec.ts'] },
  ],
  broadAlways: ['golden.spec.ts'],
  broadCapSec: 100,
  budgetSec: 1000,
  maxTests: 50,
};
const smallSpecs = ['tour.spec.ts', 'tour-win.spec.ts', 'tour-card.spec.ts', 'responsive.spec.ts', 'help-controls.spec.ts', 'sprite.spec.ts', 'golden.spec.ts', 'match-end.spec.ts', 'sub/x.spec.ts'];
const smallDur: Durations = {
  schema: 1,
  source: 't',
  sha: 's',
  recordedAt: 'r',
  smoke: { sec: 100, tests: 10 },
  specs: Object.fromEntries(smallSpecs.map((s, i) => [s, { sec: 10 * (i + 1), tests: 2 }])),
};
const small = (changed: string[], o: { budgetSec?: number; maxTests?: number; importers?: Record<string, string[]> } = {}) =>
  selectSpecs(changed, smallRules, smallDur, smallSpecs, { budgetSec: o.budgetSec ?? 1000, maxTests: o.maxTests ?? 50, importers: (f) => o.importers?.[f] ?? [], testsIn: () => 0 });

describe('globToRegExp', () => {
  it('handles **, *, ? and braces', () => {
    expect(globToRegExp('src/core/**').test('src/core/sim/match.ts')).toBe(true);
    expect(globToRegExp('src/core/**').test('src/corex/a.ts')).toBe(false);
    expect(globToRegExp('**/*.md').test('README.md')).toBe(true);
    expect(globToRegExp('**/*.md').test('docs/a/b.md')).toBe(true);
    expect(globToRegExp('src/game/app/tour*.ts').test('src/game/app/tour-card.ts')).toBe(true);
    expect(globToRegExp('src/game/app/tour*.ts').test('src/game/app/x/tour.ts')).toBe(false);
    expect(globToRegExp('a/?.ts').test('a/b.ts')).toBe(true);
    expect(globToRegExp('a/?.ts').test('a/bc.ts')).toBe(false);
    const br = globToRegExp('src/ui/{router,dom}.ts');
    expect(br.test('src/ui/router.ts')).toBe(true);
    expect(br.test('src/ui/dom.ts')).toBe(true);
    expect(br.test('src/ui/domx.ts')).toBe(false);
    expect(globToRegExp('tests/{repo,sim}/**').test('tests/sim/a/b.ts')).toBe(true);
  });
  it('escapes regex metacharacters', () => {
    expect(globToRegExp('a.b').test('axb')).toBe(false);
    expect(globToRegExp('a.b').test('a.b')).toBe(true);
    expect(globToRegExp('a+b').test('a+b')).toBe(true);
  });
});

describe('grepFor', () => {
  it('is @smoke alone for no specs and one alternation otherwise', () => {
    expect(grepFor([])).toBe('@smoke');
    expect(grepFor(['arcade.spec.ts', 'parity/golden-paths.spec.ts'])).toBe('@smoke|(^| )(arcade\\.spec\\.ts|parity/golden-paths\\.spec\\.ts)( |$)');
  });
  it('matches the spec path in a full title and not a longer file name', () => {
    const re = new RegExp(grepFor(['arcade.spec.ts']));
    expect(re.test('arcade.spec.ts on by default: the menu has five entries')).toBe(true);
    expect(re.test('arcade-local.spec.ts something')).toBe(false);
    expect(re.test('x.spec.ts has @smoke in it')).toBe(true);
  });
});

describe('selectSpecs rules', () => {
  it('selects nothing for noE2e paths only', () => {
    const s = small(['docs/a.md', 'README.md', 'tools/assets/x.ts']);
    expect(s.noE2e).toBe(true);
    expect(s.specs).toEqual([]);
    expect(grepFor(s.noE2e ? [] : s.specs)).toBe('@smoke');
  });
  it('a changed spec is selected, never deferred, even over budget', () => {
    const s = small(['tests/e2e/golden.spec.ts'], { budgetSec: 1, maxTests: 1 });
    expect(s.specs).toEqual(['golden.spec.ts']);
    expect(s.reasons['golden.spec.ts']).toBe('changed');
    expect(s.deferred).toEqual([]);
  });
  it('a deleted spec goes to removed', () => {
    const s = small(['tests/e2e/gone.spec.ts']);
    expect(s.removed).toEqual(['gone.spec.ts']);
    expect(s.specs).toEqual([]);
  });
  it('a helper selects its importers, and none or too many means broad', () => {
    expect(small(['tests/e2e/h.ts'], { importers: { 'h.ts': ['tour.spec.ts'] } }).specs).toEqual(['tour.spec.ts']);
    const none = small(['tests/e2e/fixture.json']);
    expect(none.broad).toBe(true);
    const many = small(['tests/e2e/h.ts'], { importers: { 'h.ts': Array.from({ length: 21 }, (_, i) => `s${String(i)}.spec.ts`) } });
    expect(many.broad).toBe(true);
  });
  it('infra paths are broad and still add their area specs', () => {
    const s = small(['vite.config.ts']);
    expect(s.broad).toBe(true);
    expect(s.specs).toContain('golden.spec.ts');
  });
  it('the stem rule picks <stem>.spec and <stem>-*.spec, not other prefixes', () => {
    const s = small(['src/game/app/tour.ts']);
    expect(s.specs).toEqual(expect.arrayContaining(['tour.spec.ts', 'tour-card.spec.ts', 'tour-win.spec.ts']));
    expect(s.reasons['tour-card.spec.ts']).toBe('stem tour');
    expect(s.reasons['tour-win.spec.ts']).toBe('stem tour');
  });
  it('a narrow:stem row is skipped when the stem found a spec, used otherwise', () => {
    const hit = small(['src/ui/styles/match-end.css']);
    expect(hit.specs).toContain('match-end.spec.ts');
    expect(hit.specs).not.toContain('responsive.spec.ts');
    const miss = small(['src/ui/styles/other.css']);
    expect(miss.specs).toEqual(expect.arrayContaining(['responsive.spec.ts', 'help-controls.spec.ts']));
    expect(miss.broad).toBe(false);
  });
  it('an src file that selects nothing is broad', () => {
    expect(small(['src/zzz/unknown.ts']).broad).toBe(true);
  });
  it('an area glob wins over a noE2e directory (png-lite)', () => {
    const s = small(['tools/assets/png-lite.ts']);
    expect(s.noE2e).toBe(false);
    expect(s.specs).toContain('sprite.spec.ts');
  });
  it('any other path selects @smoke only', () => {
    const s = small(['tools/ci/e2e-route.ts', '.eslintrc.cjs']);
    expect(s.noE2e).toBe(false);
    expect(s.specs).toEqual([]);
    expect(s.broad).toBe(false);
  });
});

describe('selectSpecs budget', () => {
  it('defers lower-priority specs that do not fit, cheapest first, and keeps priority 0', () => {
    // changed spec (p0, 70 s) + area specs (p2: 10 s tour... see smallDur) with a tight budget
    const s = small(['tests/e2e/sprite.spec.ts', 'src/game/app/tour-card.ts'], { budgetSec: 100 + 60 + 15 });
    expect(s.specs).toContain('sprite.spec.ts');
    expect(s.estSec).toBeLessThanOrEqual(175 + 70);
    expect(s.deferred.length).toBeGreaterThan(0);
    for (const d of s.deferred) expect(s.reasons[d]).toMatch(/deferred to nightly \(budget\)$/);
    for (const d of s.deferred) expect(s.specs).not.toContain(d);
  });
  it('respects maxTests for non-changed specs', () => {
    const s = small(['src/game/app/tour.ts'], { maxTests: 10 + 2 });
    expect(s.estTests).toBeLessThanOrEqual(12);
    expect(s.deferred.length).toBeGreaterThan(0);
  });
  it('broad adds broadAlways and cheapest area specs within broadCapSec', () => {
    const s = small(['vite.config.ts']);
    expect(s.specs).toContain('golden.spec.ts');
    expect(s.estSec).toBeGreaterThan(smallDur.smoke.sec);
  });
  it('prices a spec missing from the durations by its test( count, else 120 s', () => {
    const a = selectSpecs(['tests/e2e/new.spec.ts'], smallRules, smallDur, [...smallSpecs, 'new.spec.ts'], { budgetSec: 1000, maxTests: 50, importers: () => [], testsIn: () => 3 });
    expect(a.estSec).toBe(100 + 75);
    expect(a.estTests).toBe(13);
    const b = selectSpecs(['tests/e2e/new.spec.ts'], smallRules, smallDur, [...smallSpecs, 'new.spec.ts'], { budgetSec: 1000, maxTests: 50, importers: () => [], testsIn: () => 0 });
    expect(b.estSec).toBe(220);
  });
});

describe('selectSpecs on the real rules', () => {
  it('src/game/app/tour.ts selects tour, tour-fight-match and tour-win', () => {
    const s = real(['src/game/app/tour.ts']);
    expect(s.specs).toEqual(expect.arrayContaining(['tour.spec.ts', 'tour-fight-match.spec.ts', 'tour-win.spec.ts']));
    expect(s.noE2e).toBe(false);
  });
  it('a docs-only change selects nothing', () => {
    expect(real(['docs/TESTING.md', 'ideas/brainstorm/x.md', '.claude/agents/a.md']).noE2e).toBe(true);
  });
  it('a change to parity/helpers.ts is broad (more than 20 importers)', () => {
    const s = real(['tests/e2e/parity/helpers.ts']);
    expect(s.broad).toBe(true);
    expect(s.specs).toContain('parity/golden-paths.spec.ts');
  });
  it('transport files select @smoke only', () => {
    for (const f of ['tools/ci/e2e-route.ts', 'tools/ci/pc-job.ts', 'tools/ci/gate.ts', 'tools/ci/touched-specs.ts', 'tools/ci/redact.ts']) {
      const s = real([f]);
      expect(s.specs, f).toEqual([]);
      expect(s.broad, f).toBe(false);
    }
  });
  it('the game loop is broad', () => {
    expect(real(['src/game/loop/fixed-step.ts']).broad).toBe(true);
  });
  it('the CLI-free selection is deterministic', () => {
    const a = real(['src/game/hud/touch-overlay.ts', 'src/game/fx/ability-fx.ts']);
    expect(real(['src/game/fx/ability-fx.ts', 'src/game/hud/touch-overlay.ts'])).toEqual(a);
  });
});

describe('touched-specs.json', () => {
  it('lists only specs that exist', () => {
    const known = new Set(allSpecs);
    for (const a of rules.areas) for (const s of a.specs) expect(known.has(s), `${a.area}: ${s}`).toBe(true);
    for (const s of rules.broadAlways) expect(known.has(s)).toBe(true);
  });
  it('has unique area names and every glob matches at least one tracked file', () => {
    expect(new Set(rules.areas.map((a) => a.area)).size).toBe(rules.areas.length);
    const groups: [string, string[]][] = [...rules.areas.flatMap((a) => a.globs.map((g): [string, string[]] => [g, [a.area]])), ...rules.noE2e.map((g): [string, string[]] => [g, ['noE2e']]), ...rules.infra.map((g): [string, string[]] => [g, ['infra']])];
    for (const [g, who] of groups) {
      const re = globToRegExp(g);
      expect(
        tracked.some((f) => re.test(f)),
        `${who[0] ?? ''}: ${g}`,
      ).toBe(true);
    }
  });
  it('noE2e directories are not used by any e2e spec', () => {
    const dirs = rules.noE2e.flatMap((g) => {
      const m = /^tests\/\{([^}]+)\}\/\*\*$/.exec(g);
      return m ? (m[1] as string).split(',').map((d) => `tests/${d}`) : [];
    });
    for (const f of listSpecs()) {
      const src = readFileSync(`tests/e2e/${f}`, 'utf8');
      for (const d of dirs) expect(src.includes(d), `${f} mentions ${d}`).toBe(false);
    }
    // fixtures/legacy and tools/assets/png-lite.ts are used by e2e, so they must not be noE2e-only.
    const helpers = readFileSync('tests/e2e/parity/helpers.ts', 'utf8');
    expect(helpers).toContain('fixtures/legacy');
    expect(rules.noE2e.some((g) => /fixtures\/\{[^}]*legacy/.test(g) || g === 'tests/fixtures/legacy/**')).toBe(false);
  });
  it('keeps the transport files out of the infra list', () => {
    for (const f of ['tools/ci/e2e-route.ts', 'tools/ci/gate.ts', 'tools/ci/pc-job.ts']) expect(rules.infra.some((g) => globToRegExp(g).test(f))).toBe(false);
  });
  it('has few orphans', () => {
    const src = tracked.filter((f) => f.startsWith('src/'));
    expect(orphanSpecs(allSpecs, rules, src).length).toBeLessThanOrEqual(5);
  });
});

describe('e2e-durations.json', () => {
  it('has a positive smoke aggregate and a mostly complete spec list', () => {
    expect(durations.smoke.tests).toBeGreaterThanOrEqual(10);
    expect(durations.smoke.sec).toBeGreaterThan(0);
    const known = new Set(allSpecs);
    const stale = Object.keys(durations.specs).filter((s) => !known.has(s));
    expect(stale).toEqual([]);
    const missing = allSpecs.filter((s) => !durations.specs[s]);
    expect(missing.length).toBeLessThanOrEqual(10);
  });
  it('is rendered in the canonical form (sorted keys, one spec per line)', () => {
    expect(readFileSync('tools/ci/e2e-durations.json', 'utf8')).toBe(renderDurations(durations));
  });
  it('marks the specs that were sped up after the seed run as upper bounds', () => {
    for (const s of ['super-band.spec.ts']) expect(durations.specs[s]?.upperBound).toBe(true);
  });
});

describe('e2e-durations tool', () => {
  const res: PwResults = {
    config: { rootDir: '/x/tests/e2e' },
    suites: [
      {
        title: 'a.spec.ts',
        specs: [
          { title: 't1', file: 'a.spec.ts', tags: ['smoke'], tests: [{ results: [{ duration: 1500 }, { duration: 999 }] }] },
          { title: 't2', file: 'a.spec.ts', tests: [{ results: [{ duration: 500 }] }] },
        ],
        suites: [{ title: 'inner', specs: [{ title: 't3 @smoke', file: 'sub/b.spec.ts', tests: [{ results: [{ duration: 3000 }] }] }] }],
      },
    ],
  };
  const meta = { source: 's', sha: 'abc', recordedAt: 'now' };
  it('sums the first result per test, counts tests, and aggregates smoke', () => {
    const d = summarize(res, meta, ['sub/b.spec.ts']);
    expect(d.specs['a.spec.ts']).toEqual({ sec: 2, tests: 2 });
    expect(d.specs['sub/b.spec.ts']).toEqual({ sec: 3, tests: 1, upperBound: true });
    expect(d.smoke).toEqual({ sec: 5, tests: 2 });
  });
  it('renders sorted keys, one spec per line, and the output parses back', () => {
    const d = summarize(res, meta);
    const text = renderDurations(d);
    expect(JSON.parse(text)).toEqual(d);
    expect(text.split('\n').filter((l) => l.includes('.spec.ts'))).toHaveLength(2);
    expect(text.indexOf('a.spec.ts')).toBeLessThan(text.indexOf('sub/b.spec.ts'));
  });
  it('diffs moves over 20 percent, additions and removals', () => {
    const a: Durations = { ...smallDur, specs: { 'a.spec.ts': { sec: 100, tests: 1 }, 'b.spec.ts': { sec: 100, tests: 1 }, 'c.spec.ts': { sec: 100, tests: 1 } } };
    const b: Durations = { ...smallDur, specs: { 'a.spec.ts': { sec: 115, tests: 1 }, 'b.spec.ts': { sec: 130, tests: 1 }, 'd.spec.ts': { sec: 1, tests: 1 } } };
    expect(diffDurations(a, b)).toEqual({ moved: [{ spec: 'b.spec.ts', from: 100, to: 130 }], added: ['d.spec.ts'], removed: ['c.spec.ts'] });
  });
});

describe('buildImporters', () => {
  it('finds the specs that import a helper, transitively', () => {
    const imp = buildImporters();
    expect(imp('parity/helpers.ts').length).toBeGreaterThan(20);
    expect(imp('parity/helpers.ts')).toContain('arcade.spec.ts');
    expect(imp('does-not-exist.ts')).toEqual([]);
  });
});
