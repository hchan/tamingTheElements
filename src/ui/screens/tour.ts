import type { CharacterId } from '@core/index';
import { el, jumpToFightChip, markMoreBelow } from '../dom';
import { select } from './arcade-versus';
import { faceUrl } from './hero-panel';
import { raceLabel, rosterView } from './roster-view';
import '../styles/tour-pick.css';
import '../styles/picker-min-text.css';

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

/** One chip on the stage card's Controls row: key caps, then the action word ("W A S D" + "Move"). */
export interface TourKeyChip { readonly keys: readonly string[]; readonly action: string; readonly note?: string }
export type TourFact =
  | { readonly key: string; readonly label: string; readonly value: string }
  | { readonly key: string; readonly label: string; readonly rows: readonly (readonly TourKeyChip[])[] };

export interface TourCardOptions {
  readonly id: string;
  readonly heading: string;
  /** One paragraph each. */
  readonly lines: readonly string[];
  readonly actions: readonly TourAction[];
  /** Adds the Main Menu link after the buttons (default true). */
  readonly menu?: boolean;
  /** Label and value rows (the stage card): each a scannable `Label: value` line, `key` is a stable hook for decoration. A `rows` fact is key chips (the Controls row). */
  readonly facts?: readonly TourFact[];
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
  for (const f of o.facts ?? []) {
    const p = el('p', 'tourFact');
    p.dataset['fact'] = f.key;
    const value = el('span', 'tourFactValue');
    if ('rows' in f) {
      p.classList.add('tourKeys');
      for (const row of f.rows) {
        const r = el('span', 'tourKeyRow');
        row.forEach((c, i) => {
          if (i > 0) r.append(' ');
          const chip = el('span', 'tourKey');
          chip.append(...c.keys.map((k) => el('kbd', undefined, k)));
          if (c.action !== '') chip.append(' ', c.action);
          if (c.note !== undefined) chip.append(' ', el('span', 'tourKeyNote', c.note));
          r.append(chip);
        });
        value.append(r, ' ');
      }
    } else value.textContent = f.value;
    p.append(el('span', 'tourFactLabel', `${f.label}:`), ' ', value);
    page.append(p);
  }
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

export interface TourVictoryOptions {
  readonly heroes: readonly { readonly id: CharacterId; readonly name: string }[];
  /** Words for the run summary, one paragraph each (stages, continues). */
  readonly lines: readonly string[];
  readonly onAgain: () => void;
}

/**
 * The World Tour victory screen: a title card, the three heroes' portraits, the run summary and Play again / Main Menu. The glow
 * is CSS and only animates when motion is allowed; the portraits are decoration (the names are in the text).
 */
export function tourVictoryView(o: TourVictoryOptions): HTMLElement {
  const page = el('div', 'menuPage tourVictory');
  page.id = 'tourEnding';
  const team = el('ul', 'tourVictoryTeam');
  for (const h of o.heroes) {
    const li = el('li');
    const face = el('span', 'heroFace');
    face.setAttribute('aria-hidden', 'true');
    face.style.backgroundImage = faceUrl(h.id);
    li.append(face, el('b', undefined, h.name));
    team.append(li);
  }
  const stats = el('div', 'tourVictoryStats');
  stats.append(...o.lines.map((t) => el('p', undefined, t)));
  const again = el('button', 'menuButton tourFightCta', 'Play again');
  again.type = 'button';
  again.id = 'tourAgain';
  again.addEventListener('click', o.onAgain);
  const menu = el('a', 'menuButton', 'Main Menu');
  menu.href = '#main';
  const actions = el('div', 'tourVictoryActions');
  actions.append(again, menu);
  page.append(
    el('p', 'tourVictoryKicker', 'World Tour'),
    el('h1', 'heading', 'The tour is complete!'),
    el('p', 'tourVictorySub', 'You beat all nine stages, the Eternal Void included.'),
    team,
    stats,
    actions,
  );
  return page;
}

export interface SplashMember {
  readonly name: string;
  readonly element: string;
  readonly id?: CharacterId;
}

export interface SplashSide {
  readonly who: string;
  /** "Fiara (fire)". */
  readonly name: string;
  readonly element: string;
  /** The hero, for the big portrait (omitted: no portrait). */
  readonly id?: CharacterId;
  /** The rest of the team (partners or enemy bench), shown small under the lead. */
  readonly bench?: readonly SplashMember[];
}

/** The stage and continues chip in the fight corner (plain text, never a live region); inline style so it sits right before any stylesheet loads. */
export function tourStageChip(stage: number, total: number, continues: number): HTMLElement {
  const chip = el('p', 'tourHudStage');
  chip.id = 'tourHudStage';
  const left = continues === 0 ? 'No continues left' : `${String(continues)} ${continues === 1 ? 'continue' : 'continues'} left`;
  const a = el('span', undefined, `Stage ${String(stage)} of ${String(total)}`);
  const b = el('span', undefined, left);
  a.style.display = b.style.display = 'block'; // two short lines: narrow enough to clear the action bar at phone-landscape size
  chip.append(a, ' ', b);
  Object.assign(chip.style, {
    position: 'absolute',
    left: '8px',
    bottom: '8px',
    margin: '0',
    zIndex: '4',
    pointerEvents: 'none',
    font: '600 clamp(12px, 1.7vh, 15px)/1.25 georgia, serif',
    color: '#ece6d6',
    background: 'rgb(10 10 16 / 0.72)',
    padding: '4px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  });
  return chip;
}

/**
 * The versus splash shown between Fight and the match (WP-tour-splash-ending): "Stage N of 9", your lead against the opponent lead,
 * each as an element shape plus words. Decorative SVG is hidden from assistive tech; the caller owns the timer and skipping.
 */
export function tourSplashView(
  stage: string,
  you: SplashSide,
  foe: SplashSide,
  glyph: (element: string) => SVGElement,
  stageName?: string,
): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'tourSplash';
  const side = (s: SplashSide): HTMLElement => {
    const d = el('div', 'vsFighter');
    d.dataset['element'] = s.element;
    // The portrait is decoration: the words below carry the name and element.
    const face = el('span', 'heroFace');
    face.setAttribute('aria-hidden', 'true');
    face.style.imageRendering = 'auto'; // the 80 px strips are scaled by a non-integer factor: smooth, not nearest-neighbour (QA r66)
    if (s.id !== undefined) face.style.backgroundImage = faceUrl(s.id);
    else face.hidden = true;
    const name = el('p', 'vsName', `${s.who}: ${s.name}`);
    name.dataset['element'] = s.element;
    d.append(face, glyph(s.element), name);
    if (s.bench && s.bench.length > 0) {
      d.append(el('p', 'vsBenchLabel', 'Teammates'));
      const ul = el('ul', 'vsBench');
      ul.setAttribute('aria-label', s.who === 'You' ? 'Your teammates' : "Opponent's teammates");
      for (const m of s.bench) {
        const li = el('li');
        li.dataset['element'] = m.element;
        const f = el('span', 'heroFace vsBenchFace');
        f.setAttribute('aria-hidden', 'true');
        f.style.width = f.style.height = 'clamp(32px, 7vh, 56px)';
        f.style.imageRendering = 'auto';
        if (m.id !== undefined) f.style.backgroundImage = faceUrl(m.id);
        li.append(f, el('span', 'vsBenchName', m.name));
        ul.append(li);
      }
      d.append(ul);
    }
    return d;
  };
  const row = el('div', 'vsCard');
  row.append(side(you), el('strong', 'vsVs', 'VS'), side(foe));
  page.append(el('h1', 'heading', stage));
  if (stageName !== undefined) page.append(el('p', 'vsStageName', stageName));
  page.append(row, el('p', undefined, 'Press Enter, Space or tap to skip.'));
  return page;
}


export interface TourPickOptions {
  readonly races: readonly CharacterId[];
  readonly current: readonly [string, string, string];
  readonly onStart: (v: { hero1: string; hero2: string; hero3: string }) => void;
}

const NAMES = ['hero1', 'hero2', 'hero3'] as const;
const LABELS = ['Hero 1 (lead)', 'Hero 2', 'Hero 3'] as const;

/**
 * The World Tour team picker on the shared MvC-style roster (`roster-view.ts`): one numbered team stack, the element-grouped grid and
 * the focused hero's panel. A pick (click, Enter, Space, pad A) locks the hero into the next empty slot, cancel (Q, pad B) pops the
 * last pick, Random fills one slot, a click on a filled row or Delete removes it. The three real selects stay in the form, visually
 * hidden and out of the Tab order, so the form data and labels are unchanged. Start waits until all three slots hold a hero.
 */
export function tourPickView(o: TourPickOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'tourPick';
  page.append(el('h1', 'heading', 'World Tour'));
  const intro = el('p', 'tourIntro', 'Pick three heroes, then fight through nine stages. Your run is saved in this browser.');
  const races = [{ value: '', label: 'Empty' }, ...o.races.map((r) => ({ value: r, label: raceLabel(r) }))];
  const form = el('form', 'settingsForm heroSelect');
  const hidden = el('fieldset', 'settingsGroup srOnly');
  hidden.setAttribute('aria-hidden', 'true');
  hidden.append(el('legend', undefined, 'Your team'));
  NAMES.forEach((n, i) => {
    const row = select(n, LABELS[i] ?? n, races, o.current[i]);
    row.querySelector('select')?.setAttribute('tabindex', '-1');
    hidden.append(row);
  });
  const fields = form.elements as unknown as Record<string, HTMLSelectElement>;
  const hint = el('p', 'heroHint');
  hint.id = 'tourHint';
  const start = el('button', 'menuButton tourStartCta', 'Start tour');
  start.setAttribute('aria-describedby', 'tourHint');
  start.type = 'submit';
  start.id = 'tourStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  const roster = rosterView({
    races: o.races,
    fields: () => fields,
    sides: [NAMES, []],
    single: true,
    rowId: (n) => `tourSlot${String(NAMES.indexOf(n as (typeof NAMES)[number]) + 1)}`,
    changed: () => form.dispatchEvent(new Event('change')),
    fight: () => {
      if (!start.disabled) form.requestSubmit();
    },
  });
  const random = el('button', 'menuButton vsRandom', 'Random');
  random.type = 'button';
  random.id = 'tourRandom';
  random.addEventListener('click', () => {
    roster.randomAimed();
  });
  const actions = el('div', 'heroActions');
  actions.append(random, start, hint, back);
  const scroll = el('div', 'pickScroll');
  scroll.append(intro, hidden, roster.node);
  form.append(jumpToFightChip([start, random]), scroll, actions);
  const more = markMoreBelow(scroll);
  const sync = (): void => {
    roster.refresh();
    const missing = roster.empties();
    start.disabled = missing > 0;
    hint.hidden = missing === 0;
    hint.textContent = missing === 0 ? '' : missing === NAMES.length ? 'Pick 3 heroes' : `Pick ${String(missing)} more hero${missing === 1 ? '' : 'es'}`;
    more();
  };
  sync();
  // A change made straight on a hero select (assistive tech, autofill, tests) counts as a pick and moves the detail pane.
  form.addEventListener('change', (e) => {
    if (e.target instanceof HTMLSelectElement) roster.confirm(e.target.name);
    sync();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (roster.empties() > 0) {
      const live = roster.node.querySelector('[role=status]');
      if (live) live.textContent = 'Pick all three heroes first.';
      return;
    }
    o.onStart(Object.fromEntries(new FormData(form)) as { hero1: string; hero2: string; hero3: string });
  });
  page.append(form);
  return page;
}
