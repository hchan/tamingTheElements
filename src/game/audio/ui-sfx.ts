import { ELEMENTS, type Element } from '@core/menu-index';
import type { SfxKind } from './element-sfx';

/**
 * UI sounds for the DOM menus: one delegated listener, so no screen needs to know about audio. A click on a button, link or
 * summary is a `click` cue; choosing something in a picker (a toggle button with `aria-pressed`, a radio, a tab, an option)
 * is a `confirm` cue. The element voice comes from the nearest `data-element`, else a neutral default. The sound itself
 * (mute flag, volume, first-gesture unlock) is `playSfx`'s business; this file only decides what to ask for.
 */
export const UI_DEFAULT_ELEMENT: Element = 'water';

const CONTROL = 'button, a[href], summary, [role="button"], [role="radio"], [role="tab"], [role="option"], input[type="radio"], input[type="checkbox"], select';
const PICKER = '[aria-pressed], [aria-selected], [role="radio"], [role="tab"], [role="option"], input[type="radio"], input[type="checkbox"], select';

const isElement = (v: string | undefined): v is Element => (ELEMENTS as readonly string[]).includes(v ?? '');

/** The cue a click on `target` should make, or undefined for a non-control or a disabled one. */
export function uiCueFor(target: EventTarget | null): { kind: SfxKind; element: Element } | undefined {
  const t = target as { closest?: (s: string) => HTMLElement | null } | null;
  const control = t?.closest?.(CONTROL);
  if (!control) return undefined;
  if ((control as HTMLButtonElement).disabled || control.getAttribute('aria-disabled') === 'true') return undefined;
  const tagged = control.closest<HTMLElement>('[data-element]')?.dataset['element'];
  return { kind: control.matches(PICKER) ? 'confirm' : 'click', element: isElement(tagged) ? tagged : UI_DEFAULT_ELEMENT };
}

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Plays a cue for every control click inside `root`; returns the uninstaller. */
export function installUiSfx(root: Target, play: (kind: SfxKind, element: Element) => void): () => void {
  const onClick = (e: Event): void => {
    const cue = uiCueFor(e.target);
    if (cue) play(cue.kind, cue.element);
  };
  root.addEventListener('click', onClick, { capture: true });
  return () => { root.removeEventListener('click', onClick, { capture: true }); };
}
