import { SNAG_DESCRIPTION, SNAG_NAME } from '@core/menu-index';
import { el } from '../dom';
import { getBindings, type Bindings } from '../../game/platform/input/bindings';
import { controlSections } from './help-controls';
import {
  ARENA_NOTES,
  ARENA_PATCHES,
  ARENA_PATCH_INTRO,
  ARENA_SHAPES,
  KEY_WORDS,
  LESSONS,
  MODES_COPY,
  PICKER_STEPS,
  actionBarKeys,
} from './help-guide';
import type { Screen } from './screen';
import '../styles/help.css';

export interface HelpLink {
  readonly label: string;
  readonly route: string;
}

/** The player-facing help pages; the old menu entries live here now (routes unchanged for deep links). */
export const HELP_LINKS: readonly HelpLink[] = [
  { label: 'Key Bindings', route: 'keyBindings' },
  { label: 'Guide', route: 'guide' },
  { label: 'Wiki', route: 'wiki' },
  { label: 'Watch the story', route: 'storyMode' },
  { label: 'About', route: 'about' },
];

export function helpScreen(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      node = el('div', 'menuPage');
      const title = el('h1', 'heading', 'Help');
      title.id = 'helpTitle';
      node.append(title);
      // The page runs thousands of pixels; a Back link only at the foot meant a long scroll to leave (QA r30).
      const backTop = el('a', 'menuLink helpBackTop', 'Back');
      backTop.setAttribute('href', '#main');
      node.append(backTop);
      const list = el('ul', 'helpLinks');
      for (const l of HELP_LINKS) {
        const li = el('li');
        li.dataset.route = l.route;
        const a = el('a', 'menuButton clickable', l.label);
        a.setAttribute('href', `#${l.route}`);
        li.append(a);
        list.append(li);
      }
      node.append(el('p', 'helpIntro', 'Open a section to read it.'), jumpNav(), list);
      node.append(howToFight(), modesSection(), arenaSection(), pickerSection(), controlsSection());
      const back = el('a', 'menuLink', 'Back');
      back.setAttribute('href', '#main');
      node.append(back);
      container.append(node);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}

/** In-page jump targets. Buttons, not `#id` anchors: the hash router owns location.hash, so an anchor would leave the page. */
export const HELP_SECTIONS: readonly { readonly label: string; readonly id: string }[] = [
  { label: 'How to fight', id: 'helpLessonsHeading' },
  { label: 'Ways to play', id: 'helpModesHeading' },
  { label: 'Reading the arena', id: 'helpArenaHeading' },
  { label: 'Choosing your heroes', id: 'helpPickerHeading' },
  { label: 'Controls', id: 'helpControlsHeading' },
];

function focusHeading(t: HTMLElement): void {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  t.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  t.setAttribute('tabindex', '-1');
  t.focus({ preventScroll: true });
}

function jumpNav(): HTMLElement {
  const nav = el('nav', 'helpJump');
  nav.setAttribute('aria-label', 'On this page');
  nav.append(el('span', 'helpJumpLabel', 'Jump to'));
  for (const s of HELP_SECTIONS) {
    const b = el('button', 'helpJumpBtn clickable', s.label);
    b.setAttribute('type', 'button');
    b.dataset.target = s.id;
    b.addEventListener('click', () => {
      const t = document.getElementById(s.id);
      if (!t) return;
      const d = t.closest('details');
      if (d) d.open = true;
      focusHeading(t);
    });
    nav.append(b);
  }
  return nav;
}

/** One collapsible section: `section > details > summary > h2`, then the body and a Back to top button. */
function collapsible(cls: string, id: string, title: string, open: boolean, body: readonly Node[]): HTMLElement {
  const sec = el('section', cls);
  sec.setAttribute('aria-labelledby', id);
  const d = el('details');
  d.open = open;
  const sum = el('summary', 'helpSummary');
  const h = el('h2', 'heading', title);
  h.id = id;
  sum.append(h);
  const top = el('button', 'helpTop clickable', 'Back to top');
  top.setAttribute('type', 'button');
  top.addEventListener('click', () => {
    const t = document.getElementById('helpTitle');
    if (t) focusHeading(t);
  });
  d.append(sum, ...body, top);
  sec.append(d);
  return sec;
}

/** A key as a chip; a symbol key also carries its word as a tooltip. */
function keyChip(k: string): HTMLElement {
  const kbd = el('kbd', undefined, k);
  const w = KEY_WORDS[k];
  if (w) kbd.title = w;
  return kbd;
}

/** First lessons: the fight loop as a numbered list, then the numbered action bar. */
function howToFight(b: Bindings = getBindings()): HTMLElement {
  const body: Node[] = [el('p', undefined, 'The arena forgives nothing. Learn the ground before the first blow.')];
  const ol = el('ol', 'helpSteps');
  for (const l of LESSONS) {
    const li = el('li');
    li.append(el('strong', undefined, `${l.title}. `), l.text);
    ol.append(li);
  }
  body.push(ol, el('h3', undefined, 'The action bar'));
  body.push(el('p', undefined, 'The boxes along the bottom of a battle are numbered. Press the key shown on a box to use it.'));
  const bar = el('ul', 'helpBar');
  for (const k of actionBarKeys(b)) {
    const li = el('li');
    li.append(keyChip(k.key));
    const w = KEY_WORDS[k.key];
    if (w) li.append(el('span', 'srOnly', ` (${w})`));
    li.append(` ${k.name}`);
    bar.append(li);
  }
  body.push(bar);
  return collapsible('helpPanel helpLessons', 'helpLessonsHeading', 'How to fight', true, body);
}

/** The menu entries in words, plus teams and the Snag rope. */
function modesSection(): HTMLElement {
  const body: Node[] = MODES_COPY.map((t) => el('p', undefined, t));
  body.push(el('p', undefined, `${SNAG_NAME} (some heroes): ${SNAG_DESCRIPTION}`));
  return collapsible('helpPanel helpModes', 'helpModesHeading', 'Ways to play', false, body);
}

/** Shapes, floor patches, badges, weather and meters. */
function arenaSection(): HTMLElement {
  const ul = el('ul', 'helpSteps');
  for (const t of ARENA_PATCHES) ul.append(el('li', undefined, t));
  const body: Node[] = [el('p', undefined, ARENA_SHAPES), el('p', undefined, ARENA_PATCH_INTRO), ul, ...ARENA_NOTES.map((t) => el('p', undefined, t))];
  return collapsible('helpPanel helpArena', 'helpArenaHeading', 'Reading the arena', false, body);
}

/** Picking a team, including taking a hero back out. */
function pickerSection(): HTMLElement {
  const ol = el('ol', 'helpSteps');
  for (const t of PICKER_STEPS) ol.append(el('li', undefined, t));
  return collapsible('helpPanel helpPicker', 'helpPickerHeading', 'Choosing your heroes', false, [ol]);
}

/** The Controls section of Help: one captioned table per input method (text only, so no colour-only cues). */
function controlsSection(b: Bindings = getBindings()): HTMLElement {
  const body: Node[] = [el('p', undefined, 'Player 1 keys follow your Key Bindings.')];
  for (const s of controlSections(b)) {
    const table = el('table', 'helpControlsTable');
    table.append(el('caption', undefined, s.title));
    const head = el('tr');
    for (const t of ['Action', 'Input']) {
      const th = el('th', undefined, t);
      th.setAttribute('scope', 'col');
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const r of s.rows) {
      const tr = el('tr');
      const th = el('th', undefined, r.action);
      th.setAttribute('scope', 'row');
      const td = el('td');
      if (r.chips && r.chips.length > 0) {
        r.chips.forEach((k, i) => {
          if (i > 0) td.append(' or ');
          td.append(keyChip(k));
          const w = KEY_WORDS[k];
          if (w) td.append(` (${w})`);
        });
      } else td.append(r.keys);
      tr.append(th, td);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    body.push(table);
  }
  return collapsible('helpControls', 'helpControlsHeading', 'Controls', false, body);
}
