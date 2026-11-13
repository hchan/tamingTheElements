import type { Screen } from './screen';

/**
 * The Guide route as a thin lazy shell: the screen (and the core data it reads) loads as its own chunk the first time it is opened,
 * so the menu entry chunk stays small. Unmounting before the load finishes cancels the mount.
 */
export function guideScreen(): Screen {
  let inner: Screen | null = null;
  let gone = false;
  return {
    mount(container) {
      gone = false;
      void import('./guide').then((m) => {
        if (gone) return;
        inner = m.guideContent();
        inner.mount(container);
      });
    },
    unmount() {
      gone = true;
      inner?.unmount();
      inner = null;
    },
  };
}
