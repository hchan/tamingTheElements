import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SimState.team is per-ENTITY (indexed by entity id); SimState.teams is the per-TEAM block (indexed with
// TEAM_STRIDE / TeamField offsets). Both are Int32Array, so the compiler cannot tell them apart. This guard fails when
// a `.team[...]` index expression looks like a per-team block offset. Use `.teams[...]` for those.
const root = resolve(import.meta.dirname, '../..');
const files = execFileSync('git', ['ls-files', 'src', 'tests'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.ts') && !f.endsWith('no-team-block-alias.test.ts'));

const BLOCK_HINT = /TEAM_|TeamField|STRIDE|\b(cdIndex|countIdx|countIndex|idx|index|base)\b|\*/i;

describe('per-entity team vs per-team block', () => {
  it('never indexes SimState.team with a per-team block offset', () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(resolve(root, f), 'utf8')
        .split('\n')
        .forEach((line, n) => {
          for (const m of line.matchAll(/\.team\[([^\]]*)\]/g)) {
            if (BLOCK_HINT.test(m[1] ?? '')) offenders.push(`${f}:${String(n + 1)}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
