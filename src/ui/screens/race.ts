import { ABILITY_NAMES, ARCADE_SNAG_SLOT, CHARACTERS, CHARACTER_TEXT, SNAG_DESCRIPTION, SNAG_NAME } from '@core/menu-index';
import type { CharacterDef } from '@core/menu-index';
import { el } from '../dom';
import type { Screen, ScreenFactory } from './screen';

export function findRace(slug: string | null): CharacterDef | undefined {
  return slug === null ? undefined : CHARACTERS.find((c) => c.id === slug);
}

/** Readonly label/value rows for a race; a Snag hero's Snag slot reads "Snag" with its line (FUN-DESIGN 2.20). */
export function raceRows(ch: CharacterDef): readonly (readonly [string, string])[] {
  const snag = ARCADE_SNAG_SLOT[ch.id];
  const names = ch.abilities.map((a, i) => (i === snag ? SNAG_NAME : (ABILITY_NAMES.get(a) ?? a)));
  return [
    ['Element', ch.element],
    ['Alignment', ch.alignment],
    ['Health', String(ch.maxHealth)],
    ['Speed', String(ch.speed)],
    ['Abilities', names.join(', ')],
    ...(snag === undefined ? [] : [[SNAG_NAME, SNAG_DESCRIPTION] as const]),
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
