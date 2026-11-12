import { CHARACTER_TEXT, getCharacter, type CharacterId } from '@core/index';
import { el } from '../dom';

/** Key help for the two-player option (the defaults; Player 1's keys can be rebound on Key Bindings). */
const P1_HELP = 'W A S D or arrows move, Space attack, Enter second attack, E dash, Q guard, X super, R weather, H charge, 3 tag, 4 tag 2';
const P2_HELP = 'I J K L move, U attack, O second attack, Y dash, N guard, B super, T weather, G charge, V tag, Comma tag 2';

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
  /** Player 2's second and third hero (local two-player, WP-pvp-3heroes). */
  readonly enemyPartner?: string;
  readonly enemyPartner2?: string;
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
export function select(name: string, label: string, options: readonly { value: string; label: string }[], value = ''): HTMLElement {
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

/** Visible name of a select's current race ("Sindarosa"), for the slot buttons. */
const shortName = (id: string): string => CHARACTER_TEXT.get(id as CharacterId)?.name ?? id;

/** CSS background for a hero's map sprite (4-frame sheet, 80 px a frame: the first shows). */
const avatarOf = (id: string): string => `url("${import.meta.env.BASE_URL}assets/img/map/${encodeURIComponent(getCharacter(id as CharacterId).sprite)}.png")`;

/**
 * The hero roster (replaces the race pulldowns): one button per open slot ("Your race: Sindarosa") and a grid of every
 * race as a tile (portrait, name, element word). Choosing a tile fills the active slot and moves to the next open one.
 * The real selects stay in the form, visually hidden and out of the Tab order, so the form data, labels and tests are unchanged.
 */
function rosterView(
  races: readonly CharacterId[],
  fields: () => Record<string, HTMLSelectElement>,
  names: readonly string[],
  changed: () => void,
): { node: HTMLElement; refresh: () => void } {
  const node = el('div', 'rosterPick');
  const slots = el('ol', 'teamSlots rosterSlots');
  slots.setAttribute('aria-label', 'Hero slots');
  const grid = el('div', 'rosterGrid');
  node.append(slots, grid);
  let active = names[0] ?? 'player';
  const openSlots = (): string[] => names.filter((n) => fields()[n] && !fields()[n]?.disabled);
  const slotButtons = new Map<string, HTMLButtonElement>();
  const tiles = new Map<string, HTMLButtonElement>();
  const refresh = (): void => {
    const f = fields();
    const open = openSlots();
    if (!open.includes(active)) active = open[0] ?? active;
    for (const n of names) {
      const sel = f[n];
      let b = slotButtons.get(n);
      if (!b && sel) {
        b = el('button', 'teamSlot rosterSlot');
        b.type = 'button';
        b.id = `roster-${n}`;
        const slot = n;
        b.addEventListener('click', () => {
          active = slot;
          refresh();
        });
        slotButtons.set(n, b);
        const li = el('li');
        li.append(b);
        slots.append(li);
      }
      if (!b || !sel) continue;
      b.closest('li')?.toggleAttribute('hidden', sel.disabled);
      const label = sel.labels[0]?.textContent ?? n;
      b.textContent = '';
      const face = el('span', 'rosterFace');
      face.style.backgroundImage = avatarOf(sel.value);
      face.setAttribute('aria-hidden', 'true');
      b.append(face, el('b', undefined, `Slot ${String(open.indexOf(n) + 1)}: ${label}`), el('span', undefined, shortName(sel.value)));
      b.setAttribute('aria-pressed', String(n === active));
      b.classList.toggle('rosterActive', n === active);
    }
    const chosen = f[active]?.value;
    for (const [id, t] of tiles) {
      t.setAttribute('aria-pressed', String(id === chosen));
      // Like the Garrison: a gold "Slot N" pill names the slot a hero fills (text, never colour alone).
      const at = open.filter((n) => f[n]?.value === id).map((n) => `Slot ${String(open.indexOf(n) + 1)}`).join(', ');
      const pill = t.querySelector<HTMLElement>('.battlegroundOrderContainer');
      if (pill) {
        pill.textContent = at;
        pill.hidden = at === '';
      }
      t.classList.toggle('selectedGarrisonRow', at !== '');
    }
  };
  for (const r of races) {
    const t = el('button', 'menuButton rosterTile');
    t.type = 'button';
    const face = el('span', 'rosterFace');
    face.style.backgroundImage = avatarOf(r);
    face.setAttribute('aria-hidden', 'true');
    t.append(face, el('span', 'rosterName', shortName(r)), el('span', 'rosterElement', getCharacter(r).element), el('span', 'battlegroundOrderContainer'));
    t.addEventListener('click', () => {
      const sel = fields()[active];
      if (sel) sel.value = r;
      changed();
      const open = openSlots();
      active = open[(open.indexOf(active) + 1) % Math.max(1, open.length)] ?? active;
      refresh();
    });
    tiles.set(r, t);
    grid.append(t);
  }
  // Hide the pulldowns for heroes (they stay in the DOM for form data, labels and assistive tech lookups).
  queueMicrotask(() => {
    for (const n of names) {
      const sel = fields()[n];
      if (!sel) continue;
      sel.tabIndex = -1;
      sel.closest<HTMLElement>('.settingsOption')?.classList.add('srOnly');
    }
  });
  return { node, refresh };
}

export function arcadePickView(o: PickViewOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'arcadePick';
  page.append(
    el('h1', 'heading', 'Versus'),
  );
  const races = o.races.map((r) => ({ value: r, label: raceLabel(r) }));
  const form = el('form', 'settingsForm');
  const setText = (id: string, text: string): void => {
    const l = form.querySelector(`label[for="${id}"]`);
    if (l) l.textContent = text;
  };
  const heroNames = ['player', 'partner', 'partner2', 'enemy', 'enemyPartner', 'enemyPartner2'] as const;
  const hint = el('p', undefined, `Two players share this keyboard. Player 1: ${P1_HELP}. Player 2: ${P2_HELP}. Each player may also use a gamepad (the first one connected is Player 1, the second Player 2).`);
  hint.id = 'arcadeLocalHelp';
  const set = el('fieldset', 'settingsGroup');
  set.append(
    el('legend', 'heading', 'Fighters'),
    select('mode', 'Opponent', [{ value: 'ai', label: 'Computer' }, { value: 'local', label: 'Two players (this computer)' }], o.current.mode),
    select('size', 'Team', [{ value: '1', label: '1v1' }, { value: '2', label: '2v2 tag team' }, { value: '3', label: '3v3 tag team' }], o.current.size),
    select('player', 'Your race', races, o.current.player),
    select('partner', 'Your partner (2v2)', races, o.current.partner),
    select('partner2', 'Your third hero (3v3)', races, o.current.partner2),
    select('enemy', 'AI race', races, o.current.enemy),
    select('enemyPartner', 'Player 2 hero 2', races, o.current.enemyPartner),
    select('enemyPartner2', 'Player 2 hero 3', races, o.current.enemyPartner2),
    select('level', 'AI level', o.levels, o.current.level),
  );
  const roster = rosterView(o.races, () => form.elements as unknown as Record<string, HTMLSelectElement>, heroNames, () => form.dispatchEvent(new Event('change')));
  set.insertBefore(roster.node, set.querySelector('#arcadeLevel')?.closest('.settingsOption') ?? null);
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
    const size = f['size']?.value;
    (f['partner'] as HTMLSelectElement).disabled = size === '1';
    (f['partner2'] as HTMLSelectElement).disabled = size !== '3';
    // Player 2's bench is the same size as Player 1's; only in local two-player.
    (f['enemyPartner'] as HTMLSelectElement).disabled = !local || size === '1';
    (f['enemyPartner2'] as HTMLSelectElement).disabled = !local || size !== '3';
    // The row's own display rule beats the hidden attribute, so hide it by style (out of the layout and the accessibility tree).
    for (const n of ['enemyPartner', 'enemyPartner2']) {
      const row = (f[n] as HTMLSelectElement).closest<HTMLElement>('.settingsOption');
      if (row) row.style.display = local ? '' : 'none';
    }
    (f['level'] as HTMLSelectElement).disabled = local;
    setText('arcadeEnemy', local ? 'Player 2 hero 1' : 'AI race');
    setText('arcadePlayer', local ? 'Player 1 hero 1' : 'Your race');
    setText('arcadePartner', local ? 'Player 1 hero 2' : 'Your partner (2v2)');
    setText('arcadePartner2', local ? 'Player 1 hero 3' : 'Your third hero (3v3)');
    hint.hidden = !local;
    roster.refresh();
  };
  sync();
  form.addEventListener('change', (e) => {
    // Two players is a 3v3 duel by default (each brings three heroes); the Team select still offers 1v1 and 2v2.
    if (e.target === f['mode'] && (f['mode']).value === 'local') (f['size'] as HTMLSelectElement).value = '3';
    sync();
  });
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
