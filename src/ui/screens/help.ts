import { el } from '../dom';
import { getBindings, type Bindings } from '../../game/platform/input/bindings';
import { controlSections } from './help-controls';
import type { Screen } from './screen';

export interface HelpLink {
  readonly label: string;
  readonly route: string;
}

/** The player-facing help pages; the old menu entries live here now (routes unchanged for deep links). */
export const HELP_LINKS: readonly HelpLink[] = [
  { label: 'Key Bindings', route: 'keyBindings' },
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
      const list = el('ul', 'mainMenuList');
      for (const l of HELP_LINKS) {
        const li = el('li');
        li.dataset.route = l.route;
        const a = el('a', 'menuButton clickable', l.label);
        a.setAttribute('href', `#${l.route}`);
        li.append(a);
        list.append(li);
      }
      node.append(list);
      node.append(controlsSection());
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
