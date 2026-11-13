import type { CharacterId } from '@core/index';
import { el } from '../dom';
import { raceLabel, select } from './arcade-versus';
import { HERO_COLUMNS, heroProfile } from './hero-info';
import { heroDnd } from './hero-dnd';
import { faceUrl, heroGrid, heroPanel } from './hero-panel';

/**
 * DOM of the World Tour screens (FUN-DESIGN 2.18, WP-tour-shell): the team picker and plain cards (resume, stage, defeat, game
 * over, ending). Native labelled selects, buttons and links in the existing menu classes, so keyboard, touch and the 44 px rule
 * work without new CSS; every state is stated in words (never colour alone). Lazy-loaded with the Tour (`src/game/app/tour.ts`).
 */

export interface TourAction {
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
  /** Disabled buttons stay in the page (announced as dimmed) with their reason in the label. */
  readonly disabled?: boolean;
}

export interface TourCardOptions {
  readonly id: string;
  readonly heading: string;
  /** One paragraph each. */
  readonly lines: readonly string[];
  readonly actions: readonly TourAction[];
  /** Adds the Main Menu link after the buttons (default true). */
  readonly menu?: boolean;
  /** Shown between the paragraphs and the buttons (the Tour map). */
  readonly extra?: HTMLElement;
}

const mainMenuLink = (): HTMLAnchorElement => {
  const a = el('a', 'menuButton', 'Main Menu');
  a.href = '#main';
  return a;
};

/** A heading, paragraphs, buttons, and a link back to the main menu. The first enabled button is the one to press next. */
export function tourCardView(o: TourCardOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = o.id;
  page.append(el('h1', 'heading', o.heading), ...o.lines.map((t) => el('p', undefined, t)));
  if (o.extra) page.append(o.extra);
  const actions = el('div');
  for (const a of o.actions) {
    const b = el('button', 'menuButton', a.label);
    b.type = 'button';
    b.id = a.id;
    b.disabled = a.disabled === true;
    b.addEventListener('click', a.onClick);
    actions.append(b);
  }
  if (o.menu !== false) actions.append(mainMenuLink());
  page.append(actions);
  return page;
}

export interface SplashSide {
  readonly who: string;
  /** "Fiara (fire)". */
  readonly name: string;
  readonly element: string;
}

/**
 * The versus splash shown between Fight and the match (WP-tour-splash-ending): "Stage N of 9", your lead against the opponent lead,
 * each as an element shape plus words. Decorative SVG is hidden from assistive tech; the caller owns the timer and skipping.
 */
export function tourSplashView(stage: string, you: SplashSide, foe: SplashSide, glyph: (element: string) => SVGElement): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'tourSplash';
  const side = (s: SplashSide): HTMLElement => {
    const d = el('div');
    d.style.textAlign = 'center';
    d.append(glyph(s.element), el('p', undefined, `${s.who}: ${s.name}`));
    return d;
  };
  const row = el('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'center';
  row.style.alignItems = 'center';
  row.style.gap = '24px';
  row.append(side(you), el('strong', undefined, 'VS'), side(foe));
  page.append(el('h1', 'heading', stage), row, el('p', undefined, 'Press Enter, Space or tap to skip.'));
  return page;
}

export interface TourPickOptions {
  readonly races: readonly CharacterId[];
  readonly current: readonly [string, string, string];
  readonly onStart: (v: { hero1: string; hero2: string; hero3: string }) => void;
}

/**
 * The Play team picker (Marvel vs. Capcom style): three team slots, the element-grouped portrait grid and the focused hero's panel
 * (stats and what each ability does). Arrow keys or W A S D move, Enter or Space picks, a gamepad D-pad and A do the same, and the
 * mouse or touch picks by tap. The three real selects stay in the form, visually hidden and out of the Tab order, so the form data,
 * labels and tests are unchanged. Picking a hero already in another slot swaps the two. A slot can also be emptied (the x button,
 * Delete or Backspace on the slot, a second click or Enter on its hero's tile, dragging it off, gamepad B); Start waits until all three
 * slots hold a hero. An empty slot is a hidden select with the empty option.
 */
export function tourPickView(o: TourPickOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'tourPick';
  page.append(
    el('h1', 'heading', 'Play'),
    el(
      'p',
      undefined,
      'Pick three different heroes, then fight your way through nine stages, each a best-of-3 against an AI team: eight element locations, then the Eternal Void. A lost fight can be replayed up to 3 times. Your run is kept in this browser so you can resume it.',
    ),
  );
  const races = [{ value: '', label: 'Empty' }, ...o.races.map((r) => ({ value: r, label: raceLabel(r) }))];
  const form = el('form', 'settingsForm heroSelect');
  const names = ['hero1', 'hero2', 'hero3'] as const;
  const labels = ['Hero 1 (lead)', 'Hero 2', 'Hero 3'] as const;
  const hidden = el('fieldset', 'settingsGroup srOnly');
  hidden.setAttribute('aria-hidden', 'true');
  hidden.append(el('legend', undefined, 'Your team'));
  names.forEach((n, i) => {
    const row = select(n, labels[i] ?? n, races, o.current[i]);
    row.querySelector('select')?.setAttribute('tabindex', '-1');
    hidden.append(row);
  });
  const field = (i: number): HTMLSelectElement => form.elements.namedItem(names[i] ?? '') as HTMLSelectElement;

  const idAt = (i: number): CharacterId | '' => field(i).value as CharacterId | '';
  const panel = heroPanel(() => {
    dnd.disarm();
    pick(cursor);
  });
  const live = el('p', 'srOnly');
  live.setAttribute('role', 'status');
  let active = 0;
  let cursor = 0;
  const slotsBox = el('ol', 'heroSlots');
  slotsBox.setAttribute('aria-label', 'Your team');
  const slotButtons = names.map((_n, i) => {
    const b = el('button', 'menuButton heroSlot');
    b.type = 'button';
    b.id = `tourSlot${String(i + 1)}`;
    b.dataset['heroSlot'] = String(i);
    b.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        clear(i);
      }
    });
    b.addEventListener('click', () => {
      const armed = dnd.takeArmed();
      if (armed >= 0) {
        // Tap a hero to preview it, then tap a slot: the touch alternative to dragging.
        active = i;
        pick(armed);
        return;
      }
      active = i;
      refresh();
    });
    const li = el('li');
    li.append(b);
    slotsBox.append(li);
    return b;
  });
  const heroes = heroGrid({
    races: o.races,
    onTile: (t, _id, i) => {
      t.addEventListener('focus', () => {
        cursor = i;
        refresh();
      });
      t.addEventListener('pointerenter', () => {
        // A previewed hero stays in the panel while the pointer travels to "Add to team" or a slot.
        if (cursor !== i && dnd.armed() < 0) {
          cursor = i;
          refresh();
        }
      });
    },
  });
  const order = heroes.order;
  const dnd = heroDnd({
    root: form,
    tiles: heroes.tiles,
    previewTile: (i) => {
      cursor = i;
      refresh();
    },
    assignTile: (i) => {
      cursor = i;
      toggle(i);
    },
    dropTile: (i, slot) => {
      const id = order[i];
      if (id) assign(id, Number(slot));
    },
    slotDraggable: (slot) => idAt(Number(slot)) !== '',
    clearSlot: (slot) => {
      clear(Number(slot));
    },
    swapSlots: (a, b) => {
      const [fa, fb] = [field(Number(a)), field(Number(b))];
      [fa.value, fb.value] = [fb.value, fa.value];
      live.textContent = `Hero ${String(Number(a) + 1)} swapped with hero ${String(Number(b) + 1)}.`;
      refresh();
    },
  });
  function refresh(): void {
    slotButtons.forEach((b, i) => {
      const id = idAt(i);
      b.textContent = '';
      b.classList.toggle('heroSlotEmpty', id === '');
      if (id === '') {
        b.append(el('span', 'heroSlotLabel', labels[i] ?? ''), el('b', 'heroSlotName', 'Empty'));
      } else {
        const face = el('span', 'heroFace heroSlotFace');
        face.style.backgroundImage = faceUrl(id);
        face.setAttribute('aria-hidden', 'true');
        b.append(face, el('span', 'heroSlotLabel', labels[i] ?? ''), el('b', 'heroSlotName', heroProfile(id).name));
      }
      b.setAttribute('aria-pressed', String(i === active));
      b.classList.toggle('heroActive', i === active);
      // The x button sits next to the slot (a button cannot hold a button) and exists only while the slot holds a hero.
      const li = b.parentElement;
      li?.querySelector('.heroSlotClear')?.remove();
      if (li && id !== '') {
        const x = el('button', 'menuButton heroSlotClear', '\u00d7');
        x.type = 'button';
        x.setAttribute('aria-label', `Remove ${heroProfile(id).name} from slot ${String(i + 1)}`);
        x.addEventListener('click', () => {
          clear(i);
        });
        li.append(x);
      }
    });
    const missing = names.filter((_n, k) => idAt(k) === '').length;
    start.disabled = missing > 0;
    hint.hidden = missing === 0;
    hint.textContent = missing === 0 ? '' : missing === names.length ? 'Pick 3 heroes' : `Pick ${String(missing)} more hero${missing === 1 ? '' : 'es'}`;
    heroes.tiles.forEach((t, i) => {
      const inTeam = names.findIndex((_n, k) => idAt(k) !== '' && idAt(k) === order[i]);
      t.classList.toggle('heroCursor', i === cursor);
      t.classList.toggle('heroPicked', inTeam >= 0);
      t.setAttribute('aria-pressed', String(inTeam >= 0));
      t.querySelector('.heroFlag')?.remove();
      if (inTeam >= 0) t.append(el('span', 'heroFlag', `Slot ${String(inTeam + 1)}`));
    });
    const shown = order[cursor];
    if (shown && panel.node.dataset['hero'] !== shown) {
      panel.node.dataset['hero'] = shown;
      panel.show(shown);
    }
  }
  /** Puts `id` in slot `slot`; a hero already in another slot swaps places with this slot's hero, so there is never a duplicate. */
  function assign(id: CharacterId, slot: number): void {
    const target = field(slot);
    const old = target.value;
    const other = names.findIndex((_n, k) => k !== slot && field(k).value === id);
    if (other >= 0) field(other).value = old;
    target.value = id;
    live.textContent = `${heroProfile(id).name} is hero ${String(slot + 1)}.`;
    refresh();
  }
  /** Empties slot `slot` and makes it the active one, so the next pick refills it. */
  function clear(slot: number): void {
    const was = idAt(slot);
    if (was === '') return;
    field(slot).value = '';
    active = slot;
    live.textContent = `${heroProfile(was).name} removed from hero ${String(slot + 1)}.`;
    refresh();
  }
  /** Pick or toggle off: a hero already on the team (tile activated again) leaves it. */
  function toggle(i: number): void {
    const id = order[i];
    const slot = id ? names.findIndex((_n, k) => idAt(k) === id) : -1;
    if (slot >= 0) clear(slot);
    else pick(i);
  }
  function pick(i: number): void {
    const id = order[i];
    if (!id) return;
    assign(id, active);
    // On to the next empty slot, else the next one round.
    const empty = names.map((_n, k) => (active + 1 + k) % names.length).find((k) => idAt(k) === '');
    active = empty ?? (active + 1) % names.length;
    refresh();
  }
  /** Moves the cursor (and the focus, so the panel and screen readers follow). */
  const move = (dx: number, dy: number): void => {
    const n = order.length;
    let next = cursor + dx + dy * HERO_COLUMNS;
    if (dx !== 0) next = Math.max(0, Math.min(n - 1, next));
    else if (next < 0 || next >= n) next = cursor;
    cursor = next;
    dnd.disarm();
    heroes.tiles[next]?.focus();
    refresh();
  };
  const hint = el('p', 'heroHint');
  hint.id = 'tourHint';
  const start = el('button', 'menuButton', 'Start tour');
  start.setAttribute('aria-describedby', 'tourHint');
  start.type = 'submit';
  start.id = 'tourStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  const stage = el('div', 'heroStage');
  stage.append(heroes.grid, panel.node);
  const actions = el('div', 'heroActions');
  actions.append(start, hint, back);
  form.append(hidden, slotsBox, stage, live, actions);
  cursor = Math.max(0, order.indexOf(o.current[0] as CharacterId));
  refresh();
  // A change made straight on a hero select (assistive tech, autofill, tests) shows in the slots too.
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (names.some((_n, k) => idAt(k) === '')) {
      live.textContent = 'Pick all three heroes first.';
      return;
    }
    o.onStart(Object.fromEntries(new FormData(form)) as { hero1: string; hero2: string; hero3: string });
  });
  const keys: Record<string, [number, number]> = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
  };
  let seen = false;
  const onKey = (e: KeyboardEvent): void => {
    if (!page.isConnected) {
      if (seen) document.removeEventListener('keydown', onKey);
      return;
    }
    seen = true;
    const t = e.target;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || t instanceof HTMLSelectElement || t instanceof HTMLInputElement) return;
    const d = keys[e.code];
    if (!d) return;
    e.preventDefault();
    move(d[0], d[1]);
  };
  document.addEventListener('keydown', onKey);
  // Gamepad: D-pad or left stick moves, A picks, B steps back a slot and empties it; polled while the page is up.
  const held = new Map<string, boolean>();
  const poll = (): void => {
    if (!page.isConnected) {
      if (seen) return;
    } else seen = true;
    const pad = typeof navigator.getGamepads === 'function' ? navigator.getGamepads()[0] : undefined;
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const down = (b: number): boolean => pad.buttons[b]?.pressed === true;
      const states: [string, boolean][] = [
        ['up', down(12) || ay < -0.6], ['down', down(13) || ay > 0.6], ['left', down(14) || ax < -0.6], ['right', down(15) || ax > 0.6],
        ['pick', down(0)], ['back', down(1)],
      ];
      for (const [name, on] of states) {
        if (on && !held.get(name)) {
          if (name === 'up') move(0, -1);
          else if (name === 'down') move(0, 1);
          else if (name === 'left') move(-1, 0);
          else if (name === 'right') move(1, 0);
          else if (name === 'pick') pick(cursor);
          else {
            // Step back a slot and empty it when it holds a hero: B undoes the last pick.
            active = (active + names.length - 1) % names.length;
            if (idAt(active) !== '') clear(active);
            else refresh();
          }
        }
        held.set(name, on);
      }
    }
    requestAnimationFrame(poll);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(poll);
  page.append(form);
  return page;
}
