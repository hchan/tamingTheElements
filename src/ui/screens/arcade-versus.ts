import { CHARACTER_TEXT, getCharacter, type CharacterId } from '@core/index';
import { el } from '../dom';

/**
 * DOM of the Arcade Versus screens (FUN-DESIGN WP 11): the fighter picker and the results. Plain native controls (labelled
 * selects, buttons, links) in the existing menu classes, so keyboard, touch and the 44 px touch rule work without new CSS.
 * Lazy-loaded with the Arcade flow (`src/game/app/arcade-versus.ts`), never part of the menu entry chunk.
 */

export interface PickValues {
  readonly player: string;
  readonly enemy: string;
  readonly level: string;
}

export interface PickViewOptions {
  readonly races: readonly CharacterId[];
  readonly levels: readonly { readonly value: string; readonly label: string }[];
  readonly current: PickValues;
  readonly onStart: (v: PickValues) => void;
}

/** "Sindarosa (fire)": the element word, so the choice never depends on colour or art. */
export function raceLabel(id: CharacterId): string {
  return `${CHARACTER_TEXT.get(id)?.name ?? id} (${getCharacter(id).element})`;
}

function select(id: string, label: string, options: readonly { value: string; label: string }[], value: string): HTMLElement {
  const row = el('div', 'settingsOption');
  const lab = el('label', undefined, label);
  lab.htmlFor = id;
  const input = el('select');
  input.id = id;
  input.name = id;
  for (const o of options) {
    const opt = el('option', undefined, o.label);
    opt.value = o.value;
    opt.selected = o.value === value;
    input.append(opt);
  }
  row.append(lab, ' ', input);
  return row;
}

export function arcadePickView(o: PickViewOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'arcadePick';
  page.append(
    el('h1', 'heading', 'Arcade Versus'),
    el(
      'p',
      undefined,
      'Preview: one fight against the Arcade AI. Hits stun and push, quick follow-ups combo, hits fill your meter, and a full bar fires your super (X, gamepad RT, or the Super button). Nothing is saved: no XP, no capture, no progress.',
    ),
  );
  const races = o.races.map((r) => ({ value: r, label: raceLabel(r) }));
  const form = el('form', 'settingsForm');
  const set = el('fieldset', 'settingsGroup');
  set.append(
    el('legend', 'heading', 'Fighters'),
    select('arcadePlayer', 'Your race', races, o.current.player),
    select('arcadeEnemy', 'AI race', races, o.current.enemy),
    select('arcadeLevel', 'AI level', o.levels, o.current.level),
  );
  const start = el('button', 'menuButton', 'Fight!');
  start.type = 'submit';
  start.id = 'arcadeStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  form.append(set, start, back);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const get = (k: string): string => {
      const v = data.get(k);
      return typeof v === 'string' ? v : '';
    };
    o.onStart({ player: get('arcadePlayer'), enemy: get('arcadeEnemy'), level: get('arcadeLevel') });
  });
  page.append(form);
  return page;
}

export interface ResultsViewOptions {
  readonly heading: string;
  readonly summary: string;
  readonly onRematch: () => void;
  readonly onChange: () => void;
  /** Present when a replay was recorded. */
  readonly onDownload?: () => void;
}

export function arcadeResultsView(o: ResultsViewOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'arcadeResults';
  page.append(el('h1', 'heading', o.heading), el('p', undefined, o.summary));
  const button = (id: string, label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', 'menuButton', label);
    b.type = 'button';
    b.id = id;
    b.addEventListener('click', onClick);
    return b;
  };
  const actions = el('div');
  actions.append(button('arcadeRematch', 'Rematch', o.onRematch), button('arcadeChange', 'Change fighters', o.onChange));
  if (o.onDownload) actions.append(button('downloadReplay', 'Download replay', o.onDownload));
  const menu = el('a', 'menuButton', 'Main Menu');
  menu.href = '#main';
  actions.append(menu);
  page.append(actions);
  return page;
}
