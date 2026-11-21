import { CHARACTER_TEXT, DEFAULT_SIM_FLAGS, SIM_VERSION, createMatch, getCharacter, type CharacterId } from '@core/index';
import { el } from '../dom';
import { abilitiesSpeech, abilityChips } from './hero-abilities';
import { heroGrid, heroPanel, type HeroPanel } from './hero-panel';
import * as model from './pick-model';
import { create as createInput, type PickInputHandlers } from './pick-input';
import { teamStack, type StackRow, type TeamStack, type TeamStackProps } from './team-stack';

/**
 * Glue of the MvC-style hero picker (Versus; the tour joins it later): the hero grid, the numbered team stacks, the hero panel,
 * the live region and the sync with the form's (hidden) hero selects, which stay the FormData contract. The rules live in
 * `pick-model.ts`, the keys and pads in `pick-input.ts`, the stack DOM in `team-stack.ts`.
 */

const lifeCache = new Map<string, number>();

/**
 * The life `id` starts an Arcade match with on a team of `size` (1 to 3): the sim's own max HP, read from a tick-0 world built
 * like `arcadeSetup` (Arcade on, difficulty 1, 0 XP), so the picker can never drift from the HUD. It depends only on the hero and
 * the roster length, so the team is `size` copies of the hero; cached per (hero, size).
 */
export function heroLife(id: CharacterId, size: number): number {
  const n = Math.min(3, Math.max(1, size));
  const key = `${id}:${String(n)}`;
  const hit = lifeCache.get(key);
  if (hit !== undefined) return hit;
  const hero = { character: id, xp: 0 };
  const w = createMatch({
    simVersion: SIM_VERSION,
    seed: 1,
    flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
    chapter: 1,
    difficulty: 1,
    p1: Array.from({ length: n }, () => hero),
    p2: [hero],
  });
  const life = w.state.maxHp[0] ?? getCharacter(id).maxHealth;
  lifeCache.set(key, life);
  return life;
}

/** "Sindarosa (fire)": the element word, so the choice never depends on colour or art. */
export function raceLabel(id: CharacterId): string {
  return `${CHARACTER_TEXT.get(id)?.name ?? id} (${getCharacter(id).element})`;
}

/** Visible name of a hero ("Sindarosa"). */
export const shortName = (id: string): string => CHARACTER_TEXT.get(id as CharacterId)?.name ?? id;

export type SideIx = 0 | 1;

export interface RosterOptions {
  readonly races: readonly CharacterId[];
  /** The form's elements by name (the hidden hero selects, `mode`). */
  readonly fields: () => Record<string, HTMLSelectElement>;
  /** Select names per side, in slot order. */
  readonly sides: readonly [readonly string[], readonly string[]];
  /** Called after the model wrote the selects (dispatches the form's change event). */
  readonly changed: () => void;
  /** Starts the match (the Fight! button or key). */
  readonly fight: () => void;
  /** Random source for the Random key (tests inject a seeded one). */
  readonly rng?: () => number;
}

export interface RosterView {
  readonly node: HTMLElement;
  refresh: () => void;
  /** A hero chosen through its hidden select counts as picked. */
  confirm: (name: string) => void;
  /** Slots still empty (suggestions count as filled). */
  empties: () => number;
  /** One random hero for the aimed team (the Random button). */
  randomAimed: () => void;
}

interface Ctx {
  readonly o: RosterOptions;
  readonly teams: [model.Team, model.Team];
  readonly cursor: [number, number];
  aim: SideIx;
  /** Index (grid order) of the hero the panel shows. */
  focus: number;
  seeded: boolean;
  readonly order: CharacterId[];
  readonly tiles: HTMLButtonElement[];
  readonly columns: () => number;
  readonly stacks: [TeamStack, TeamStack];
  readonly panel: HeroPanel;
  readonly live: HTMLElement;
  readonly node: HTMLElement;
}

const SIDES = [0, 1] as const;
const field = (c: Ctx, n: string): HTMLSelectElement | undefined => c.o.fields()[n];
const isLocal = (c: Ctx): boolean => field(c, 'mode')?.value === 'local';
/** Names of the side's enabled selects: the team size. */
const openOf = (c: Ctx, s: SideIx): string[] => c.o.sides[s].filter((n) => field(c, n) && !field(c, n)?.disabled);
const sideName = (c: Ctx, s: SideIx): string => (isLocal(c) ? `Player ${String(s + 1)}` : s === 0 ? 'You' : 'The computer');
const announce = (c: Ctx, msg: string): void => {
  c.live.textContent = msg;
};

/** Resizes each team to its enabled selects; new slots start as suggestions from the select values. */
function syncSizes(c: Ctx): void {
  for (const s of SIDES) {
    const n = openOf(c, s).length;
    const team = c.teams[s];
    if (team.slots.length !== n) model.setSize(team, n, c.o.sides[s].map((k) => field(c, k)?.value ?? ''));
  }
  if (!c.seeded && field(c, c.o.sides[0][0] ?? '')) {
    c.seeded = true;
    for (const s of SIDES) {
      const first = c.teams[s].slots[0]?.hero;
      c.cursor[s] = Math.max(0, c.order.indexOf(first as CharacterId));
    }
    c.focus = c.cursor[0];
  }
}

/** Writes the model into the selects, then tells the form. */
function writeBack(c: Ctx): void {
  for (const s of SIDES) {
    c.teams[s].slots.forEach((slot, i) => {
      const sel = field(c, c.o.sides[s][i] ?? '');
      if (sel) sel.value = slot?.hero ?? '';
    });
  }
  c.o.changed();
}

function stackRows(c: Ctx, s: SideIx): StackRow[] {
  const team = c.teams[s];
  const size = Math.max(1, team.slots.length);
  const target = team.ready || c.aim !== s ? -1 : team.slots.findIndex((x) => x === null || !x.mine);
  return c.o.sides[s].map((name, i): StackRow => {
    const id = `roster-${name}`;
    const slot = team.slots[i];
    if (i >= team.slots.length) return { state: 'empty', id, hidden: true };
    if (!slot) return { state: 'empty', id, pressed: i === target };
    const hero = slot.hero as CharacterId;
    return {
      state: slot.mine ? 'mine' : 'suggested',
      id,
      pressed: i === target,
      hero: {
        id: hero,
        name: shortName(hero),
        stats: `HP ${String(heroLife(hero, size))} · Speed ${String(getCharacter(hero).speed)}`,
        abilities: abilityChips(hero).map((a) => ({ mark: a.mark, title: `${a.name} (${a.kind})` })),
        abilitiesTitle: abilitiesSpeech(hero),
      },
    };
  });
}

function stackProps(c: Ctx, s: SideIx): TeamStackProps {
  const local = isLocal(c);
  return {
    side: local ? `Player ${String(s + 1)}` : s === 0 ? 'You' : 'Computer',
    rows: stackRows(c, s),
    aimed: c.aim === s,
    ready: c.teams[s].ready,
    onRowClick: (i) => {
      rowClick(c, s, i);
    },
    onRowRemove: (i) => {
      removeRow(c, s, i);
    },
  };
}

/** The tiles carry a chip per slot a hero fills ("P1 1", "AI 2": text, never colour alone) and each cursor. */
function renderTiles(c: Ctx): void {
  const local = isLocal(c);
  c.tiles.forEach((t, i) => {
    const id = c.order[i] as string;
    const flags = t.querySelector<HTMLElement>('.vsFlags');
    let any = false;
    if (flags) {
      flags.textContent = '';
      for (const s of SIDES) {
        c.teams[s].slots.forEach((slot, k) => {
          if (!slot?.mine || slot.hero !== id) return;
          const chip = el('span', `vsChip ${s === 0 ? 'vsP1' : 'vsP2'}`);
          const word = s === 0 ? (local ? 'P1' : 'You') : local ? 'P2' : 'AI';
          const vis = el('span', undefined, `${word} ${String(k + 1)}`);
          vis.setAttribute('aria-hidden', 'true');
          chip.append(vis, el('span', 'srOnly', `${sideName(c, s)}, hero ${String(k + 1)}`));
          flags.append(chip);
          any = true;
        });
      }
      flags.hidden = !any;
    }
    t.setAttribute('aria-pressed', String(any));
    t.classList.toggle('selectedGarrisonRow', any);
    t.classList.toggle('vsCursor1', c.cursor[0] === i);
    t.classList.toggle('vsCursor2', local && c.cursor[1] === i);
    const cur = t.querySelector<HTMLElement>('.vsCursors');
    if (cur) {
      cur.textContent = '';
      if (c.cursor[0] === i) cur.append(el('span', 'vsChip vsP1', 'P1'));
      if (local && c.cursor[1] === i) cur.append(el('span', 'vsChip vsP2', 'P2'));
    }
  });
}

function refresh(c: Ctx): void {
  syncSizes(c);
  if (!isLocal(c) && c.aim === 1 && model.allMine(c.teams[1])) c.aim = 0;
  for (const s of SIDES) c.stacks[s].update(stackProps(c, s));
  renderTiles(c);
  const shown = c.order[c.focus];
  const size = String(openOf(c, 0).length);
  // A Team-size change shows another life for the same hero, so it redraws too.
  if (shown && (c.panel.node.dataset['hero'] !== shown || c.panel.node.dataset['teamSize'] !== size)) {
    c.panel.node.dataset['hero'] = shown;
    c.panel.node.dataset['teamSize'] = size;
    c.panel.show(shown);
  }
}

/** Applies a model result: writes the selects and announces it. */
function applied(c: Ctx, s: SideIx, r: model.LockResult, id: string): boolean {
  announce(c, r.ok ? `${sideName(c, s)} picked ${shortName(id)} for slot ${String(r.index + 1)}.` : r.message.replace(id, shortName(id)));
  if (r.ok) writeBack(c);
  refresh(c);
  return r.ok;
}

function lockFor(c: Ctx, s: SideIx, i: number): boolean {
  const id = c.order[i];
  if (!id) return false;
  c.cursor[s] = i;
  c.focus = i;
  return applied(c, s, model.lock(c.teams[s], id), id);
}

/** A tile click or Enter: fills the aimed team; after the computer's team is done the aim goes back to Player 1, announced. */
function clickTile(c: Ctx, i: number): void {
  const s = c.aim;
  if (!lockFor(c, s, i) || s === 0 || !model.allMine(c.teams[s])) return;
  c.aim = 0;
  announce(c, `${c.live.textContent} Aim is back on ${sideName(c, 0)}.`);
  refresh(c);
}

function removeRow(c: Ctx, s: SideIx, i: number): void {
  const slot = c.teams[s].slots[i];
  if (!slot?.mine) return;
  model.removeAt(c.teams[s], i);
  c.aim = s;
  announce(c, `${shortName(slot.hero)} removed from slot ${String(i + 1)}.`);
  writeBack(c);
  refresh(c);
}

function rowClick(c: Ctx, s: SideIx, i: number): void {
  if (c.teams[s].slots[i]?.mine) {
    removeRow(c, s, i);
    return;
  }
  c.aim = s;
  announce(c, `Next pick goes to ${sideName(c, s)}.`);
  refresh(c);
}

function moveCursor(c: Ctx, s: SideIx, dx: number, dy: number): void {
  const n = c.order.length;
  const cur = c.cursor[s];
  let next = cur + dx + dy * c.columns();
  if (dx !== 0) next = Math.max(0, Math.min(n - 1, next));
  else if (next < 0 || next >= n) next = cur;
  c.cursor[s] = next;
  c.focus = next;
  refresh(c);
}

function cancelPick(c: Ctx, s: SideIx): void {
  const team = c.teams[s];
  const was = team.ready;
  const i = model.cancel(team);
  announce(c, was ? `${sideName(c, s)} is not ready.` : i >= 0 ? `Slot ${String(i + 1)} is empty again.` : 'Nothing to cancel.');
  writeBack(c);
  refresh(c);
}

function randomPick(c: Ctx, s: SideIx): void {
  const r = model.randomFill(c.teams[s], c.order, c.o.rng ?? Math.random);
  const id = r.ok ? (c.teams[s].slots[r.index]?.hero ?? '') : '';
  const k = c.order.indexOf(id as CharacterId);
  if (k >= 0) {
    c.cursor[s] = k;
    c.focus = k;
  }
  applied(c, s, r, id);
}

/** The pick key: lock the hero under the cursor; on a finished team it readies (two players) or fights (the computer). */
function pickKey(c: Ctx, s: SideIx): void {
  const action = model.pickKeyAction(c.teams[s], !isLocal(c));
  if (action === 'lock') {
    lockFor(c, s, c.cursor[s]);
    return;
  }
  if (action === 'fight') {
    c.o.fight();
    return;
  }
  const team = c.teams[s];
  team.ready = !team.ready;
  announce(c, `${sideName(c, s)} is ${team.ready ? 'ready' : 'not ready'}.`);
  refresh(c);
  if (c.teams[0].ready && c.teams[1].ready) {
    announce(c, 'Both players are ready. Fight!');
    c.o.fight();
  }
}

/** Keys and pads; the listeners go away once the page was shown and then removed. */
const listening = new Set<{ readonly node: HTMLElement; readonly off: () => void }>();

function bindInput(c: Ctx): void {
  // A view whose page was removed before it saw a key (a stale listener would swallow the key's default) stops now.
  for (const v of listening) {
    if (v.node.isConnected) continue;
    v.off();
    listening.delete(v);
  }
  let seen = false;
  let off = (): void => undefined;
  const gone = (): boolean => {
    if (c.node.isConnected) {
      seen = true;
      return false;
    }
    if (seen) off();
    return true;
  };
  const on = (s: SideIx, fn: () => void): void => {
    if (gone() || (s === 1 && !isLocal(c))) return;
    fn();
  };
  const handlers: PickInputHandlers = {
    move: (s, dx, dy) => { on(s, () => { moveCursor(c, s, dx, dy); }); },
    pick: (s) => { on(s, () => { pickKey(c, s); }); },
    cancel: (s) => { on(s, () => { cancelPick(c, s); }); },
    random: (s) => { on(s, () => { randomPick(c, s); }); },
    fight: () => { on(0, () => { c.o.fight(); }); },
    escape: () => undefined,
  };
  off = createInput(handlers);
  listening.add({ node: c.node, off: () => { off(); } });
  const watch = (): void => {
    if (gone()) return;
    requestAnimationFrame(watch);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(watch);
}

/** Adds the cursor and pick-chip slots to a grid tile and wires hover, focus and click. */
function decorateTile(t: HTMLButtonElement, i: number, ctx: () => Ctx): void {
  const flags = el('span', 'vsFlags');
  flags.hidden = true;
  const cur = el('span', 'vsCursors');
  cur.setAttribute('aria-hidden', 'true');
  t.append(flags, cur);
  const look = (): void => {
    const c = ctx();
    if (c.focus === i) return;
    c.focus = i;
    refresh(c);
  };
  t.addEventListener('pointerenter', look);
  t.addEventListener('focus', look);
  t.addEventListener('click', () => {
    clickTile(ctx(), i);
  });
}

const BLANK: TeamStackProps = { side: '', rows: [], aimed: false, ready: false, onRowClick: () => undefined, onRowRemove: () => undefined };

export function rosterView(o: RosterOptions): RosterView {
  const heroes = heroGrid({ races: o.races, onTile: (t, _id, i) => { decorateTile(t, i, () => c); } });
  const node = el('div', 'rosterPick vsStage');
  const live = el('p', 'srOnly');
  live.setAttribute('role', 'status');
  const panel = heroPanel(undefined, (id) => heroLife(id, Math.max(1, openOf(c, 0).length)));
  const stacks: [TeamStack, TeamStack] = [teamStack(BLANK), teamStack(BLANK)];
  stacks[0].el.classList.add('vsSide', 'vsSide1');
  stacks[1].el.classList.add('vsSide', 'vsSide2');
  node.append(stacks[0].el, panel.node, stacks[1].el, heroes.grid, live);
  const c: Ctx = {
    o, teams: [model.createTeam(0), model.createTeam(0)], cursor: [0, Math.min(1, heroes.order.length - 1)], aim: 0, focus: 0, seeded: false,
    order: heroes.order, tiles: heroes.tiles, columns: heroes.columns, stacks, panel, live, node,
  };
  bindInput(c);
  return {
    node,
    refresh: () => { refresh(c); },
    empties: () => c.teams.reduce((n, t) => n + t.slots.filter((x) => x === null).length, 0),
    randomAimed: () => { randomPick(c, c.aim); },
    confirm: (name) => {
      const s: SideIx = o.sides[0].includes(name) ? 0 : 1;
      const v = field(c, name)?.value ?? '';
      model.setAt(c.teams[s], o.sides[s].indexOf(name), v);
      const k = c.order.indexOf(v as CharacterId);
      if (k >= 0) {
        c.cursor[s] = k;
        if (s === c.aim) c.focus = k;
      }
    },
  };
}
