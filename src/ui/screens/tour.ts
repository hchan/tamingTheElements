import type { CharacterId } from '@core/index';
import { el } from '../dom';
import { raceLabel, select } from './arcade-versus';

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

/** Three selects (lead, second, third hero) and Start tour. Repeats are replaced by the caller, which says so in the text. */
export function tourPickView(o: TourPickOptions): HTMLElement {
  const page = el('div', 'menuPage');
  page.id = 'tourPick';
  page.append(
    el('h1', 'heading', 'World Tour (preview)'),
    el(
      'p',
      undefined,
      'Pick three different heroes, then fight your way through nine stages, each a best-of-3 against an AI team: eight element locations, then the Eternal Void. A lost fight can be replayed up to 3 times. Your run is kept in this browser so you can resume it.',
    ),
  );
  const races = o.races.map((r) => ({ value: r, label: raceLabel(r) }));
  const form = el('form', 'settingsForm');
  const set = el('fieldset', 'settingsGroup');
  set.append(
    el('legend', 'heading', 'Your team'),
    select('hero1', 'Hero 1 (lead)', races, o.current[0]),
    select('hero2', 'Hero 2', races, o.current[1]),
    select('hero3', 'Hero 3', races, o.current[2]),
  );
  const start = el('button', 'menuButton', 'Start tour');
  start.type = 'submit';
  start.id = 'tourStart';
  const back = el('a', 'menuButton', 'Back');
  back.href = '#main';
  form.append(set, start, back);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    o.onStart(Object.fromEntries(new FormData(form)) as { hero1: string; hero2: string; hero3: string });
  });
  page.append(form);
  return page;
}
