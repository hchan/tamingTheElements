// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { guideContent } from './guide';
import { HELP_LINKS } from './help';

afterEach(() => {
  document.body.replaceChildren();
});

describe('guide screen (DOM)', () => {
  it('shows the wheel, ability cards and weather cards and links back to Help', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const s = guideContent();
    s.mount(root);
    expect(root.querySelector('h1')?.textContent).toBe('Guide');
    expect(root.querySelectorAll('svg.guideWheel g.guideArrow')).toHaveLength(4);
    expect(root.querySelectorAll('svg.guideWheel g.guideNode')).toHaveLength(4);
    expect(root.querySelectorAll('.guideCommon')).toHaveLength(8);
    expect(root.querySelectorAll('.guideElemental')).toHaveLength(4);
    expect(root.querySelectorAll('.guideWeather')).toHaveLength(5);
    expect(root.querySelector('a.guideBack')?.getAttribute('href')).toBe('#help');
    expect(root.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
    s.unmount();
    expect(root.children).toHaveLength(0);
  });

  it('is linked from Help', () => {
    expect(HELP_LINKS.some((l) => l.route === 'guide' && l.label === 'Guide')).toBe(true);
  });
});
