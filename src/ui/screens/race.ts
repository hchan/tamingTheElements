import { ABILITY_NAMES, CHARACTERS, CHARACTER_TEXT } from '@core/index';
import type { CharacterDef } from '@core/index';
import { el } from '../dom';
import type { Screen, ScreenFactory } from './screen';

export function findRace(slug: string | null): CharacterDef | undefined {
  return slug === null ? undefined : CHARACTERS.find((c) => c.id === slug);
}

/** Readonly label/value rows for a race. */
export function raceRows(ch: CharacterDef): readonly (readonly [string, string])[] {
  return [
    ['Element', ch.element],
    ['Alignment', ch.alignment],
    ['Health', String(ch.maxHealth)],
    ['Speed', String(ch.speed)],
    ['Abilities', ch.abilities.map((a) => ABILITY_NAMES.get(a) ?? a).join(', ')],
  ];
}

export const raceScreen: ScreenFactory = (param): Screen => {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      node = el('div', 'menuPage');
      const ch = findRace(param);
      if (ch === undefined) {
        node.append(el('h1', 'heading', 'Unknown race'));
      } else {
        const text = CHARACTER_TEXT.get(ch.id);
        node.append(el('h1', 'heading', text?.name ?? ch.id));
        if (text) node.append(el('p', 'raceDescription', text.description));
        const table = el('table', 'raceTable');
        for (const [k, v] of raceRows(ch)) {
          const tr = el('tr');
          tr.append(el('td', undefined, k), el('td', undefined, v));
          table.append(tr);
        }
        node.append(table);
      }
      const back = el('a', 'menuLink', 'Back');
      back.setAttribute('href', '#main');
      node.append(back);
      container.append(node);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
};
