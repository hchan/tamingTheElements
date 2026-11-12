// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ELEMENTS } from '@core/menu-index';
import { elementDescription, wikiLines, wikiScreen } from './wiki';

afterEach(() => {
  document.body.replaceChildren();
});

const LINE = /^(\w+) elementals will do 25% more damage and take 25% less damage from (\w+) elementals\. {2}However, they will do 25% less damage and take 25% more damage from (\w+) elementals\.$/;

describe('elementDescription / wikiLines', () => {
  it('states strength and weakness with the 25% figure', () => {
    expect(elementDescription('fire')).toMatch(LINE);
  });

  it('is empty for void and gives every other element exactly one line', () => {
    expect(elementDescription('void')).toBe('');
    expect(wikiLines()).toHaveLength(ELEMENTS.length - 1);
  });

  it('is consistent: whoever X is strong against lists X as its weakness', () => {
    const parsed = wikiLines().map((l) => LINE.exec(l) as RegExpExecArray);
    for (const m of parsed) {
      const [, self, strong, weak] = m;
      const other = parsed.find((p) => p[1] === strong);
      expect(other, `${String(self)} beats ${String(strong)}`).toBeDefined();
      expect(other?.[3]).toBe(self);
      expect(strong).not.toBe(weak);
    }
  });
});

describe('wikiScreen', () => {
  it('mounts a heading, the element lines, the void note and a Back link; unmount removes it', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const s = wikiScreen();
    s.mount(host);
    expect(host.querySelector('h1')?.textContent).toBe('Wiki');
    const lines = [...host.querySelectorAll('.wikiLine')].map((p) => p.textContent);
    expect(lines.slice(0, -1)).toEqual([...wikiLines()]);
    expect(lines.at(-1)).toBe('Void elementals are neutral against every element.');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('#main');
    s.unmount();
    expect(host.children).toHaveLength(0);
    s.unmount();
  });
});
