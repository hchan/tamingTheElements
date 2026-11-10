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
