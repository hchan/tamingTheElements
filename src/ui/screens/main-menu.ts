import { migrate, objectivesMet } from '@core/menu-index';
import type { SaveV1 } from '@core/menu-index';
import { el } from '../dom';
import { activeSaveStorage, tester } from '../../game/platform/tester/session';
import { requestOpenTesterPanel } from '../tester/install';
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
  /** A non-interactive group heading (no button, not focusable): "Classic (original rules)". */
  readonly heading?: boolean;
}

const always = (): boolean => true;

export const MENU_ITEMS: readonly MenuItem[] = [
  { label: 'World Tour', route: 'tour', enabled: always },
  { label: 'Arcade Versus', route: 'arcade', enabled: always },
  { label: 'Online Versus', route: 'online', enabled: always },
  { label: 'Classic (original rules)', route: 'classic', enabled: always, heading: true },
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
    load: () => loadSave(activeSaveStorage()),
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
        page.append(el('h1', 'heading', 'Taming the Elements'));
        const list = el('ul', 'mainMenuList');
        for (const item of MENU_ITEMS) {
          if (item.heading) {
            const h = el('li', 'menuGroup', item.label);
            list.append(h);
            continue;
          }
          const on = item.enabled(state);
          const li = el('li');
          li.dataset.route = item.route;
          // A native button: Tab-focusable, Enter and Space activate, and disabled entries are announced as such.
          const btn = el('button', on ? 'clickable' : 'notClickableYet', item.label);
          btn.type = 'button';
          btn.disabled = !on;
          if (on) {
            btn.addEventListener('click', () => {
              d.navigate(item.route);
            });
          }
          li.append(btn);
          if (item.route === 'currentObjectives' && state.newObjectives) {
            const badge = el('span', undefined, '- NEW -');
            badge.id = 'newObjectives';
            li.append(badge);
          }
          list.append(li);
        }
        page.append(list);
        // Visible in every build: the Konami code still works, this is the same switch without it.
        const t = el('button', 'menuButton', tester.enabled ? 'Tester options' : 'Cheats');
        t.type = 'button';
        t.id = tester.enabled ? 'testerOptionsMenu' : 'cheatsMenu';
        t.addEventListener('click', () => {
          const first = !tester.enabled;
          if (first) {
            tester.enable();
            t.textContent = 'Tester options';
            t.id = 'testerOptionsMenu';
          }
          requestOpenTesterPanel(first);
        });
        page.append(t);
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
