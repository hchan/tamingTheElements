import { describe, expect, it } from 'vitest';
import { makeAgent } from '../../tools/sim/run-match';

describe('idle agent kind (tools/sim/run-match.ts)', () => {
  it('never sends a command and has no state', () => {
    const a = makeAgent('idle', 'lavax');
    expect(a.id).toBe('idle:lavax');
    expect(a.save()).toBeNull();
    expect(a.observe({} as never, 0)).toBe(0);
  });
});
