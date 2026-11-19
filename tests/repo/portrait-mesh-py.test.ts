import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const hasPython = spawnSync('python3', ['--version']).status === 0;
const hasLibs = hasPython && spawnSync('python3', ['-c', 'import numpy, PIL']).status === 0;

// tools/assets/portrait-rig/mesh.py (seam mesh + geodesic weights) is Python; its unittest suite uses synthetic RGBA.
describe.skipIf(!hasLibs)('tools/assets/portrait-rig mesh.py unittest suite', () => {
  it('passes', () => {
    const r = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tools/assets/portrait-rig', '-p', 'test_mesh.py'], { encoding: 'utf8', timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
  }, 150_000);
});
