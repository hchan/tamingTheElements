/** Replaces the container content with a plain message; used when WebGL is unavailable. */
export function showWebglError(root: HTMLElement): void {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  const h = document.createElement('h1');
  h.textContent = 'WebGL is required';
  const p = document.createElement('p');
  p.textContent =
    'Taming the Elements needs WebGL. Enable hardware acceleration or try a recent version of Chrome, Firefox, Edge or Safari.';
  box.append(h, p);
  root.replaceChildren(box);
}

/**
 * Replaces the container content with an error and a way out. `action` is a link to a route
 * (default: back to the main menu) so a failed screen never leaves the player stuck.
 */
export function showErrorScreen(root: HTMLElement, title: string, message: string, backHref = '#main'): void {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.className = 'menuPage';
  const h = document.createElement('h1');
  h.className = 'heading';
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  const back = document.createElement('a');
  back.className = 'menuButton';
  back.href = backHref;
  back.textContent = 'Back to menu';
  box.append(h, p, back);
  root.replaceChildren(box);
}
