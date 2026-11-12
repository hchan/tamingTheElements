import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const claude = resolve(root, '.claude');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const PNPM_BUILTINS = new Set(['install', 'exec', 'run', 'add', 'pkg', 'dlx', 'i', '--version']);
const MODELS = new Set(['opus', 'sonnet', 'haiku']);
const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Bash']);
/** Agents that legitimately write files. */
const WRITERS = new Set(['wp-implementer']);
const PATH_ROOTS = [
  '.claude/', '.github/', 'src/', 'tests/', 'tools/', 'docs/', 'public/', 'war/', 'imgWorkArea/',
  'playwright.', 'vite.config', 'vitest.config', 'tsconfig', 'package.json', 'CLAUDE.md', 'README.md', 'CHANGELOG.md', 'index.html',
];
/** Credentials file: deliberately never read; may be absent in a worktree. */
const IGNORED_PATHS = new Set(['war/WEB-INF/user.properties']);
const PATH_BARE =new Set(['public', 'imgWorkArea', 'src', 'tests', 'tools', 'docs']);

function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of (m[1] as string).split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1] as string] = (kv[2] as string).trim();
  }
  return out;
}

function files(dir: string, name?: string): string[] {
  const d = resolve(claude, dir);
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true })
    .filter((e) => (name === undefined ? e.isFile() && e.name.endsWith('.md') : e.isDirectory()))
    .map((e) => (name === undefined ? resolve(d, e.name) : resolve(d, e.name, name)));
}

const agents = files('agents');
const skills = files('skills', 'SKILL.md');

function references(text: string): { scripts: string[]; paths: string[] } {
  const scripts: string[] = [];
  const paths: string[] = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const span = m[1] as string;
    const pn = /\bpnpm\s+(?:run\s+)?([a-z][\w:-]*)/.exec(span);
    if (pn && !PNPM_BUILTINS.has(pn[1] as string)) scripts.push(pn[1] as string);
    for (const raw of span.split(/\s+/)) {
      if (/[<>*$~{}|]/.test(raw)) continue;
      const tok = raw.replace(/#.*$/, '').replace(/[,;.)]+$/, '');
      const isPath = PATH_BARE.has(tok) || PATH_ROOTS.some((r) => tok.startsWith(r));
      if (isPath && tok !== '') paths.push(tok);
    }
  }
  return { scripts, paths };
}

describe('.claude agents', () => {
  it('has the expected agents', () => {
    const names = agents.map((a) => a.split('/').pop()?.replace(/\.md$/, ''));
    for (const n of [
      'phaser-code-reviewer', 'test-reviewer', 'netcode-reviewer', 'perf-budget-reviewer', 'a11y-ux-reviewer',
      'asset-pipeline-reviewer', 'parity-verifier', 'gameplay-balance-analyst', 'repo-score',
    ]) {
      expect(names).toContain(n);
    }
  });

  it.each(agents.map((a) => [a.split('/').pop() as string, a]))('%s has valid frontmatter', (file, path) => {
    const text = readFileSync(path, 'utf8');
    const fm = frontmatter(text);
    const name = file.replace(/\.md$/, '');
    expect(fm.name).toBe(name);
    expect(fm.description, 'description').toBeTruthy();
    expect(fm.description).toMatch(/\bUse\b/);
    expect(fm.description).toMatch(/\bNOT\b/);
    expect(MODELS.has(fm.model ?? ''), `model ${fm.model ?? 'missing'}`).toBe(true);
    const tools = (fm.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    expect(tools.length).toBeGreaterThan(0);
    if (!WRITERS.has(name)) for (const t of tools) expect(READ_ONLY_TOOLS.has(t), `tool ${t}`).toBe(true);
    if (!WRITERS.has(name)) expect(text).toMatch(/## Report format|## Report/);
  });
});

describe('.claude skills', () => {
  it('has the expected skills', () => {
    const names = skills.map((s) => s.split('/').slice(-2)[0]);
    for (const n of [
      'sim-run', 'balance-report', 'replay', 'e2e-test', 'parity-check', 'add-character', 'add-ability', 'mermaid', 'status',
    ]) {
      expect(names).toContain(n);
    }
  });

  it.each(skills.map((s) => [s.split('/').slice(-2)[0] as string, s]))('%s has valid frontmatter', (dir, path) => {
    const fm = frontmatter(readFileSync(path, 'utf8'));
    expect(fm.name).toBe(dir);
    expect(fm.description, 'description').toBeTruthy();
    if ('allowed-tools' in fm) expect(fm['allowed-tools']).not.toBe('');
    if ('disable-model-invocation' in fm) expect(['true', 'false']).toContain(fm['disable-model-invocation']);
  });
});

describe('.claude references', () => {
  const all = [...agents, ...skills];

  it.each(all.map((f) => [f.slice(claude.length + 1), f]))('%s names only real pnpm scripts and paths', (_rel, path) => {
    const { scripts, paths } = references(readFileSync(path, 'utf8'));
    expect(scripts.filter((s) => !(s in pkg.scripts))).toEqual([]);
    expect([...new Set(paths)].filter((p) => !IGNORED_PATHS.has(p) && !existsSync(resolve(root, p)))).toEqual([]);
  });
});

describe('.claude workflow and settings', () => {
  const wfPath = resolve(claude, 'workflows/full-review.js');

  it('full-review.js parses once wrapped as an async function body', () => {
    const src = readFileSync(wfPath, 'utf8').replace(/^export const meta/m, 'const meta');
    expect(() => new Script(`(async function (args, agent, parallel, phase, log) {\n${src}\n})`)).not.toThrow();
  });

  it('full-review.js only dispatches agents that exist', () => {
    const src = readFileSync(wfPath, 'utf8');
    const types = [...src.matchAll(/agentType: '([\w-]+)'/g)].map((m) => m[1] as string);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) expect(existsSync(resolve(claude, 'agents', `${t}.md`)), t).toBe(true);
  });

  it('settings.json keeps allow-all Bash and the deny list, and hook commands exist', () => {
    const s = JSON.parse(readFileSync(resolve(claude, 'settings.json'), 'utf8')) as {
      permissions: { allow: string[]; deny: string[] };
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    expect(s.permissions.allow).toContain('Bash(*)');
    expect(s.permissions.deny).toEqual(
      expect.arrayContaining(['Read(war/WEB-INF/user.properties)', 'Read(./**/.env*)', 'Bash(rm -rf /*)', 'Bash(curl*|*sh)']),
    );
    for (const groups of Object.values(s.hooks)) {
      for (const g of groups) {
        for (const h of g.hooks) {
          const rel = h.command.replace('$CLAUDE_PROJECT_DIR/', '');
          expect(existsSync(resolve(root, rel)), h.command).toBe(true);
        }
      }
    }
  });
});
