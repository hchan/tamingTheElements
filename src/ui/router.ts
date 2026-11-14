import { el } from './dom';
import { focusHeading, installMenuKeys } from './keyboard';
import { settingsScreen } from './screens/settings';
import { mainMenuScreen } from './screens/main-menu';
import type { Screen, ScreenFactory } from './screens/screen';
import { helpScreen } from './screens/help';
import { aboutScreen } from './screens/about';
import { guideScreen } from './screens/guide-lazy';
import { keyBindingsScreen } from './screens/key-bindings';
import { raceScreen } from './screens/race';
import { wikiScreen } from './screens/wiki';
import { garrisonScreen } from './screens/garrison';
import { gameMasterScreen } from './screens/game-master';
import { characterDetailsScreen } from './screens/character-details';
import { defeatScreen, victoryScreen } from './screens/results';

export const ROUTE_NAMES = [
  'main',
  'newGame',
  'garrison',
  'settings',
  'currentObjectives',
  'about',
  'storyMode',
  'wiki',
  'keyBindings',
  'battleground',
  'loading',
  'victory',
  'defeat',
  'exit',
  'race',
  'gameMaster',
  'character',
  'replay',
  'arcade',
  'online',
  'tour',
  'help',
  'guide',
] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

export interface ResolvedRoute {
  readonly name: RouteName;
  readonly param: string | null;
}

const MAIN: ResolvedRoute = { name: 'main', param: null };
const RACE_PREFIX = '#race_';
const CHARACTER_PREFIX = '#character_';
const RACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Explicit allow-list checked with Set.has, so prototype keys like __proto__ never match. */
const PLAIN_ROUTES: ReadonlySet<string> = new Set<RouteName>(
  ROUTE_NAMES.filter(
    (n) =>
      n !== 'race' &&
      n !== 'character' &&
      n !== 'main' &&
      (n !== 'gameMaster' || import.meta.env.DEV || import.meta.env.MODE === 'test'),
  ),
);

/** Neutral address-bar names for routes whose internal names are mode words; the old names still resolve and are rewritten. */
const CANONICAL_HASH: Readonly<Partial<Record<RouteName, string>>> = { arcade: 'versus', tour: 'play' };
const HASH_ALIASES: Readonly<Record<string, RouteName>> = { versus: 'arcade', play: 'tour' };

/** The address-bar fragment for a route (neutral name where the internal one is a mode word). */
export function routeHash(name: string): string {
  return `#${CANONICAL_HASH[name as RouteName] ?? name}`;
}

/** Pure hash resolution. Unknown, empty or prototype-ish hashes go to the main menu. */
export function resolveRoute(hash: string): ResolvedRoute {
  if (hash.startsWith(RACE_PREFIX)) {
    const id = hash.slice(RACE_PREFIX.length);
    return RACE_ID.test(id) ? { name: 'race', param: id } : MAIN;
  }
  if (hash.startsWith(CHARACTER_PREFIX)) {
    const id = hash.slice(CHARACTER_PREFIX.length);
    return RACE_ID.test(id) ? { name: 'character', param: id } : MAIN;
  }
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
  if (Object.hasOwn(HASH_ALIASES, name)) return { name: HASH_ALIASES[name] as RouteName, param: null };
  if (PLAIN_ROUTES.has(name)) return { name: name as RouteName, param: null };
  return MAIN;
}

/** Placeholder screen until each menu is ported. */
export function placeholderScreen(title: string): ScreenFactory {
  return (param) => {
    let node: HTMLElement | null = null;
    return {
      mount(container) {
        node = el('div', 'menuPage');
        node.append(el('h1', 'heading', param === null ? title : `${title}: ${param}`));
        container.append(node);
      },
      unmount() {
        node?.remove();
        node = null;
      },
    };
  };
}

export const APP_TITLE = 'Taming the Elements';

const ROUTE_TITLES: Readonly<Record<RouteName, string>> = {
  main: 'Main Menu',
  newGame: 'New Game',
  garrison: 'Garrison',
  settings: 'Settings',
  currentObjectives: 'Current Objectives',
  about: 'About',
  storyMode: 'Story Mode',
  wiki: 'Wiki',
  keyBindings: 'Key Bindings',
  battleground: 'Battleground',
  loading: 'Battle',
  victory: 'Results',
  defeat: 'Defeat',
  exit: 'Exit',
  race: 'Race Details',
  gameMaster: 'Game Master',
  character: 'Character Details',
  replay: 'Replay Viewer',
  arcade: 'Versus',
  online: 'Online',
  tour: 'Play',
  help: 'Help',
  guide: 'Guide',
};

/** Document title for a route, so each screen is named in the tab and to screen readers. */
export function routeTitle(name: RouteName): string {
  return name === 'main' ? APP_TITLE : `${ROUTE_TITLES[name]} - ${APP_TITLE}`;
}

export type ScreenTable = Readonly<Record<RouteName, ScreenFactory>>;

export function defaultScreens(): ScreenTable {
  return {
    main: mainMenuScreen(),
    newGame: placeholderScreen('New Game'),
    garrison: garrisonScreen(),
    settings: () => settingsScreen(),
    currentObjectives: placeholderScreen('Current Objectives'),
    about: aboutScreen,
    storyMode: placeholderScreen('Story Mode'),
    wiki: wikiScreen,
    keyBindings: () => keyBindingsScreen(),
    battleground: placeholderScreen('Battleground'),
    loading: placeholderScreen('Loading'),
    victory: victoryScreen,
    defeat: defeatScreen,
    exit: placeholderScreen('Exit'),
    race: raceScreen,
    // Statically removed from production builds; the route is also unreachable there (see PLAIN_ROUTES).
    gameMaster:
      import.meta.env.DEV || import.meta.env.MODE === 'test' ? () => gameMasterScreen() : placeholderScreen('Not available'),
    character: characterDetailsScreen(),
    replay: placeholderScreen('Replay viewer'),
    // The app wires the lazy Arcade Versus screen (src/game/app/main.ts); it is opt-in (Settings or `?ff=arcade`).
    arcade: placeholderScreen('Versus'),
    // The app wires the lazy online screen (src/game/app/online-versus.ts).
    online: placeholderScreen('Online'),
    // The app wires the lazy World Tour screen (src/game/app/tour.ts); opt-in like Arcade.
    tour: placeholderScreen('Play'),
    help: helpScreen,
    guide: guideScreen,
  };
}

/** Mounts the screen for the current hash and follows hashchange. Returns a stop function. */
export function startRouter(
  container: HTMLElement,
  screens: ScreenTable = defaultScreens(),
): () => void {
  let active: Screen | null = null;
  let current: RouteName = 'main';
  const show = (): void => {
    const route = resolveRoute(window.location.hash);
    current = route.name;
    // Old #arcade / #tour links keep working, but the address bar shows the neutral name.
    if (CANONICAL_HASH[route.name] !== undefined && window.location.hash !== routeHash(route.name)) {
      window.history.replaceState(null, '', routeHash(route.name));
    }
    active?.unmount();
    // Test builds only (statically removed from production): the e2e hook waits on this, as `hashchange` fires before the mount.
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') delete container.dataset.mountedRoute;
    active = screens[route.name](route.param);
    active.mount(container);
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') container.dataset.mountedRoute = window.location.hash;
    document.title = routeTitle(route.name);
    focusHeading(container);
  };
  window.addEventListener('hashchange', show);
  const removeKeys = installMenuKeys(document, () => current, (hash) => {
    window.location.hash = hash;
  });
  show();
  return () => {
    window.removeEventListener('hashchange', show);
    removeKeys();
    active?.unmount();
    active = null;
  };
}
