import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string): string => readFileSync(resolve(import.meta.dirname, '../../src/game/hud', f), 'utf8');
const pure = read('action-bar.ts');
const view = read('action-bar-view.ts');
const src = pure + view;

describe('every action box shares one cooldown renderer', () => {
  it('has one look function, one sweep, one drawer and one fill call for all slot kinds', () => {
    expect(src.match(/cooldownLook\(/g)).toHaveLength(2); // its definition (pure file) and the one call site (view file)
    expect(src.match(/cooldownSweep\(/g)).toHaveLength(2); // its definition and the call inside cooldownLook
    expect(view.match(/this\.drawCooldown\(/g)).toHaveLength(1);
    expect(view.match(/fillPath\(\)/g)).toHaveLength(1);
  });

  it('keeps action-bar.ts pure: no class, only a type import of Phaser', () => {
    expect(pure).not.toMatch(/\bclass /);
    expect(pure).toMatch(/^import type Phaser from 'phaser';/m);
    expect(pure.match(/from 'phaser'/g)).toHaveLength(1);
  });
});
