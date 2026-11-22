import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const css = readFileSync(resolve(root, 'src/ui/styles/picker-min-text.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('Versus / World Tour picker text stays at least 14 px on desktop (picker QA sweep at 1280x720 and 1920x1080)', () => {
  it('floors the hero panel key hints, descriptions, group headers, chips and stack text', () => {
    const m = /([^{}]*)\{\s*font-size:\s*max\(14px,\s*var\(--pmt-em,\s*0\.85em\)\);\s*\}/.exec(css);
    expect(m, 'shared floor rule').not.toBeNull();
    for (const sel of ['.heroKey', '.heroAbilityDesc', '.heroAbilitiesTitle', '.heroStyleWord', '.heroBlurb', '.heroGroup', '.vsChip', '.tsNext', '.vsAbility']) {
      expect(m?.[1], sel).toContain(sel);
    }
  });
  it('keeps the old em ratio per element (no shrink above 14 px)', () => {
    expect(css).toMatch(/\.heroAbilityDesc \{ --pmt-em: 0\.75em; \}/);
    expect(css).toMatch(/\.heroKey \{ --pmt-em: 0\.85em; \}/);
  });
  it('Versus tile names get a 14 px floor outside the wide-window rule', () => {
    expect(css).toMatch(/#arcadePick \.heroGrid\[data-cols\] \.heroTileName\.heroTileName \{\s*font-size:\s*max\(14px,\s*0\.85em\)/);
  });
  it('stack ability chips stay one line with an ellipsis so slot 3 stays above the Fight bar at 720p', () => {
    const m = /\.teamStack \.vsAbility \{([^}]*white-space[^}]*)\}/.exec(css);
    expect(m?.[1]).toMatch(/white-space:\s*nowrap/);
    expect(m?.[1]).toMatch(/text-overflow:\s*ellipsis/);
  });
  it('is loaded by both pickers', () => {
    for (const f of ['tour.ts', 'arcade-versus.ts']) {
      expect(readFileSync(resolve(root, 'src/ui/screens', f), 'utf8')).toContain("import '../styles/picker-min-text.css';");
    }
  });
});
