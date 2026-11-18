import type { ScreenFactory } from '@ui/screens/screen';
import { onlineConfig, type OnlineConfig } from '../net/ws/config';
import { lazyScreen } from './lazy-screen';

/**
 * The Online menu route. A build with an online service configured (VITE_ONLINE_URL, read only by `onlineConfig`) opens the
 * guest-first quick match; any other build keeps the existing peer-to-peer Online screen unchanged. Both screens stay in their own
 * lazy chunks, so the menu entry loads neither.
 */
export function onlineRoute(config: OnlineConfig = onlineConfig()): ScreenFactory {
  if (config.configured) {
    return lazyScreen(
      () => import('./online-quick'),
      'Online',
      (a, c) => { a.mountQuickMatch(c); },
      (a) => { a.unmountQuickMatch(); },
    );
  }
  return lazyScreen(
    () => import('./online-versus'),
    'Online',
    (a, c) => { a.mountOnline(c); },
    (a) => { a.unmountOnline(); },
  );
}
