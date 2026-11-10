import { el } from '../dom';
import { versionStamp } from '../version';
import type { Screen } from './screen';

export const REPO_URL = 'https://github.com/hchan/tamingTheElements';

export interface AboutModel {
  readonly lines: readonly string[];
  readonly author: string;
  readonly contactText: string;
  readonly contactUrl: string;
  readonly version: string;
  readonly credits: readonly string[];
}

export const ABOUT_LINES: readonly string[] = [
  'Taming the Elements is a top-down elemental arena game.',
  'Pick an elemental, fight an opponent, win XP and capture weakened opponents into your garrison.',
];

/** Pure view-model. Contact is the GitHub repository (no personal email address). */
export function aboutModel(env: Readonly<Record<string, unknown>>): AboutModel {
  return {
    lines: ABOUT_LINES,
    author: 'Henry Chan',
    contactText:
      'Feel free to send me any suggestions or comments via the project page on GitHub. I hope you enjoyed playing this game!',
    contactUrl: REPO_URL,
    version: versionStamp(env),
    credits: ['Game design and code: Henry Chan', 'Built with Phaser, TypeScript and Vite'],
  };
}

export function aboutScreen(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      const m = aboutModel(import.meta.env);
      node = el('div', 'menuPage');
      node.append(el('h1', 'heading', 'About'));
      for (const line of m.lines) node.append(el('p', undefined, line));
      node.append(el('div', undefined, 'written by:'), el('div', undefined, m.author));
      const link = el('a', 'contactLink', m.contactUrl);
      link.setAttribute('href', m.contactUrl);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      node.append(el('p', undefined, m.contactText), link);
      node.append(el('h2', undefined, 'Credits'));
      for (const c of m.credits) node.append(el('div', undefined, c));
      const ver = el('div', 'versionStamp', m.version);
      ver.id = 'aboutVersion';
      node.append(ver);
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
