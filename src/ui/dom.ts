/** Create an element with optional class and text; text is set via textContent, never innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Routes to a hash route (`navigateHash('main')` or `'#main'`); the router follows hashchange. */
export function navigateHash(route: string): void {
  window.location.hash = route.startsWith('#') ? route : `#${route}`;
}

/** Find a required element by id or throw. */
export function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

/** Marks a scroll box `data-more` while content continues below its visible end (CSS draws the "More below" cue). Returns the updater. */
export function markMoreBelow(box: HTMLElement): () => void {
  const update = (): void => {
    box.toggleAttribute('data-more', box.scrollTop + box.clientHeight < box.scrollHeight - 2);
  };
  box.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!box.isConnected) ro.disconnect();
      else update();
    });
    ro.observe(box);
    for (const c of box.children) ro.observe(c);
  }
  return update;
}

/**
 * Keyboard "Jump to Fight" chip shared by the Versus and World Tour pickers: build it as the first control of the form (first Tab
 * stop; CSS shows it only while focused); activating it focuses the first enabled control of `targets` (Fight, else Random).
 */
export function jumpToFightChip(targets: readonly HTMLButtonElement[]): HTMLButtonElement {
  const chip = el('button', 'menuButton vsJumpFight', 'Jump to Fight');
  chip.type = 'button';
  chip.addEventListener('click', () => {
    (targets.find((t) => !t.disabled) ?? targets[0])?.focus();
  });
  return chip;
}
