/** Menu keyboard support: Escape goes back, Space activates a focused link, new screens take focus. */

/**
 * Route name to the hash Escape returns to, or null where Escape does nothing (main, and the battle hosts, which pause instead).
 * Placeholder sub-screens and the results screens leave to the main menu like every other sub-screen.
 * `arcade` hosts its own battle, so it handles Escape itself (only on its fighter picker).
 */
export function backHash(route: string): string | null {
  switch (route) {
    case 'main':
    case 'loading':
    case 'arcade':
    case 'tour':
      return null;
    case 'character':
      return '#garrison';
    default:
      return '#main';
  }
}

/** Elements where Escape or Space must keep their normal meaning. */
const TEXT_TARGETS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export interface KeyLike {
  readonly key: string;
  readonly defaultPrevented: boolean;
  readonly targetTag: string;
  readonly targetIsTextInput: boolean;
}

/** True when Escape should navigate back (not inside a text field, not already handled by a dialog). */
export function shouldGoBack(e: KeyLike): boolean {
  return e.key === 'Escape' && !e.defaultPrevented && !TEXT_TARGETS.has(e.targetTag) && !e.targetIsTextInput;
}

/** Links activate on Enter natively; this makes Space work too, like a button. */
export function shouldClickLinkOnSpace(e: { key: string; defaultPrevented: boolean; targetTag: string; hasHref: boolean }): boolean {
  return (e.key === ' ' || e.key === 'Spacebar') && !e.defaultPrevented && e.targetTag === 'A' && e.hasHref;
}

/** Moves focus to the screen heading so keyboard and screen-reader users start at the top of the new screen. */
export function focusHeading(root: ParentNode): void {
  const h = root.querySelector<HTMLElement>('h1');
  if (!h) return;
  h.tabIndex = -1;
  h.focus({ preventScroll: true });
}

/** Installs the document-level handlers; returns a function that removes them. */
export function installMenuKeys(doc: Document, currentRoute: () => string, navigate: (hash: string) => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    const tag = t?.tagName ?? '';
    if (shouldClickLinkOnSpace({ key: e.key, defaultPrevented: e.defaultPrevented, targetTag: tag, hasHref: t?.hasAttribute('href') === true })) {
      e.preventDefault();
      t?.click();
      return;
    }
    const back = backHash(currentRoute());
    if (back === null) return;
    if (doc.querySelector('#pauseOverlay:not([hidden])')) return;
    if (shouldGoBack({ key: e.key, defaultPrevented: e.defaultPrevented, targetTag: tag, targetIsTextInput: false })) {
      e.preventDefault();
      navigate(back);
    }
  };
  doc.addEventListener('keydown', onKey);
  return () => {
    doc.removeEventListener('keydown', onKey);
  };
}
