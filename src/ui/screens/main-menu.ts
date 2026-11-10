import { migrate, objectivesMet } from '@core/index';
import type { SaveV1 } from '@core/index';
import { el } from '../dom';
import { versionStamp } from '../version';
import type { ScreenFactory } from './screen';

export const STORAGE_KEY = 'Taming the Elements';

export interface MenuState {
  readonly garrison: boolean;
  readonly settings: boolean;
  readonly objectives: boolean;
  readonly newObjectives: boolean;
}

/**
 * Enable rules from legacy updateGarrisonsLink/SettingsLink/ObjectivesLink.
 * Legacy getGameState never returns null (it falls back to chapter 0), so settings is always on.
 */
export function menuState(save: SaveV1 | null): MenuState {
  const started = save !== null && save.chapter !== 0;
  return {
    garrison: save !== null && save.garrison.length > 0,
    settings: true,
    objectives: started,
    newObjectives: started && objectivesMet(save),
  };
}

export interface MenuItem {
  readonly label: string;
  readonly route: string;
  readonly enabled: (s: MenuState) => boolean;
}

const always = (): boolean => true;

export const MENU_ITEMS: readonly MenuItem[] = [
  { label: 'New Game', route: 'newGame', enabled: always },
  { label: 'Continue', route: 'battleground', enabled: (s) => s.objectives },
  { label: 'Garrison', route: 'garrison', enabled: (s) => s.garrison },
  { label: 'Settings', route: 'settings', enabled: (s) => s.settings },
  { label: 'Current Objectives', route: 'currentObjectives', enabled: (s) => s.objectives },
  { label: 'Story Mode', route: 'storyMode', enabled: always },
  { label: 'Wiki', route: 'wiki', enabled: always },
  { label: 'Key Bindings', route: 'keyBindings', enabled: always },
  { label: 'About', route: 'about', enabled: always },
];

export function loadSave(storage: Pick<Storage, 'getItem'>): SaveV1 | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const r = migrate(JSON.parse(raw) as unknown);
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

export interface MainMenuDeps {
  readonly load: () => SaveV1 | null;
  readonly navigate: (route: string) => void;
}

function browserDeps(): MainMenuDeps {
  return {
    load: () => loadSave(window.localStorage),
    navigate: (route) => {
      window.location.hash = `#${route}`;
    },
  };
}

export function mainMenuScreen(deps?: MainMenuDeps): ScreenFactory {
  return () => {
    let node: HTMLElement | null = null;
    return {
      mount(container) {
        const d = deps ?? browserDeps();
        const state = menuState(d.load());
        const page = el('div', 'menuPage');
        page.append(el('div', 'heading', 'Taming the Elements'));
        const list = el('ul', 'mainMenuList');
        for (const item of MENU_ITEMS) {
          const on = item.enabled(state);
          const li = el('li', on ? 'clickable' : 'notClickableYet', item.label);
          li.dataset.route = item.route;
          if (on) {
            li.addEventListener('click', () => {
              d.navigate(item.route);
            });
          }
          list.append(li);
          if (item.route === 'currentObjectives' && state.newObjectives) {
            const badge = el('span', undefined, '- NEW -');
            badge.id = 'newObjectives';
            list.append(badge);
          }
        }
        page.append(list);
        const footer = el('div', 'versionStamp', versionStamp(import.meta.env));
        footer.id = 'versionStamp';
        page.append(footer);
        container.append(page);
        node = page;
      },
      unmount() {
        node?.remove();
        node = null;
      },
    };
  };
}
