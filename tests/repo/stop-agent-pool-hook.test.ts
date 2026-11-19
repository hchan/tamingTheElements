import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const hook = resolve(import.meta.dirname, '../../.claude/hooks/stop-agent-pool.sh');
const dirs: string[] = [];

function run(root: string, input: string, env: Record<string, string> = { TTE_AGENT_POOL: '1' }): number {
  const r = spawnSync('bash', [hook], {
    input,
    env: { ...process.env, TTE_AGENT_POOL: '', CLAUDE_PROJECT_DIR: root, TTE_AGENT_OUTPUT_ROOT: root, ...env },
    encoding: 'utf8',
  });
  return r.status ?? -1;
}

function makeRoot(files: Array<{ session: string; name: string; ageSec: number }>): string {
  const root = mkdtempSync(join(tmpdir(), 'tte-pool-'));
  dirs.push(root);
  for (const f of files) {
    const d = join(root, 'proj', f.session, 'tasks');
    mkdirSync(d, { recursive: true });
    const p = join(d, f.name);
    writeFileSync(p, 'x');
    const t = new Date(Date.now() - f.ageSec * 1000);
    utimesSync(p, t, t);
  }
  return root;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const fresh = (session: string, name: string) => ({ session, name, ageSec: 5 });

describe('stop-agent-pool hook', () => {
  it('is opt-in: does nothing without TTE_AGENT_POOL=1 or the marker file', () => {
    const root = makeRoot([fresh('s1', 'agent-a.output')]);
    expect(run(root, '{"session_id":"s1"}', {})).toBe(0);
    expect(run(root, '{"session_id":"s1"}')).toBe(2);
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude/agent-pool.on'), '');
    expect(run(root, '{"session_id":"s1"}', {})).toBe(2);
  });
  it('blocks when fewer than 2 of this session agents are growing', () => {
    const root = makeRoot([fresh('s1', 'agent-a.output'), fresh('other', 'agent-b.output'), fresh('other', 'agent-c.output')]);
    expect(run(root, '{"session_id":"s1"}')).toBe(2);
  });
  it('allows when 2 agents of this session are growing', () => {
    const root = makeRoot([fresh('s1', 'agent-a.output'), fresh('s1', 'agent-b.output')]);
    expect(run(root, '{"session_id":"s1"}')).toBe(0);
  });
  it('ignores stale outputs and non-agent task outputs', () => {
    const root = makeRoot([
      fresh('s1', 'agent-a.output'),
      { session: 's1', name: 'agent-old.output', ageSec: 3600 },
      fresh('s1', 'bash-1.output'),
    ]);
    expect(run(root, '{"session_id":"s1"}')).toBe(2);
  });
  it('honours stop_hook_active, missing session_id and missing root', () => {
    const root = makeRoot([]);
    expect(run(root, '{"session_id":"s1","stop_hook_active":true}')).toBe(0);
    expect(run(root, '{}')).toBe(0);
    expect(run(join(root, 'nope'), '{"session_id":"s1"}')).toBe(0);
  });
});
