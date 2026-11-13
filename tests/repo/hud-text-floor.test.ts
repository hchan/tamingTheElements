import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(p, 'utf8');

describe('HUD accessibility floors (a11y review 2026-11-12)', () => {
  it('tag-view lines and regen text are at least 16px', () => {
    expect(read('src/game/hud/tag-view.ts')).toMatch(/LINE_PX = 16;/);
    expect(read('src/game/scenes/Hud.ts')).toMatch(/this\.text\(16\)\.setOrigin\(team === 0/);
  });
  it('the mirrored action bar is at least 14px', () => {
    expect(read('src/game/hud/action-bar.ts')).toMatch(/this\.mirror \? 14 : 16/);
  });
  it('the saved display size is applied on the menu path', () => {
    expect(read('src/game/app/main.ts')).toMatch(/applyA11y\(save\);\s*applyUiScale\(save\.displaySettings\)/);
  });
  it('the objectives notice says Snag, not Capture', () => {
    expect(read('src/ui/screens/objectives.ts')).not.toMatch(/title: .*Capture/);
  });
});
