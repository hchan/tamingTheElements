import { el } from '../dom';
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
