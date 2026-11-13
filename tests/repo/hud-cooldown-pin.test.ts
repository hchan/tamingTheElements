import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARGE_COOLDOWN_TICKS, DASH_COOLDOWN_TICKS } from '../../src/core/data/arcade';

const src = readFileSync(resolve(import.meta.dirname, '../../src/game/hud/action-bar.ts'), 'utf8');

describe('action bar cooldown lengths', () => {
  it('match the core data', () => {
    expect(src).toContain(`export const DASH_COOLDOWN = ${String(DASH_COOLDOWN_TICKS)};`);
    expect(src).toContain(`export const CHARGE_COOLDOWN = ${String(CHARGE_COOLDOWN_TICKS)};`);
  });
});
