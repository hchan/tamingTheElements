import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const hasPython = spawnSync('python3', ['--version']).status === 0;

// The job-server controller is Python (it runs inside WSL on the PC); its unittest suite uses fake pueue/nvidia-smi.
describe.skipIf(!hasPython)('tools/gpu-queue ctl.py unittest suite', () => {
  it('passes', () => {
    const r = spawnSync('python3', ['-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tools/gpu-queue'], { encoding: 'utf8', timeout: 240_000 });
    expect(r.status, r.stderr).toBe(0);
  }, 300_000);
});
