import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const hasPython = spawnSync('python3', ['--version']).status === 0;

// 53 tests, each spawning fake pueue/nvidia-smi subprocesses: about 32 s alone, 242 s once under heavy load. The limits are hang
// guards only (the spawn limit is below the vitest one so a hang reports stderr); they assert nothing.
const SPAWN_TIMEOUT_MS = 900_000;
const TEST_TIMEOUT_MS = 960_000;

// The job-server controller is Python (it runs inside WSL on the PC); its unittest suite uses fake pueue/nvidia-smi.
describe.skipIf(!hasPython)('tools/gpu-queue ctl.py unittest suite', () => {
  it('passes', () => {
    const r = spawnSync('python3', ['-W', 'error::ResourceWarning', '-m', 'unittest', 'discover', '-s', 'tools/gpu-queue'], { encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
    expect(r.status, r.stderr).toBe(0);
  }, TEST_TIMEOUT_MS);
});
