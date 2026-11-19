/**
 * Gives a button a plain-words subline, the way the main menu does: drawn by CSS from `data-sub`, announced through
 * `aria-describedby`, while the accessible name stays the bare label (Chromium counts ::after text in a name otherwise).
 * Only for buttons whose text never changes. Returns the screen-reader span; the caller appends it next to the button.
 */
import { el } from './dom';

export function withSub(btn: HTMLElement, id: string, label: string, sub: string): HTMLSpanElement {
  btn.dataset.sub = sub;
  btn.setAttribute('aria-label', label);
  const span = el('span', 'srOnly', sub);
  span.id = `${id}Sub`;
  btn.setAttribute('aria-describedby', span.id);
  return span;
}
