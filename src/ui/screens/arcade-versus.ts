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
  /** '1' (1v1) or '2' (2v2 tag team, WP-arcade-tag-view); the partner is the player's second race (2v2 only). */
  readonly size?: string;
  readonly partner?: string;
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

/** A labelled select with id `arcade<Name>`; `name` is the `PickValues` key it fills. */
function select(name: string, label: string, options: readonly { value: string; label: string }[], value = ''): HTMLElement {
  const id = `arcade${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
  const row = el('div', 'settingsOption');
  const lab = el('label', undefined, label);
  lab.htmlFor = id;
  const input = el('select');
  input.id = id;
  input.name = name;
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
      'Preview: one fight against the Arcade AI, 1v1 or 2v2 tag team. Hits stun and push, quick follow-ups combo, hits fill your meter, and a full bar fires your super (X, gamepad RT, or the Super button). In 2v2, Tag (3, gamepad LB, or the Tag button) brings your partner in with an attack, and a benched hero wins back its red life. Nothing is saved: no XP, no capture, no progress.',
    ),
  );
  const races = o.races.map((r) => ({ value: r, label: raceLabel(r) }));
  const form = el('form', 'settingsForm');
  const set = el('fieldset', 'settingsGroup');
  set.append(
    el('legend', 'heading', 'Fighters'),
    select('size', 'Team', [{ value: '1', label: '1v1' }, { value: '2', label: '2v2 tag team' }], o.current.size),
    select('player', 'Your race', races, o.current.player),
    select('partner', 'Your partner (2v2)', races, o.current.partner),
    select('enemy', 'AI race', races, o.current.enemy),
    select('level', 'AI level', o.levels, o.current.level),
  );
  const start = el('button', 'menuButton', 'Fight!');
  start.type = 'submit';
  start.id = 'arcadeStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  form.append(set, start, back);
  // The partner counts in 2v2 only: disabled in 1v1 (out of the Tab order and the form data). The AI's comes from the seed.
  const f = form.elements as unknown as Record<string, HTMLSelectElement>;
  const sync = (): void => {
    (f['partner'] as HTMLSelectElement).disabled = f['size']?.value !== '2';
  };
  sync();
  form.addEventListener('change', sync);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    o.onStart(Object.fromEntries(new FormData(form)) as unknown as PickValues);
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
