import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(resolve(import.meta.dirname, '../../src/game/hud/action-bar.ts'), 'utf8');

describe('every action box shares one cooldown renderer', () => {
  it('has one look function, one sweep, one drawer and one fill call for all slot kinds', () => {
    expect(src.match(/cooldownLook\(/g)).toHaveLength(2); // its definition and the one call site
    expect(src.match(/cooldownSweep\(/g)).toHaveLength(2); // its definition and the call inside cooldownLook
    expect(src.match(/this\.drawCooldown\(/g)).toHaveLength(1);
    expect(src.match(/fillPath\(\)/g)).toHaveLength(1);
  });
});
