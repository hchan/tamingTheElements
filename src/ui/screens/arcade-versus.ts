import { type CharacterId } from '@core/index';
import { CHARACTERS } from '@core/menu-index';
import { el, jumpToFightChip, markMoreBelow } from '../dom';
import { faceUrl } from './hero-panel';
import { heroLife, raceLabel, rosterView } from './roster-view';
import '../styles/picker-compact.css';
import '../styles/picker-min-text.css';
import '../styles/match-end.css';

// Moved to roster-view.ts (shared with the tour); callers keep importing them from here.
export { heroLife, raceLabel };

/**
 * Battle keys for the two-player option, as (action word, keys) pairs for the cheat sheet (Player 1's are the defaults and can be
 * rebound on Key Bindings; Player 2's are fixed, `src/game/input/local-two.ts`).
 */
const P1_KEYS: readonly (readonly [string, string])[] = [
  ['Move', 'W A S D'], ['Attack', 'Space'], ['2nd attack', 'Enter'], ['Dash', 'E'], ['Guard', 'Q'], ['Super', 'X'], ['Weather', 'R'],
  ['Charge', 'H'], ['Trap', 'Z'], ['Element', 'V'], ['Tag', '3'], ['Tag 2', '4'],
];
const P2_KEYS: readonly (readonly [string, string])[] = [
  ['Move', 'I J K L'], ['Attack', 'U'], ['2nd attack', 'O'], ['Dash', 'Y'], ['Guard', 'N'], ['Super', 'B'], ['Weather', 'T'],
  ['Charge', 'G'], ['Trap', 'M'], ['Element', ';'], ['Tag', '.'], ['Tag 2', ','],
];
/** The picker's own keys (not the battle keys): move the cursor, pick, undo the last pick, swap it with the hero before. */
const P1_PICK = 'On this screen: W A S D move the cursor, Space picks, Q cancels, E picks a random hero.';
const P2_PICK = 'On this screen: I J K L move the cursor, U picks, O cancels, P picks a random hero.';

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
  /** Player 2's second and third hero (local two-player, WP-pvp-3heroes). */
  readonly enemyPartner?: string;
  readonly enemyPartner2?: string;
  /** 'ai' (default) or 'local': two players on this computer. */
  readonly mode?: string;
  /** 'fire', 'water', 'earth' or 'air'; '' (or absent) for a random arena. */
  readonly stage?: string;
}

export interface PickViewOptions {
  readonly races: readonly CharacterId[];
  readonly levels: readonly { readonly value: string; readonly label: string }[];
  readonly current: PickValues;
  readonly onStart: (v: PickValues) => void;
}

/** A labelled select with id `arcade<Name>`; `name` is the `PickValues` key it fills. */
export function select(name: string, label: string, options: readonly { value: string; label: string }[], value = '', heroes = false): HTMLElement {
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
  if (value !== '') input.value = value;
  if (heroes) {
    // A hero picker voices its clicks as the picked hero's element (ui-sfx reads the nearest data-element).
    const tag = (): void => {
      const e = CHARACTERS.find((c) => c.id === input.value)?.element;
      if (e === undefined) delete row.dataset['element'];
      else row.dataset['element'] = e;
    };
    tag();
    input.addEventListener('change', tag);
  }
  row.append(lab, ' ', input);
  return row;
}

/**
 * Styled replacement for a native select (Opponent, Team, AI level): a radio group of buttons over the real select, which stays in
 * the DOM (same id, name and value, hidden from sight, Tab and assistive tech) so form data, labels and probes are unchanged.
 * Returns a refresh to call after the select was changed by code.
 */
function segmented(row: HTMLElement, describedBy?: string): () => void {
  const input = row.querySelector('select');
  if (!input) return () => undefined;
  input.tabIndex = -1;
  input.classList.add('vsNativeTwin');
  input.setAttribute('aria-hidden', 'true');
  const group = el('div', 'vsSegmented');
  group.setAttribute('role', 'radiogroup');
  // QA r28: the choices are role=radio (not button): getByRole('radio', { name: '2v2 tag team' }). The group stays unnamed so getByLabel('Team') still finds only the select.
  const buttons = [...input.options].map((o) => {
    const b = el('button', 'vsSegment', o.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    if (describedBy) b.setAttribute('aria-describedby', describedBy);
    b.dataset['value'] = o.value;
    b.addEventListener('click', () => {
      if (input.disabled || input.value === o.value) return;
      input.value = o.value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return b;
  });
  const refresh = (): void => {
    const any = buttons.some((x) => x.dataset['value'] === input.value);
    for (const b of buttons) {
      const on = b.dataset['value'] === input.value;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('vsSegmentOn', on);
      b.disabled = input.disabled;
      b.tabIndex = on || (!any && b === buttons[0]) ? 0 : -1;
    }
  };
  group.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (d === 0 || input.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const i = buttons.findIndex((b) => b.dataset['value'] === input.value);
    const next = buttons[(i + d + buttons.length) % buttons.length];
    next?.click();
    next?.focus();
  });
  group.append(...buttons);
  row.append(group);
  refresh();
  return refresh;
}

const keyList = (title: string, side: 'vsP1' | 'vsP2', pick: string, keys: readonly (readonly [string, string])[]): HTMLElement => {
  const box = el('section', 'vsKeysPlayer');
  const h = el('h3', 'vsKeysTitle');
  h.append(el('span', `vsChip ${side}`, side === 'vsP1' ? 'P1' : 'P2'), ` ${title}`);
  const dl = el('dl', 'vsKeyList');
  for (const [word, k] of keys) {
    const row = el('div');
    row.append(el('dt', undefined, word), el('dd', undefined, k));
    dl.append(row);
  }
  box.append(h, dl, el('p', 'vsKeysPick', pick));
  return box;
};

const HERO_NAMES = ['player', 'partner', 'partner2', 'enemy', 'enemyPartner', 'enemyPartner2'] as const;
const SIDE_NAMES: readonly [readonly string[], readonly string[]] = [HERO_NAMES.slice(0, 3), HERO_NAMES.slice(3)];
type Fields = Record<string, HTMLSelectElement>;
const sel = (f: Fields, n: string): HTMLSelectElement => f[n] as HTMLSelectElement;

/** The key sheet is folded away: a collapsed <details> that only exists for two players on one screen. */
function keysFold(): HTMLDetailsElement {
  const hint = el('details', 'vsKeysFold');
  hint.id = 'arcadeLocalHelp';
  const keys = el('div', 'vsKeys');
  keys.append(
    keyList('Player 1 keys', 'vsP1', P1_PICK, P1_KEYS),
    keyList('Player 2 keys', 'vsP2', P2_PICK, P2_KEYS),
    el('p', 'vsPads', 'Gamepads work too: the first one connected is Player 1, the second Player 2. A picks, B cancels, Y picks a random hero, Start fights.'),
  );
  hint.append(el('summary', 'vsKeysSummary', 'Keys for two players'), keys);
  return hint;
}

/** The options strip: who plays, team size, AI level and arena, each a radio group over its real select. */
function optionsStrip(o: PickViewOptions, refreshers: (() => void)[]): HTMLElement[] {
  const choice = (row: HTMLElement, describedBy?: string): HTMLElement => {
    refreshers.push(segmented(row, describedBy));
    row.classList.add('vsControl');
    return row;
  };
  const sizes = [{ value: '1', label: '1v1' }, { value: '2', label: '2v2 tag team' }, { value: '3', label: '3v3 tag team' }];
  const arenas = ['fire', 'water', 'earth', 'air'].map((v) => ({ value: v, label: (v[0] ?? '').toUpperCase() + v.slice(1) }));
  const strip = el('div', 'vsOptions');
  strip.id = 'arcadeOptsRow';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', 'Options');
  strip.append(
    choice(select('size', 'Team', sizes, o.current.size), 'arcadeTeamHint'),
    choice(select('level', 'AI level', o.levels, o.current.level)),
    choice(select('stage', 'Arena', [{ value: '', label: 'Random' }, ...arenas], o.current.stage ?? ''), 'arcadeStageHint'),
  );
  const mode = [{ value: 'ai', label: 'Computer' }, { value: 'local', label: 'Two players, same screen' }];
  return [choice(select('mode', 'Who plays', mode, o.current.mode)), strip];
}

/** The six hero selects: the FormData contract and the labels tests use; hidden from sight, Tab and assistive tech. */
function heroSelects(o: PickViewOptions): HTMLElement[] {
  const options = [{ value: '', label: 'Empty' }, ...o.races.map((r) => ({ value: r, label: raceLabel(r) }))];
  const c = o.current;
  const rows = [
    select('player', 'Your race', options, c.player, true),
    select('partner', 'Your partner (2v2)', options, c.partner, true),
    select('partner2', 'Your third hero (3v3)', options, c.partner2, true),
    select('enemy', 'AI race', options, c.enemy, true),
    select('enemyPartner', 'Player 2 hero 2', options, c.enemyPartner, true),
    select('enemyPartner2', 'Player 2 hero 3', options, c.enemyPartner2, true),
  ];
  for (const r of rows) {
    r.classList.add('srOnly');
    r.setAttribute('aria-hidden', 'true');
    const s = r.querySelector('select');
    if (s) s.tabIndex = -1;
  }
  return rows;
}

/** Enables each select for the team size and mode (the partner counts in 2v2 and 3v3, the third hero in 3v3) and relabels them. */
function syncFields(form: HTMLElement, f: Fields): { local: boolean; size: string } {
  const local = f['mode']?.value === 'local';
  const size = f['size']?.value ?? '1';
  sel(f, 'partner').disabled = size === '1';
  sel(f, 'partner2').disabled = size !== '3';
  // Player 2's bench is the same size as Player 1's; only in local two-player.
  sel(f, 'enemyPartner').disabled = !local || size === '1';
  sel(f, 'enemyPartner2').disabled = !local || size !== '3';
  sel(f, 'level').disabled = local;
  // The row's own display rule beats the hidden attribute, so hide by style (out of the layout and the accessibility tree).
  const hide = (n: string, off: boolean): void => {
    const row = sel(f, n).closest<HTMLElement>('.settingsOption');
    if (row) row.style.display = off ? 'none' : '';
  };
  hide('level', local);
  hide('enemyPartner', !local);
  hide('enemyPartner2', !local);
  const labels: [string, string][] = [
    ['arcadeEnemy', local ? 'Player 2 hero 1' : 'AI race'], ['arcadePlayer', local ? 'Player 1 hero 1' : 'Your race'],
    ['arcadePartner', local ? 'Player 1 hero 2' : 'Your partner (2v2)'], ['arcadePartner2', local ? 'Player 1 hero 3' : 'Your third hero (3v3)'],
  ];
  for (const [id, text] of labels) {
    const l = form.querySelector(`label[for="${id}"]`);
    if (l) l.textContent = text;
  }
  return { local, size };
}

export function arcadePickView(o: PickViewOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'arcadePick';
  page.append(el('h1', 'heading', 'Versus'));
  const intro = el('p', 'heroHint', '');
  intro.id = 'arcadeIntro';
  page.append(intro);
  const form = el('form', 'settingsForm vsForm');
  const f = form.elements as unknown as Fields;
  const hint = keysFold();
  const refreshers: (() => void)[] = [];
  const set = el('fieldset', 'settingsGroup vsFieldset');
  const start = el('button', 'menuButton vsFight', 'Fight!');
  start.type = 'submit';
  start.id = 'arcadeStart';
  const fightHint = el('p', 'heroHint');
  fightHint.id = 'arcadeFightHint';
  start.setAttribute('aria-describedby', 'arcadeFightHint');
  const roster = rosterView({
    races: o.races,
    fields: () => f,
    sides: SIDE_NAMES,
    changed: () => form.dispatchEvent(new Event('change')),
    fight: () => {
      if (!start.disabled) form.requestSubmit();
    },
  });
  const stageHint = el('p', 'heroHint', 'The arena starts on this element and follows the Weather.');
  stageHint.id = 'arcadeStageHint';
  const teamHint = el('p', 'heroHint', 'Tag team: partners share the fight and the bench heals. Life shown is for this team size.');
  teamHint.id = 'arcadeTeamHint';
  const hints = el('div', 'vsHints');
  hints.append(stageHint, teamHint);
  const legend = el('legend', 'srOnly', 'Fighters');
  set.append(legend, ...optionsStrip(o, refreshers), ...heroSelects(o), roster.node, hints);
  const random = el('button', 'menuButton vsRandom', 'Random');
  random.type = 'button';
  random.id = 'arcadeRandom';
  random.addEventListener('click', () => {
    roster.randomAimed();
  });
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  const actions = el('div', 'vsActions');
  actions.append(random, start, fightHint, back);
  const scroll = el('div', 'pickScroll');
  scroll.append(set, hint);
  // Keyboard shortcut past the long roster: first Tab stop, shown on focus, moves focus to Fight (or Random while Fight waits on empty slots).
  const jump = jumpToFightChip([start, random]);
  form.append(jump, scroll, actions);
  const more = markMoreBelow(scroll);
  const sync = (): void => {
    const { size } = syncFields(form, f);
    hint.hidden = f['mode']?.value !== 'local';
    intro.textContent = f['mode']?.value === 'local'
      ? 'Two players, same screen: both of you play on this computer. To play someone on another computer, use Online.'
      : 'Fight the computer. To play someone on another computer, use Online.';
    teamHint.hidden = size === '1';
    for (const r of refreshers) r();
    roster.refresh();
    const empty = roster.empties();
    start.disabled = empty > 0;
    fightHint.hidden = empty === 0;
    fightHint.textContent = empty === 0 ? '' : `Pick ${String(empty)} more hero${empty === 1 ? '' : 'es'}`;
    more();
  };
  sync();
  form.addEventListener('change', (e) => {
    // Two players is a 3v3 duel by default (each brings three heroes); the Team select still offers 1v1 and 2v2.
    if (e.target === f['mode'] && sel(f, 'mode').value === 'local') sel(f, 'size').value = '3';
    // A hero chosen through its (hidden) pulldown counts as picked.
    if (e.target instanceof HTMLSelectElement && (HERO_NAMES as readonly string[]).includes(e.target.name)) roster.confirm(e.target.name);
    sync();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (roster.empties() > 0) return;
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
  /** The hero shown large (portrait and name): the winner, or the player's own hero on a loss or draw. */
  readonly winner?: { readonly id: CharacterId; readonly name: string };
  /** The other side's hero, shown smaller beside the first (equal size on a draw). */
  readonly opponent?: { readonly id: CharacterId; readonly name: string };
  /** Styles the result word; defaults to the neutral look. */
  readonly tone?: 'win' | 'loss' | 'draw';
  /** Local 2-player Versus: which player won (1 or 2); the ribbon names them and Player 2 gets a distinct icon and frame. */
  readonly player?: 1 | 2;
  /** Short stat chips such as `Rounds 2-0`. */
  readonly stats?: readonly string[];
  /** Present when a replay was recorded. */
  readonly onDownload?: () => void;
}

export function arcadeResultsView(o: ResultsViewOptions): HTMLElement {
  const page = el('div', 'menuPage matchEnd');
  page.id = 'arcadeResults';
  const hero = el('div', 'matchEndHero');
  const card = (h: { readonly id: CharacterId; readonly name: string }, cls: string): HTMLElement => {
    const c = el('div', `matchEndCard ${cls}`);
    const face = el('span', 'heroFace matchEndFace');
    face.setAttribute('aria-hidden', 'true');
    face.style.backgroundImage = faceUrl(h.id);
    c.append(face, el('p', 'matchEndName', h.name));
    return c;
  };
  if (o.winner) hero.append(card(o.winner, 'matchEndMain'));
  if (o.opponent) hero.append(card(o.opponent, o.tone === 'draw' ? 'matchEndMain' : 'matchEndSide'));
  if (o.tone) page.dataset['tone'] = o.tone;
  const stats = el('ul', 'matchEndStats');
  for (const t of o.stats ?? []) stats.append(el('li', undefined, t));
  if (o.tone === 'win' && o.player) page.dataset['player'] = String(o.player);
  const ribbon =
    o.tone === 'win' ? (o.player ? `P${String(o.player)} Winner` : 'Winner') : o.tone === 'loss' ? 'You lost' : o.tone === 'draw' ? 'No winner' : null;
  if (ribbon !== null) {
    const r = el('p', 'matchEndRibbon');
    const icon = o.tone === 'win' ? (o.player === 2 ? '\u25C6' : '\u2605') : o.tone === 'draw' ? '\u2261' : '\u2716';
    const i = el('span', 'matchEndIcon', icon);
    i.setAttribute('aria-hidden', 'true');
    r.append(i, ribbon);
    page.append(r);
  }
  page.append(hero, el('h1', 'heading matchEndWord', o.heading), stats, el('p', 'matchEndSummary', o.summary));
  const button = (id: string, label: string, onClick: () => void, cls = 'menuButton'): HTMLButtonElement => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.id = id;
    b.addEventListener('click', onClick);
    return b;
  };
  const actions = el('div', 'matchEndActions');
  actions.append(button('arcadeRematch', 'Rematch', o.onRematch, 'menuButton matchEndCta'), button('arcadeChange', 'Change fighters', o.onChange));
  if (o.onDownload) actions.append(button('downloadReplay', 'Download replay', o.onDownload));
  const menu = el('a', 'menuButton', 'Main Menu');
  menu.href = '#main';
  actions.append(menu);
  page.append(actions);
  return page;
}
