import { CHARACTER_TEXT, getCharacter, type CharacterId } from '@core/index';
import { el } from '../dom';

/** Key help for the two-player option (the defaults; Player 1's keys can be rebound on Key Bindings). */
const P1_HELP = 'W A S D or arrows move, Space attack, Enter second attack, E dash, Q guard, X super, R weather, H charge, 3 tag';
const P2_HELP = 'I J K L move, U attack, O second attack, Y dash, N guard, B super, T weather, G charge, V tag';

/**
 * DOM of the Arcade Versus screens (FUN-DESIGN WP 11): the fighter picker and the results. Plain native controls (labelled
 * selects, buttons, links) in the existing menu classes, so keyboard, touch and the 44 px touch rule work without new CSS.
 * Lazy-loaded with the Arcade flow (`src/game/app/arcade-versus.ts`), never part of the menu entry chunk.
 */

export interface PickValues {
  readonly player: string;
  readonly enemy: string;
  readonly level: string;
  /**
   * '1' (1v1), '2' (2v2 tag team, WP-arcade-tag-view) or '3' (3v3, WP-arcade-3v3); the partner is the player's second
   * race (2v2 and 3v3), partner2 the third (3v3 only).
   */
  readonly size?: string;
  readonly partner?: string;
  readonly partner2?: string;
  /** 'ai' (default) or 'local': two players on this computer. */
  readonly mode?: string;
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
      'Preview: one fight against the Arcade AI, 1v1, or a 2v2 or 3v3 tag team. Hits stun and push, quick follow-ups combo, hits fill your meter, and a full bar fires your super (X, gamepad RT, or the Super button). In a tag team, Tag (3, gamepad LB, or the Tag button) brings your partner in with an attack (in 3v3, Tag 2 on 4, gamepad RB, or the Tag 2 button brings the other one), and a benched hero wins back its red life. Nothing is saved: no XP, no capture, no progress.',
    ),
  );
  const races = o.races.map((r) => ({ value: r, label: raceLabel(r) }));
  const form = el('form', 'settingsForm');
  const setText = (id: string, text: string): void => {
    const l = form.querySelector(`label[for="${id.replace('Label', '')}"]`);
    if (l) l.textContent = text;
  };
  const hint = el('p', undefined, `Two players share this keyboard. Player 1: ${P1_HELP}. Player 2: ${P2_HELP}. Each player may also use a gamepad (the first one connected is Player 1, the second Player 2).`);
  hint.id = 'arcadeLocalHelp';
  const set = el('fieldset', 'settingsGroup');
  set.append(
    el('legend', 'heading', 'Fighters'),
    select('mode', 'Opponent', [{ value: 'ai', label: 'Arcade AI' }, { value: 'local', label: 'Two players (this computer)' }], o.current.mode),
    select('size', 'Team', [{ value: '1', label: '1v1' }, { value: '2', label: '2v2 tag team' }, { value: '3', label: '3v3 tag team' }], o.current.size),
    select('player', 'Your race', races, o.current.player),
    select('partner', 'Your partner (2v2)', races, o.current.partner),
    select('partner2', 'Your third hero (3v3)', races, o.current.partner2),
    select('enemy', 'AI race', races, o.current.enemy),
    select('level', 'AI level', o.levels, o.current.level),
  );
  const start = el('button', 'menuButton', 'Fight!');
  start.type = 'submit';
  start.id = 'arcadeStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  form.append(set, hint, start, back);
  // The partner counts in 2v2 and 3v3, the third hero in 3v3 only: disabled otherwise (out of the Tab order and the form data). The AI's comes from the seed.
  const f = form.elements as unknown as Record<string, HTMLSelectElement>;
  const sync = (): void => {
    const local = f['mode']?.value === 'local';
    (f['partner'] as HTMLSelectElement).disabled = local || f['size']?.value === '1';
    (f['partner2'] as HTMLSelectElement).disabled = local || f['size']?.value !== '3';
    (f['size'] as HTMLSelectElement).disabled = local;
    (f['level'] as HTMLSelectElement).disabled = local;
    setText('arcadeEnemyLabel', local ? 'Player 2 race' : 'AI race');
    setText('arcadePlayerLabel', local ? 'Player 1 race' : 'Your race');
    hint.hidden = !local;
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
