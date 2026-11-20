import type { ScreenFactory } from '@ui/screens/screen';
import { lazyScreen } from './lazy-screen';

/**
 * The Online menu route: always the guest-first quick match, in its own lazy chunk so the menu entry loads nothing. A build with
 * no online service configured (VITE_ONLINE_URL, read only by `onlineConfig`) shows the quick match's "not available" message.
 */
export function onlineRoute(): ScreenFactory {
  return lazyScreen(
    () => import('./online-quick'),
    'Online',
    (a, c) => { a.mountQuickMatch(c); },
    (a) => { a.unmountQuickMatch(); },
  );
}
