import type { ScreenFactory } from '@ui/screens/screen';
import { notify } from '../platform/storage/notices';

/**
 * A route whose screen lives in its own chunk, loaded on first use. All visits share ONE load promise: its `then` callbacks run in
 * registration order, so every mount is followed by its own unmount before the next mount. (A fresh `import()` per visit gives
 * distinct promises with no ordering between them; the router mounts twice at boot for `?hero=`, and the late unmount of the first
 * visit then tore down the second visit's screen, leaving an empty menu.) A failed load (offline, or a newer deploy removed the
 * chunk) says so in the notice banner, returns to the menu and is retried on the next visit.
 */
export function lazyScreen<M>(
  load: () => Promise<M>,
  label: string,
  mount: (m: M, c: HTMLElement) => void,
  unmount: (m: M) => void,
): ScreenFactory {
  let chunk: Promise<M> | undefined;
  return () => {
    chunk ??= load();
    const mine = chunk;
    return {
      mount: (c) => {
        mine.then(
          (m) => {
            mount(m, c);
          },
          () => {
            if (chunk === mine) chunk = undefined;
            notify(`${label} could not load. Reload the page.`);
            window.location.hash = '#main';
          },
        );
      },
      unmount: () => {
        mine.then(
          (m) => {
            unmount(m);
          },
          () => undefined,
        );
      },
    };
  };
}
