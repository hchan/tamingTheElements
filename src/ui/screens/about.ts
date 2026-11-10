import { el } from '../dom';
import type { Screen } from './screen';

export const ABOUT_LINES: readonly string[] = [
  'Taming the Elements is a top-down elemental arena game.',
  'Pick an elemental, fight an opponent, win XP and capture weakened opponents into your garrison.',
];

export function aboutScreen(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      node = el('div', 'menuPage');
      node.append(el('div', 'heading', 'About'));
      for (const line of ABOUT_LINES) node.append(el('p', undefined, line));
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
