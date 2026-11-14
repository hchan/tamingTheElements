import { CHARACTER_TEXT, getCharacter, type CharacterId } from '@core/index';
import { CHARACTERS } from '@core/menu-index';
import { el } from '../dom';
import { ELEMENT_MARKS } from '../element-marks';
import { abilitiesSpeech, abilityChips } from './hero-abilities';
import { HERO_COLUMNS } from './hero-info';
import { heroDnd } from './hero-dnd';
import { heroGrid, heroPanel } from './hero-panel';

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
const P1_PICK = 'On this screen: W A S D move the cursor, Space picks, Q undoes, E swaps the last pick up.';
const P2_PICK = 'On this screen: I J K L move the cursor, U picks, O undoes, P swaps the last pick up.';

/**
 * DOM of the Arcade Versus screens (FUN-DESIGN WP 11): the hero select and the results. Native controls (labelled selects,
 * buttons, links) in the menu classes; the 44 px touch rule applies to every button. Lazy-loaded with the Arcade flow
 * (`src/game/app/arcade-versus.ts`), never part of the menu entry chunk.
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

/** The element glyph plus its word, so the tile never relies on colour. */
function rosterElement(element: string): HTMLElement {
  const box = el('span', 'rosterElement');
  // The glyph is decoration for sighted users; screen readers read only the element word.
  const mark = el('span', 'rosterGlyph', ELEMENT_MARKS[element] ?? '');
  mark.setAttribute('aria-hidden', 'true');
  box.append(mark, el('span', undefined, element));
  return box;
}

/** "Sindarosa (fire)": the element word, so the choice never depends on colour or art. */
export function raceLabel(id: CharacterId): string {
  return `${CHARACTER_TEXT.get(id)?.name ?? id} (${getCharacter(id).element})`;
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
function segmented(row: HTMLElement): () => void {
  const input = row.querySelector('select');
  if (!input) return () => undefined;
  input.tabIndex = -1;
  input.classList.add('vsNativeTwin');
  input.setAttribute('aria-hidden', 'true');
  const group = el('div', 'vsSegmented');
  group.setAttribute('role', 'radiogroup');
  const buttons = [...input.options].map((o) => {
    const b = el('button', 'vsSegment', o.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
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

/** Visible name of a select's current race ("Sindarosa"), for the slot buttons. */
const shortName = (id: string): string => CHARACTER_TEXT.get(id as CharacterId)?.name ?? id;

/** CSS background for a hero's map sprite (4-frame sheet, 80 px a frame: the first shows). */
const avatarOf = (id: string): string => `url("${import.meta.env.BASE_URL}assets/img/map/${encodeURIComponent(getCharacter(id as CharacterId).sprite)}.png")`;

/** "HP 120, Speed 4": the small stat line under a picked hero. */
const statsOf = (id: string): string => {
  const c = getCharacter(id as CharacterId);
  return `HP ${String(c.maxHealth)} · Speed ${String(c.speed)}`;
};

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

type SideIx = 0 | 1;

/**
 * The hero select (Street Fighter / Marvel vs. Capcom style): Player 1's slots on the left, Player 2's (or the computer's) on the
 * right, a grid of every hero between them. Each player has a cursor (P1 blue, P2 pink, always with a P1/P2 flag so colour is never
 * the only cue) moved and picked with their own keys at the same time; the mouse or touch fills the active slot. The real selects
 * stay in the form, visually hidden and out of the Tab order, so the form data, labels and tests are unchanged.
 */
function rosterView(
  allRaces: readonly CharacterId[],
  fields: () => Record<string, HTMLSelectElement>,
  sides: readonly [readonly string[], readonly string[]],
  changed: () => void,
  focusFight: () => void,
): { node: HTMLElement; refresh: () => void; confirm: (name: string) => void; onKey: (e: KeyboardEvent) => void; act: (s: SideIx, act: string) => void; empties: () => number } {
  const names = [...sides[0], ...sides[1]];
  const node = el('div', 'rosterPick vsStage');
  const live = el('p', 'srOnly');
  live.setAttribute('role', 'status');
  const panel = heroPanel(() => {
    dnd.disarm();
    assignMouse(focus);
  });
  /** Index (in cursor order) of the hero the panel shows: the last one a cursor, the mouse or focus landed on. */
  let focus = 0;
  const heroes = heroGrid({
    races: allRaces,
    onTile: (t, _id, i) => {
      const flags = el('span', 'vsFlags');
      flags.hidden = true;
      const cur = el('span', 'vsCursors');
      cur.setAttribute('aria-hidden', 'true');
      t.append(flags, cur);
      const look = (): void => {
        // A previewed hero stays in the panel while the pointer travels to "Add to team" or a slot.
        if (focus === i || dnd.armed() >= 0) return;
        focus = i;
        refresh();
      };
      t.addEventListener('pointerenter', look);
      t.addEventListener('focus', look);
    },
  });
  const races = heroes.order;
  const dnd = heroDnd({
    root: node,
    tiles: heroes.tiles,
    previewTile: (i) => {
      focus = i;
      cursor[mouseSide] = i;
      refresh();
    },
    assignTile: (i) => {
      assignMouse(i);
    },
    dropTile: (i, slot) => {
      dropHero(i, slot);
    },
    swapSlots: (a, b) => {
      swapSlots(a, b);
    },
    slotDraggable: (n) => confirmed.has(n),
    clearSlot: (n) => {
      clearSlot(n);
    },
  });
  const grid = heroes.grid;
  const sideNodes = ([0, 1] as const).map((i) => {
    const section = el('section', `vsSide vsSide${String(i + 1)}`);
    const title = el('h2', 'vsSideTitle');
    const ol = el('ol', 'teamSlots rosterSlots');
    const status = el('p', 'vsStatus');
    const ready = el('button', 'menuButton vsReady', 'Ready');
    ready.type = 'button';
    ready.id = `ready-p${String(i + 1)}`;
    section.append(title, ol, status, ready);
    return { section, title, ol, status, ready };
  });
  node.append(sideNodes[0]?.section as HTMLElement, sideNodes[1]?.section as HTMLElement, grid, panel.node, live);
  const sideOf = (n: string): SideIx => (sides[0].includes(n) ? 0 : 1);
  const sideActive: [string, string] = [sides[0][0] ?? 'player', sides[1][0] ?? 'enemy'];
  let mouseSide: SideIx = 0;
  /** Slots the player has actually chosen (the form starts with defaults, shown as "not picked"). */
  const confirmed = new Set<string>();
  const ready: [boolean, boolean] = [false, false];
  const cursor: [number, number] = [0, Math.min(1, races.length - 1)];
  const isLocal = (): boolean => fields()['mode']?.value === 'local';
  const openOf = (s: SideIx): string[] => sides[s].filter((n) => fields()[n] && !fields()[n]?.disabled);
  const openSlots = (): string[] => names.filter((n) => fields()[n] && !fields()[n]?.disabled);
  const slotButtons = new Map<string, HTMLButtonElement>();
  const slotItems = new Map<string, HTMLElement>();
  const tiles = heroes.tiles;
  const slotLabel = (n: string): string => fields()[n]?.labels[0]?.textContent ?? n;
  const who = (s: SideIx): string => (isLocal() ? `Player ${String(s + 1)}` : s === 0 ? 'You' : 'The computer');
  const announce = (msg: string): void => {
    live.textContent = msg;
  };
  const picked = (s: SideIx): string[] => openOf(s).filter((n) => confirmed.has(n));

  const refresh = (): void => {
    const f = fields();
    const local = isLocal();
    for (const s of [0, 1] as const) {
      const open = openOf(s);
      if (!open.includes(sideActive[s])) sideActive[s] = open[0] ?? sideActive[s];
      if (!local && s === 1) ready[1] = false;
    }
    sideNodes.forEach((sn, i) => {
      const s = i as SideIx;
      const open = openOf(s);
      const title = local ? `Player ${String(i + 1)}` : i === 0 ? 'You' : 'Computer';
      sn.title.textContent = '';
      sn.title.append(el('span', `vsChip ${i === 0 ? 'vsP1' : 'vsP2'}`, i === 0 ? 'P1' : local ? 'P2' : 'AI'), ` ${title}`);
      sn.ol.setAttribute('aria-label', `${title} hero slots`);
      sn.status.hidden = !local && i === 1;
      sn.status.textContent = ready[i] ? 'Ready' : `${String(picked(s).length)} of ${String(open.length)} picked`;
      sn.ready.hidden = !local;
      sn.ready.setAttribute('aria-pressed', String(ready[i]));
      sn.ready.textContent = ready[i] ? 'Ready (undo)' : 'Ready';
      sn.section.classList.toggle('vsReadyOn', ready[i]);
    });
    for (const n of names) {
      const sel = f[n];
      const s = sideOf(n);
      let b = slotButtons.get(n);
      if (!b && sel) {
        b = el('button', 'teamSlot rosterSlot');
        b.type = 'button';
        b.id = `roster-${n}`;
        b.dataset['heroSlot'] = n;
        b.addEventListener('click', () => {
          sideActive[sideOf(n)] = n;
          mouseSide = sideOf(n);
          const armed = dnd.takeArmed();
          // Tap a hero to preview it, then tap a slot: the touch alternative to dragging.
          if (armed >= 0) dropHero(armed, n);
          else refresh();
        });
        // Delete or Backspace on a focused slot empties it.
        b.addEventListener('keydown', (e) => {
          if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            clearSlot(n);
          }
        });
        slotButtons.set(n, b);
        const item = el('li', 'vsSlotItem');
        item.append(b);
        slotItems.set(n, item);
        sideNodes[s]?.ol.append(item);
      }
      const item = slotItems.get(n);
      if (!b || !sel || !item) continue;
      item.toggleAttribute('hidden', sel.disabled);
      const open = openOf(s);
      const empty = sel.value === '';
      const done = confirmed.has(n) && !empty;
      const element = empty ? '' : getCharacter(sel.value as CharacterId).element;
      const isActive = n === sideActive[s] && (local || s === mouseSide);
      b.textContent = '';
      const face = el('span', 'heroFace vsBigFace');
      if (!empty) face.style.backgroundImage = avatarOf(sel.value);
      face.setAttribute('aria-hidden', 'true');
      const text = el('span', 'vsSlotText');
      text.append(el('span', 'vsSlotLabel', slotLabel(n)), el('b', 'vsSlotName', empty ? 'Empty' : shortName(sel.value)));
      if (!empty) text.append(rosterElement(element));
      text.append(el('span', 'vsStats', empty ? 'Pick a hero' : done ? statsOf(sel.value) : 'Not picked yet'));
      if (done) {
        const abil = el('span', 'vsAbilities');
        // Inside a button, so its text is part of the button's name for screen readers; the title repeats it as a sentence.
        abil.title = abilitiesSpeech(sel.value as CharacterId);
        for (const c of abilityChips(sel.value as CharacterId)) {
          const chip = el('span', 'vsAbility');
          const mark = el('span', 'vsAbilityMark', c.mark);
          mark.setAttribute('aria-hidden', 'true');
          chip.append(mark, ` ${c.name} (${c.kind})`);
          abil.append(chip);
        }
        text.append(abil);
      }
      b.append(face, text);
      if (empty) delete b.dataset['element'];
      else b.dataset['element'] = element;
      b.classList.toggle('heroSlotEmpty', empty);
      b.setAttribute('aria-pressed', String(isActive));
      b.classList.toggle('rosterActive', isActive);
      b.classList.toggle('vsUnpicked', !done);
      b.classList.toggle('vsSlotP1', s === 0);
      b.classList.toggle('vsSlotP2', s === 1);
      // Swap up and Clear: small labelled buttons, only once a hero is picked (so the Tab order stays short before any pick).
      item.querySelector('.vsSlotActions')?.remove();
      if (done) {
        const acts = el('span', 'vsSlotActions');
        const idx = open.indexOf(n);
        const title = local ? `Player ${String(s + 1)}` : s === 0 ? 'You' : 'Computer';
        if (idx > 0) {
          const up = el('button', 'menuButton vsSmall', 'Swap up');
          up.type = 'button';
          up.setAttribute('aria-label', `Swap ${title} pick ${String(idx + 1)} up to position ${String(idx)}`);
          up.addEventListener('click', () => {
            swap(n);
          });
          acts.append(up);
        }
        const clear = el('button', 'menuButton vsSmall', 'Clear');
        clear.type = 'button';
        clear.setAttribute('aria-label', `Clear ${title} pick ${String(idx + 1)}`);
        clear.addEventListener('click', () => {
          clearSlot(n);
          b.focus();
        });
        acts.append(clear);
        item.append(acts);
      }
    }
    // Tiles: the cursors and the picks (a chip per slot a hero fills, "P1 1", "P2 2": text, never colour alone).
    tiles.forEach((t, i) => {
      const id = races[i] as string;
      const flags = t.querySelector<HTMLElement>('.vsFlags');
      let any = false;
      if (flags) {
        flags.textContent = '';
        for (const n of openSlots().filter((k) => f[k]?.value === id && confirmed.has(k))) {
          const s = sideOf(n);
          const num = openOf(s).indexOf(n) + 1;
          const chip = el('span', `vsChip ${s === 0 ? 'vsP1' : 'vsP2'}`);
          const word = s === 0 ? (local ? 'P1' : 'You') : local ? 'P2' : 'AI';
          const vis = el('span', undefined, `${word} ${String(num)}`);
          vis.setAttribute('aria-hidden', 'true');
          chip.append(vis, el('span', 'srOnly', `${who(s)}, hero ${String(num)}`));
          flags.append(chip);
          any = true;
        }
        flags.hidden = !any;
      }
      t.setAttribute('aria-pressed', String(any));
      t.classList.toggle('selectedGarrisonRow', any);
      t.classList.toggle('vsCursor1', cursor[0] === i);
      t.classList.toggle('vsCursor2', local && cursor[1] === i);
      const cur = t.querySelector<HTMLElement>('.vsCursors');
      if (cur) {
        cur.textContent = '';
        if (cursor[0] === i) cur.append(el('span', 'vsChip vsP1', 'P1'));
        if (local && cursor[1] === i) cur.append(el('span', 'vsChip vsP2', 'P2'));
      }
    });
    node.classList.toggle('vsBothReady', local && ready[0] && ready[1]);
    const shown = races[focus];
    panel.setAction(shown && openOf(mouseSide).some((n) => confirmed.has(n) && f[n]?.value === shown) ? 'Remove from team' : 'Add to team');
    if (shown && panel.node.dataset['hero'] !== shown) {
      panel.node.dataset['hero'] = shown;
      panel.show(shown);
    }
  };

  /**
   * Puts `id` in `slot`. A hero already picked in another slot of the SAME team moves here and leaves its old slot with this slot's old
   * hero (or empty when this slot was not picked yet): a team never holds a hero twice. The other side may hold the same hero (a mirror).
   */
  function putHero(slot: string, id: string): void {
    const sel = fields()[slot];
    if (!sel) return;
    const dup = openOf(sideOf(slot)).find((k) => k !== slot && confirmed.has(k) && fields()[k]?.value === id);
    const dupSel = dup ? fields()[dup] : undefined;
    if (dup && dupSel) {
      if (confirmed.has(slot)) dupSel.value = sel.value;
      else {
        dupSel.value = '';
        confirmed.delete(dup);
      }
    }
    sel.value = id;
    confirmed.add(slot);
  }
  /** Fills side `s`'s active slot with hero `i`, then moves that side on to its next empty slot. */
  const place = (s: SideIx, i: number): void => {
    const slot = sideActive[s];
    const id = races[i];
    if (!fields()[slot] || !id) return;
    putHero(slot, id);
    ready[s] = false;
    changed();
    const next = openOf(s).find((n) => !confirmed.has(n));
    if (next) sideActive[s] = next;
    announce(`${who(s)} picked ${shortName(id)} for ${slotLabel(slot)}.`);
    refresh();
  };
  /** Mouse and touch fill the active slot, then carry on to the other side once this one is full (one player on the computer, or P1 then P2). */
  function assignMouse(i: number): void {
    // A second click or Enter on a hero this side already picked takes it off the team again.
    const held = openOf(mouseSide).find((n) => confirmed.has(n) && fields()[n]?.value === races[i]);
    if (held) {
      focus = i;
      cursor[mouseSide] = i;
      clearSlot(held);
      return;
    }
    focus = i;
    cursor[mouseSide] = i;
    place(mouseSide, i);
    const other: SideIx = mouseSide === 0 ? 1 : 0;
    if (openOf(mouseSide).every((n) => confirmed.has(n)) && openOf(other).some((n) => !confirmed.has(n))) {
      mouseSide = other;
      refresh();
    }
  }
  /** A tile dropped on a slot: the hero goes there; a hero already in another slot swaps with this slot's old hero (no doubles). */
  function dropHero(i: number, slot: string): void {
    const sel = fields()[slot];
    const id = races[i];
    if (!sel || !id) return;
    const s = sideOf(slot);
    putHero(slot, id);
    ready[s] = false;
    changed();
    mouseSide = s;
    sideActive[s] = openOf(s).find((n) => !confirmed.has(n)) ?? slot;
    focus = i;
    cursor[s] = i;
    announce(`${who(s)} put ${shortName(id)} in ${slotLabel(slot)}.`);
    refresh();
  }
  function swapSlots(a: string, b: string): void {
    const [x, y] = [fields()[a], fields()[b]];
    if (!x || !y) return;
    [x.value, y.value] = [y.value, x.value];
    const [ca, cb] = [confirmed.has(a), confirmed.has(b)];
    if (cb) confirmed.add(a); else confirmed.delete(a);
    if (ca) confirmed.add(b); else confirmed.delete(b);
    ready[sideOf(a)] = false;
    ready[sideOf(b)] = false;
    changed();
    announce(`${slotLabel(a)} swapped with ${slotLabel(b)}.`);
    refresh();
  }
  /** Empties a slot (its select gets the empty option, so the form cannot start until it is refilled) and makes it the active one. */
  function clearSlot(n: string): void {
    const s = sideOf(n);
    const sel = fields()[n];
    if (!sel) return;
    const was = sel.value;
    confirmed.delete(n);
    sel.value = '';
    sideActive[s] = openOf(s).find((k) => !confirmed.has(k)) ?? n;
    mouseSide = s;
    ready[s] = false;
    changed();
    announce(was === '' ? `${slotLabel(n)} is already empty.` : `${shortName(was)} removed from ${slotLabel(n)}. ${slotLabel(n)} is empty.`);
    refresh();
  }
  function swap(n: string): void {
    const s = sideOf(n);
    const open = openOf(s);
    const prev = open[open.indexOf(n) - 1];
    const a = fields()[n];
    const b = prev ? fields()[prev] : undefined;
    if (!prev || !a || !b) return;
    const t = a.value;
    a.value = b.value;
    b.value = t;
    // Both picks move with their heroes.
    const [ca, cb] = [confirmed.has(n), confirmed.has(prev)];
    if (cb) confirmed.add(n); else confirmed.delete(n);
    if (ca) confirmed.add(prev); else confirmed.delete(prev);
    ready[s] = false;
    sideActive[s] = prev;
    changed();
    announce(`${slotLabel(n)} swapped with ${slotLabel(prev)}.`);
    refresh();
  }
  const toggleReady = (s: SideIx): void => {
    const open = openOf(s);
    if (!ready[s] && picked(s).length < open.length) {
      announce(`${who(s)} still has heroes to pick.`);
      return;
    }
    ready[s] = !ready[s];
    announce(`${who(s)} is ${ready[s] ? 'ready' : 'not ready'}.`);
    refresh();
    if (isLocal() && ready[0] && ready[1]) {
      announce('Both players are ready. Press Fight!');
      focusFight();
    }
  };
  for (const s of [0, 1] as const) {
    sideNodes[s]?.ready.addEventListener('click', () => {
      toggleReady(s);
    });
  }

  const moveCursor = (s: SideIx, dx: number, dy: number): void => {
    const n = races.length;
    const cols = HERO_COLUMNS;
    const cur = cursor[s];
    let next = cur + dx + dy * cols;
    if (dx !== 0) next = Math.max(0, Math.min(n - 1, next));
    else if (next < 0 || next >= n) next = cur;
    cursor[s] = next;
    focus = next;
    dnd.disarm();
    refresh();
  };
  const undo = (s: SideIx): void => {
    const last = picked(s).at(-1);
    if (last) clearSlot(last);
  };
  const swapLast = (s: SideIx): void => {
    const last = picked(s).at(-1);
    if (last) swap(last);
  };
  /** One picker action for side `s` from a key or a gamepad: move the cursor, pick (or ready once full), undo, swap the last pick up. */
  const doAct = (s: SideIx, act: string): void => {
    if (s === 1 && !isLocal()) return;
    if (act === 'up') moveCursor(s, 0, -1);
    else if (act === 'down') moveCursor(s, 0, 1);
    else if (act === 'left') moveCursor(s, -1, 0);
    else if (act === 'right') moveCursor(s, 1, 0);
    else if (act === 'pick') {
      // With every slot filled, the pick key readies the player (and unreadies).
      if (picked(s).length >= openOf(s).length && isLocal()) toggleReady(s);
      else place(s, cursor[s]);
    } else if (act === 'undo') undo(s);
    else if (act === 'swap') swapLast(s);
  };
  const PICK: readonly [Record<string, string>, SideIx][] = [
    [{ KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right', Space: 'pick', KeyQ: 'undo', KeyE: 'swap' }, 0],
    [{ KeyI: 'up', KeyJ: 'left', KeyK: 'down', KeyL: 'right', KeyU: 'pick', KeyO: 'undo', KeyP: 'swap' }, 1],
  ];
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !node.isConnected) return;
    const t = e.target;
    if (t instanceof HTMLSelectElement || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    for (const [map, s] of PICK) {
      const act = map[e.code];
      if (!act || (s === 1 && !isLocal())) continue;
      // A focused button or link keeps Space (the native click fills the active slot).
      if (act === 'pick' && (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement)) return;
      e.preventDefault();
      if (e.repeat && !['up', 'down', 'left', 'right'].includes(act)) return;
      doAct(s, act);
      return;
    }
  };
  const empties = (): number => openSlots().filter((n) => fields()[n]?.value === '').length;
  return {
    node, refresh, onKey, act: doAct, empties,
    confirm: (n) => {
      if (fields()[n]?.value === '') confirmed.delete(n);
      else confirmed.add(n);
      ready[sideOf(n)] = false;
    },
  };
}

export function arcadePickView(o: PickViewOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'arcadePick';
  page.append(el('h1', 'heading', 'Versus'));
  const races = o.races.map((r) => ({ value: r, label: raceLabel(r) }));
  // Hero selects also offer the empty option: a slot the player cleared. Start waits until none is empty.
  const heroOptions = [{ value: '', label: 'Empty' }, ...races];
  const form = el('form', 'settingsForm vsForm');
  const setText = (id: string, text: string): void => {
    const l = form.querySelector(`label[for="${id}"]`);
    if (l) l.textContent = text;
  };
  const heroNames = ['player', 'partner', 'partner2', 'enemy', 'enemyPartner', 'enemyPartner2'] as const;
  const hint = el('div', 'vsKeys');
  hint.id = 'arcadeLocalHelp';
  hint.append(
    keyList('Player 1 keys', 'vsP1', P1_PICK, P1_KEYS),
    keyList('Player 2 keys', 'vsP2', P2_PICK, P2_KEYS),
    el('p', 'vsPads', 'Gamepads work too: the first one connected is Player 1, the second Player 2.'),
  );
  const set = el('fieldset', 'settingsGroup vsFieldset');
  const legend = el('legend', 'srOnly', 'Fighters');
  const control = (row: HTMLElement): HTMLElement => {
    row.classList.add('vsControl');
    return row;
  };
  const refreshers: (() => void)[] = [];
  const choice = (row: HTMLElement): HTMLElement => {
    refreshers.push(segmented(row));
    return control(row);
  };
  set.append(
    legend,
    choice(select('mode', 'Opponent', [{ value: 'ai', label: 'Computer' }, { value: 'local', label: 'Two players (this computer)' }], o.current.mode)),
    choice(select('size', 'Team', [{ value: '1', label: '1v1' }, { value: '2', label: '2v2 tag team' }, { value: '3', label: '3v3 tag team' }], o.current.size)),
    choice(select('level', 'AI level', o.levels, o.current.level)),
    select('player', 'Your race', heroOptions, o.current.player, true),
    select('partner', 'Your partner (2v2)', heroOptions, o.current.partner, true),
    select('partner2', 'Your third hero (3v3)', heroOptions, o.current.partner2, true),
    select('enemy', 'AI race', heroOptions, o.current.enemy, true),
    select('enemyPartner', 'Player 2 hero 2', heroOptions, o.current.enemyPartner, true),
    select('enemyPartner2', 'Player 2 hero 3', heroOptions, o.current.enemyPartner2, true),
  );
  const start = el('button', 'menuButton vsFight', 'Fight!');
  start.type = 'submit';
  start.id = 'arcadeStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  const roster = rosterView(
    o.races,
    () => form.elements as unknown as Record<string, HTMLSelectElement>,
    [heroNames.slice(0, 3), heroNames.slice(3)],
    () => form.dispatchEvent(new Event('change')),
    () => {
      start.focus();
    },
  );
  set.append(roster.node);
  const fightHint = el('p', 'heroHint');
  fightHint.id = 'arcadeFightHint';
  start.setAttribute('aria-describedby', 'arcadeFightHint');
  const actions = el('div', 'vsActions');
  actions.append(start, fightHint, back);
  form.append(set, hint, actions);
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
    // The AI level only matters against the computer.
    const levelRow = (f['level'] as HTMLSelectElement).closest<HTMLElement>('.settingsOption');
    if (levelRow) levelRow.style.display = local ? 'none' : '';
    setText('arcadeEnemy', local ? 'Player 2 hero 1' : 'AI race');
    setText('arcadePlayer', local ? 'Player 1 hero 1' : 'Your race');
    setText('arcadePartner', local ? 'Player 1 hero 2' : 'Your partner (2v2)');
    setText('arcadePartner2', local ? 'Player 1 hero 3' : 'Your third hero (3v3)');
    hint.hidden = !local;
    for (const r of refreshers) r();
    roster.refresh();
    const empty = roster.empties();
    start.disabled = empty > 0;
    fightHint.hidden = empty === 0;
    fightHint.textContent = empty === 0 ? '' : `Pick ${String(empty)} more hero${empty === 1 ? '' : 'es'}`;
  };
  // Hide the pulldowns for heroes (they stay in the DOM for form data, labels and assistive tech lookups).
  queueMicrotask(() => {
    for (const n of heroNames) {
      const sel = f[n];
      if (!sel) continue;
      sel.tabIndex = -1;
      // The hero grid is the accessible control; the select is a hidden twin, so screen readers skip it (it is out of the Tab order too).
      const opt = sel.closest<HTMLElement>('.settingsOption');
      opt?.classList.add('srOnly');
      opt?.setAttribute('aria-hidden', 'true');
    }
  });
  sync();
  form.addEventListener('change', (e) => {
    // Two players is a 3v3 duel by default (each brings three heroes); the Team select still offers 1v1 and 2v2.
    if (e.target === f['mode'] && (f['mode']).value === 'local') (f['size'] as HTMLSelectElement).value = '3';
    // A hero chosen through its (hidden) pulldown counts as picked.
    if (e.target instanceof HTMLSelectElement && (heroNames as readonly string[]).includes(e.target.name)) roster.confirm(e.target.name);
    sync();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (roster.empties() > 0) return;
    o.onStart(Object.fromEntries(new FormData(form)) as unknown as PickValues);
  });
  // Both players pick at once with their own keys; the listener goes away with the page.
  let seen = false;
  const onKey = (e: KeyboardEvent): void => {
    if (page.isConnected) {
      seen = true;
      roster.onKey(e);
    } else if (seen) {
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
  // Gamepads: pad 1 is Player 1, pad 2 Player 2 (D-pad or left stick moves, A picks, B undoes, X swaps); polled while the page is up.
  const held = new Map<string, boolean>();
  const poll = (): void => {
    if (!page.isConnected) {
      if (seen) return;
    } else seen = true;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    ([0, 1] as const).forEach((s) => {
      const pad = pads[s];
      if (!pad) return;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const down = (b: number): boolean => pad.buttons[b]?.pressed === true;
      const states: [string, boolean][] = [
        ['up', down(12) || ay < -0.6], ['down', down(13) || ay > 0.6], ['left', down(14) || ax < -0.6], ['right', down(15) || ax > 0.6],
        ['pick', down(0)], ['undo', down(1)], ['swap', down(2)],
      ];
      for (const [name, on] of states) {
        const k = `${String(s)}${name}`;
        if (on && !held.get(k)) roster.act(s, name);
        held.set(k, on);
      }
    });
    requestAnimationFrame(poll);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(poll);
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
