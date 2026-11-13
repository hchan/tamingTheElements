import type { CharacterId } from '@core/index';
import { el } from '../dom';
import { raceLabel, select } from './arcade-versus';
import { HERO_COLUMNS, heroProfile } from './hero-info';
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
 * labels and tests are unchanged. Picking a hero already in another slot swaps the two.
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
  const races = o.races.map((r) => ({ value: r, label: raceLabel(r) }));
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

  const panel = heroPanel();
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
    b.addEventListener('click', () => {
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
        if (cursor !== i) {
          cursor = i;
          refresh();
        }
      });
      t.addEventListener('click', () => {
        cursor = i;
        pick(i);
      });
    },
  });
  const order = heroes.order;
  function refresh(): void {
    slotButtons.forEach((b, i) => {
      const id = field(i).value as CharacterId;
      b.textContent = '';
      const face = el('span', 'heroFace heroSlotFace');
      face.style.backgroundImage = faceUrl(id);
      face.setAttribute('aria-hidden', 'true');
      b.append(face, el('span', 'heroSlotLabel', labels[i] ?? ''), el('b', 'heroSlotName', heroProfile(id).name));
      b.setAttribute('aria-pressed', String(i === active));
      b.classList.toggle('heroActive', i === active);
    });
    heroes.tiles.forEach((t, i) => {
      const inTeam = names.findIndex((_n, k) => field(k).value === order[i]);
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
  function pick(i: number): void {
    const id = order[i];
    if (!id) return;
    const target = field(active);
    const old = target.value;
    const other = names.findIndex((_n, k) => k !== active && field(k).value === id);
    if (other >= 0) field(other).value = old;
    target.value = id;
    live.textContent = `${heroProfile(id).name} is hero ${String(active + 1)}.`;
    active = (active + 1) % names.length;
    refresh();
  }
  /** Moves the cursor (and the focus, so the panel and screen readers follow). */
  const move = (dx: number, dy: number): void => {
    const n = order.length;
    let next = cursor + dx + dy * HERO_COLUMNS;
    if (dx !== 0) next = Math.max(0, Math.min(n - 1, next));
    else if (next < 0 || next >= n) next = cursor;
    cursor = next;
    heroes.tiles[next]?.focus();
    refresh();
  };
  const start = el('button', 'menuButton', 'Start tour');
  start.type = 'submit';
  start.id = 'tourStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  const stage = el('div', 'heroStage');
  stage.append(heroes.grid, panel.node);
  const actions = el('div', 'heroActions');
  actions.append(start, back);
  form.append(hidden, slotsBox, stage, live, actions);
  cursor = Math.max(0, order.indexOf(o.current[0] as CharacterId));
  refresh();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
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
  // Gamepad: D-pad or left stick moves, A picks, B steps back a slot; polled while the page is up.
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
            active = (active + names.length - 1) % names.length;
            refresh();
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
