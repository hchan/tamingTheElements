import { el } from './dom';
import { mainMenuScreen } from './screens/main-menu';
import type { Screen, ScreenFactory } from './screens/screen';

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
  'exit',
  'race',
] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

export interface ResolvedRoute {
  readonly name: RouteName;
  readonly param: string | null;
}

const MAIN: ResolvedRoute = { name: 'main', param: null };
const RACE_PREFIX = '#race_';
const RACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Explicit allow-list checked with Set.has, so prototype keys like __proto__ never match. */
const PLAIN_ROUTES: ReadonlySet<string> = new Set<RouteName>(
  ROUTE_NAMES.filter((n) => n !== 'race' && n !== 'main'),
);

/** Pure hash resolution. Unknown, empty or prototype-ish hashes go to the main menu. */
export function resolveRoute(hash: string): ResolvedRoute {
  if (hash.startsWith(RACE_PREFIX)) {
    const id = hash.slice(RACE_PREFIX.length);
    return RACE_ID.test(id) ? { name: 'race', param: id } : MAIN;
  }
  const name = hash.startsWith('#') ? hash.slice(1) : hash;
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
        node.append(el('div', 'heading', param === null ? title : `${title}: ${param}`));
        container.append(node);
      },
      unmount() {
        node?.remove();
        node = null;
      },
    };
  };
}

export type ScreenTable = Readonly<Record<RouteName, ScreenFactory>>;

export function defaultScreens(): ScreenTable {
  return {
    main: mainMenuScreen(),
    newGame: placeholderScreen('New Game'),
    garrison: placeholderScreen('Garrison'),
    settings: placeholderScreen('Settings'),
    currentObjectives: placeholderScreen('Current Objectives'),
    about: placeholderScreen('About'),
    storyMode: placeholderScreen('Story Mode'),
    wiki: placeholderScreen('Wiki'),
    keyBindings: placeholderScreen('Key Bindings'),
    battleground: placeholderScreen('Battleground'),
    loading: placeholderScreen('Loading'),
    victory: placeholderScreen('Victory'),
    exit: placeholderScreen('Exit'),
    race: placeholderScreen('Race'),
  };
}

/** Mounts the screen for the current hash and follows hashchange. Returns a stop function. */
export function startRouter(
  container: HTMLElement,
  screens: ScreenTable = defaultScreens(),
): () => void {
  let active: Screen | null = null;
  const show = (): void => {
    const route = resolveRoute(window.location.hash);
    active?.unmount();
    active = screens[route.name](route.param);
    active.mount(container);
  };
  window.addEventListener('hashchange', show);
  show();
  return () => {
    window.removeEventListener('hashchange', show);
    active?.unmount();
    active = null;
  };
}
