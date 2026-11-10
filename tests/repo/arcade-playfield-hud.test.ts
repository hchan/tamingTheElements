import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_INSET_BOTTOM, PLAYFIELD_INSET_TOP, arcadePlayfield } from '../../src/core/data/arcade';

// The sim's Arcade playfield insets (src/core/data/arcade.ts) must not drift from the HUD the view draws over the fixed
// 1280x720 logical canvas (the canvas scales to the window, so logical px are the same at every window size). The view
// constants are read from the source text so this test needs no DOM or Phaser types.

/** The value of `const NAME = <number>;` or `<NAME or number> - <NAME or number>` in a view file. */
function constant(file: string, name: string): number {
  const src = readFileSync(new URL(`../../src/game/${file}`, import.meta.url), 'utf8');
  const m = new RegExp(`const ${name} = ([^;]+);`).exec(src);
  if (m?.[1] === undefined) throw new Error(`${name} not found in ${file}`);
  const term = (t: string): number => (/^\d+$/.test(t) ? Number(t) : constant(file, t));
  const [a, b] = m[1].split(' - ').map((t) => term(t.trim()));
  return b === undefined ? (a ?? 0) : (a ?? 0) - b;
}

describe('Arcade playfield vs the HUD', () => {
  const pf = arcadePlayfield();

  it('the bottom edge is the top of the action bar', () => {
    const barY = constant('hud/action-bar.ts', 'BAR_Y');
    expect(barY).toBe(640);
    expect(pf.y + pf.h).toBe(barY);
    expect(PLAYFIELD_INSET_BOTTOM).toBe(constant('hud/action-bar.ts', 'ACTION_BAR_HEIGHT'));
    expect(pf.y + pf.h + PLAYFIELD_INSET_BOTTOM).toBe(constant('hud/action-bar.ts', 'LOGICAL_HEIGHT'));
    expect(constant('hud/tag-view.ts', 'TAG_SLOT_Y')).toBe(barY);
  });

  it('the top edge clears the bars block, the hyper meters and the weather badge plate', () => {
    expect(PLAYFIELD_INSET_TOP).toBeGreaterThanOrEqual(constant('hud/bars.ts', 'HUD_HEIGHT'));
    expect(PLAYFIELD_INSET_TOP).toBeGreaterThanOrEqual(constant('hud/arcade-hud.ts', 'METER_Y') + constant('hud/arcade-hud.ts', 'SEGMENT_H'));
    // Plate: y BADGE_Y - 4, height the label (28 px text; 1.4x on a phone is 40 px) + the bar + 12.
    const plateBottom =
      constant('fx/weather-view.ts', 'BADGE_Y') - 4 + Math.ceil(constant('fx/weather-view.ts', 'LABEL_PX') * 1.4) + constant('fx/weather-view.ts', 'BAR_H') + 12;
    expect(PLAYFIELD_INSET_TOP).toBeGreaterThanOrEqual(plateBottom);
    // And no looser than needed: at most 4 px of slack over the plate.
    expect(PLAYFIELD_INSET_TOP - plateBottom).toBeLessThanOrEqual(4);
  });
});
