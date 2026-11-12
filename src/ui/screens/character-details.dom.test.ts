// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { levelFromXp, newEmptyState, scaledMaxHealth, type SaveV1 } from '@core/menu-index';
import { characterDetails, characterDetailsScreen } from './character-details';
import type { Screen } from './screen';

const save = (chapter: number, names: string[]): SaveV1 => ({
  ...newEmptyState(),
  chapter,
  garrison: names.map((characterName, i) => ({ id: `h${String(i)}`, experience: 10 * (i + 1), characterName })),
});

let current: { screen: Screen; host: HTMLElement } | null = null;
afterEach(() => {
  current?.screen.unmount();
  current?.host.remove();
  current = null;
});

function mount(s: SaveV1 | null, param: string | null): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const screen = characterDetailsScreen({ load: () => s })(param);
  screen.mount(host);
  current = { screen, host };
  return host;
}

const lines = (root: Element, sel: string): string[] => [...root.querySelectorAll(sel)].map((e) => e.textContent);

describe('character details screen in the DOM', () => {
  it('renders name, portrait, stats and relations for the chosen hero', () => {
    const host = mount(save(1, ['Aqua', 'Fiara']), 'h1');
    expect(host.querySelector('h1')?.textContent).toBe('Fiara');
    expect(lines(host, '.characterStats div')).toEqual([
      `Level ${String(levelFromXp(20))}`,
      'XP 20',
      'Element: fire',
      'Alignment: good',
      `Health: ${String(scaledMaxHealth(130, levelFromXp(20)))}`,
      'Speed: 7',
    ]);
    expect(host.querySelector('.characterStats .element-fire')?.textContent).toBe('Element: fire');
    expect(lines(host, '.characterRelations div')).toEqual(['Strong against: air', 'Weak against: water']);
    const portrait = host.querySelector<HTMLElement>('.detailAvatar');
    expect(portrait?.getAttribute('aria-hidden')).toBe('true');
    expect(portrait?.style.backgroundImage).toContain('assets/img/map/fiara.png');
    expect(host.querySelector('p.raceDescription')?.textContent).toContain('A cousin of phoenixes');
  });

  it('lists one box per ability with its name heading and stat lines, as plain text', () => {
    const s = save(1, ['Fiara']);
    const host = mount(s, 'h0');
    const v = characterDetails({ id: 'h0', characterName: 'Fiara', experience: 10 }, 1);
    const boxes = [...host.querySelectorAll('.characterAbility')];
    expect(boxes.length).toBe(v?.abilities.length);
    expect(boxes.length).toBeGreaterThan(0);
    boxes.forEach((b, i) => {
      expect(b.querySelector('h2')?.textContent).toBe(v?.abilities[i]?.name);
      expect(lines(b, 'div')).toEqual(v?.abilities[i]?.lines);
    });
    expect(host.querySelector('.characterAbility *')).not.toBeNull();
    expect(host.innerHTML).not.toMatch(/<script/i);
  });

  it('shows the Capture ability only after chapter 1 (the chapter comes from the save)', () => {
    const count = (chapter: number): number => mount(save(chapter, ['Fiara']), 'h0').querySelectorAll('.characterAbility').length;
    const c1 = count(1);
    current?.screen.unmount();
    const c2 = count(2);
    expect(c2).toBe(c1 + 1);
  });

  it('says "Unknown character" with a Back link for a missing id, a missing save, no id or an unknown name', () => {
    const cases: [SaveV1 | null, string | null][] = [
      [save(1, ['Fiara']), 'nope'],
      [null, 'h0'],
      [save(1, ['Fiara']), null],
      [save(1, ['NotAHero']), 'h0'],
    ];
    for (const [s, p] of cases) {
      const host = mount(s, p);
      expect(host.querySelector('h1')?.textContent).toBe('Unknown character');
      expect(host.querySelector('.characterStats')).toBeNull();
      expect(host.querySelector('a.menuLink')?.getAttribute('href')).toBe('#garrison');
      current?.screen.unmount();
      host.remove();
    }
  });

  it('keeps the Back link to the garrison on a found hero and removes the page on unmount', () => {
    const host = mount(save(1, ['Terra']), 'h0');
    expect(host.querySelector('a.menuLink')?.getAttribute('href')).toBe('#garrison');
    current?.screen.unmount();
    expect(host.querySelector('.menuPage')).toBeNull();
  });
});
