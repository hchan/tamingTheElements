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
