import { el } from '../dom';
import { getBindings, type Bindings } from '../../game/platform/input/bindings';
import { controlSections } from './help-controls';
import { LESSONS, PICKER_STEPS, actionBarKeys } from './help-guide';
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
      node.append(el('h1', 'heading', 'Help'));
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
      node.append(jumpNav(), list);
      node.append(howToFight(), pickerSection(), controlsSection());
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
  { label: 'Choosing your heroes', id: 'helpPickerHeading' },
  { label: 'Controls', id: 'helpControlsHeading' },
];

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
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      t.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      t.setAttribute('tabindex', '-1');
      t.focus({ preventScroll: true });
    });
    nav.append(b);
  }
  return nav;
}

/** First lessons: the fight loop as a numbered list, then the numbered action bar. */
function howToFight(b: Bindings = getBindings()): HTMLElement {
  const sec = el('section', 'helpPanel helpLessons');
  sec.setAttribute('aria-labelledby', 'helpLessonsHeading');
  const h = el('h2', 'heading', 'How to fight');
  h.id = 'helpLessonsHeading';
  sec.append(h, el('p', undefined, 'The arena forgives nothing. Learn the ground before the first blow.'));
  const ol = el('ol', 'helpSteps');
  for (const l of LESSONS) {
    const li = el('li');
    li.append(el('strong', undefined, `${l.title}. `), l.text);
    ol.append(li);
  }
  sec.append(ol);
  sec.append(el('h3', undefined, 'The action bar'));
  sec.append(el('p', undefined, 'The boxes along the bottom of a battle are numbered. Press the key shown on a box to use it.'));
  const bar = el('ul', 'helpBar');
  for (const k of actionBarKeys(b)) {
    const li = el('li');
    li.append(el('kbd', undefined, k.key), ` ${k.name}`);
    bar.append(li);
  }
  sec.append(bar);
  return sec;
}

/** Picking a team, including taking a hero back out. */
function pickerSection(): HTMLElement {
  const sec = el('section', 'helpPanel helpPicker');
  sec.setAttribute('aria-labelledby', 'helpPickerHeading');
  const h = el('h2', 'heading', 'Choosing your heroes');
  h.id = 'helpPickerHeading';
  sec.append(h);
  const ol = el('ol', 'helpSteps');
  for (const t of PICKER_STEPS) ol.append(el('li', undefined, t));
  sec.append(ol);
  return sec;
}

/** The Controls section of Help: one captioned table per input method (text only, so no colour-only cues). */
function controlsSection(b: Bindings = getBindings()): HTMLElement {
  const sec = el('section', 'helpControls');
  sec.setAttribute('aria-labelledby', 'helpControlsHeading');
  const h = el('h2', 'heading', 'Controls');
  h.id = 'helpControlsHeading';
  sec.append(h);
  sec.append(el('p', undefined, 'Player 1 keys follow your Key Bindings.'));
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
      tr.append(th, el('td', undefined, r.keys));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    sec.append(table);
  }
  return sec;
}
