import { migrate, objectivesMet } from '@core/menu-index';
import type { SaveV1 } from '@core/menu-index';
import { el } from '../dom';
import { activeSaveStorage } from '../../game/platform/tester/session';
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
  /** One plain-words line under the label (CSS ::after from data-sub; read by screen readers via aria-describedby). */
  readonly sub: string;
  readonly enabled: (s: MenuState) => boolean;
}

const always = (): boolean => true;

export const MENU_ITEMS: readonly MenuItem[] = [
  { label: 'Play', route: 'tour', sub: 'A tour of nine fights', enabled: always },
  { label: 'Versus', route: 'arcade', sub: 'The computer, or two players, same screen', enabled: always },
  { label: 'Online', route: 'online', sub: 'Play a friend over the internet', enabled: always },
  { label: 'Settings', route: 'settings', sub: 'Sound, controls and display', enabled: (s) => s.settings },
  { label: 'Help', route: 'help', sub: 'How to play', enabled: always },
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
    let removeShowcase: (() => void) | null = null;
    let alive = false;
    return {
      mount(container) {
        const d = deps ?? browserDeps();
        const state = menuState(d.load());
        const page = el('div', 'menuPage');
        page.append(el('h1', 'heading', 'Taming the Elements'));
        const list = el('ul', 'mainMenuList');
        for (const item of MENU_ITEMS) {
          const on = item.enabled(state);
          const li = el('li');
          li.dataset.route = item.route;
          // A native button: Tab-focusable, Enter and Space activate, and disabled entries are announced as such.
          const btn = el('button', on ? 'clickable' : 'notClickableYet', item.label);
          btn.type = 'button';
          btn.disabled = !on;
          // Every entry carries a plain-words subline: drawn by CSS from data-sub, announced via aria-describedby. The name stays the bare label.
          btn.dataset.sub = item.sub;
          btn.setAttribute('aria-label', item.label);
          const subId = `menuSub-${item.route}`;
          const subEl = el('span', 'srOnly', item.sub);
          subEl.id = subId;
          btn.setAttribute('aria-describedby', subId);
          // Online is the one featured (gold) entry; Play keeps first focus; Settings and Help are the quiet two-up row.
          if (item.route === 'online') btn.classList.add('menuFeatured');
          if (item.route === 'settings' || item.route === 'help') li.classList.add('menuMinor');
          if (on) {
            btn.addEventListener('click', () => {
              d.navigate(item.route);
            });
          }
          li.append(btn, subEl);
          list.append(li);
        }
        page.append(list);
        // Keyboard-first players: focus the first usable entry, so Enter or Space activates it straight away (arrow keys / Tab move on).
        const first = list.querySelector<HTMLButtonElement>('button:not(:disabled)');
        if (first) queueMicrotask(() => { first.focus({ preventScroll: true }); });
        const footer = el('div', 'versionStamp', versionStamp(import.meta.env));
        footer.id = 'versionStamp';
        page.append(footer);
        container.append(page);
        node = page;
        // Decorative hero layer, its own lazy chunk (aria-hidden, no pointer, no focus; WP M1).
        alive = true;
        void import('./menu-showcase')
          .then((m) => {
            if (alive) removeShowcase = m.mountShowcase(container);
          })
          .catch(() => undefined);
      },
      unmount() {
        alive = false;
        removeShowcase?.();
        removeShowcase = null;
        node?.remove();
        node = null;
      },
    };
  };
}
