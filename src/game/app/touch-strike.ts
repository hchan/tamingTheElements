import { el } from '@ui/dom';
import { actionKeyLabel, getBindings } from '../platform/input/bindings';
import { holdAction, releaseTouch } from './touch-controls';

/**
 * The right-thumb attack control of the touch battle (QA r39: "I could not see strike buttons"): two round, labelled buttons, Strike 1 and
 * Strike 2, bottom right above the action bar (mirrored for left-handed play like the stick). They hold the same keys as the bar's 1 and 2
 * boxes, so the sim sees the same commands; the bar boxes stay where they are. Hidden by CSS unless the primary pointer is coarse.
 */
export const STRIKES = [
  { id: 'touchStrike1', action: 'slot1', digit: 1 },
  { id: 'touchStrike2', action: 'slot2', digit: 2 },
] as const;

/** The key a strike button shows: the bound key of its action (as the action bar names it), else the default digit. */
export function strikeKey(action: 'slot1' | 'slot2', digit: number): string {
  return actionKeyLabel(getBindings(), action) ?? String(digit);
}

/** The strike buttons (Strike 2 first in the DOM: it sits left of Strike 1, so Tab follows the visual order). */
export function touchStrikes(): HTMLElement {
  const box = el('div', 'touchStrikes');
  box.id = 'touchStrikes';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Attack buttons');
  const buttons: HTMLButtonElement[] = [];
  for (const s of [...STRIKES].reverse()) {
    const b = el('button', 'touchStrike');
    b.type = 'button';
    b.id = s.id;
    const key = strikeKey(s.action, s.digit);
    const word = el('span', 'touchStrikeWord');
    word.textContent = 'Strike';
    const k = el('span', 'touchStrikeKey');
    k.textContent = key;
    b.append(word, k);
    b.setAttribute('aria-label', `${key} Strike`);
    holdAction(b, s.action);
    buttons.push(b);
    box.append(b);
  }
  // A strip removed mid-hold gets no pointerup: let go of the keys.
  const watch = setInterval(() => {
    if (box.isConnected) return;
    clearInterval(watch);
    for (const b of buttons) releaseTouch(b);
  }, 250);
  return box;
}
