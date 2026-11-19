import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const hasPython = spawnSync('python3', ['--version']).status === 0;

// tools/assets/portrait-rig/body_plans (landmark-driven rig templates: quadruped first) is pure Python; its unittest suite needs no numpy.
describe.skipIf(!hasPython)('tools/assets/portrait-rig body_plans unittest suite', () => {
  it('passes', () => {
    const r = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tools/assets/portrait-rig', '-p', 'test_plan_*.py'], { encoding: 'utf8', timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
  }, 150_000);
});
