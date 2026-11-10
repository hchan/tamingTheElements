import { BEATS, ELEMENTS } from '@core/index';
import type { Element } from '@core/index';
import { el } from '../dom';
import type { Screen } from './screen';

/** Advantage factor: attacker damage x1.25, defender damage taken /1.25. */
export const ELEMENT_FACTOR = 1.25;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pct(): number {
  return Math.round((ELEMENT_FACTOR - 1) * 100);
}

/** The element that beats `e` (its weakness), or undefined for void. */
function weakness(e: Element): Element | undefined {
  return ELEMENTS.find((x) => BEATS[x] === e);
}

/** Mirrors legacy getElementalTypeDescription; empty for void (neutral both ways). */
export function elementDescription(e: Element): string {
  const strong = BEATS[e];
  const weak = weakness(e);
  if (strong === undefined || weak === undefined) return '';
  const n = String(pct());
  return (
    `${cap(e)} elementals will do ${n}% more damage and take ${n}% less damage from ${cap(strong)} elementals.  ` +
    `However, they will do ${n}% less damage and take ${n}% more damage from ${cap(weak)} elementals.`
  );
}

/** Descriptions for every element that has relations, in ELEMENTS order. */
export function wikiLines(): readonly string[] {
  return ELEMENTS.map(elementDescription).filter((s) => s !== '');
}

export function wikiScreen(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      node = el('div', 'menuPage');
      node.append(el('h1', 'heading', 'Wiki'));
      for (const line of wikiLines()) node.append(el('p', 'wikiLine', line));
      node.append(el('p', 'wikiLine', 'Void elementals are neutral against every element.'));
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
