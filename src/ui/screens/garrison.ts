import { seedSfc32 } from '@core/index';
import type { SaveV1 } from '@core/index';
import { el } from '../dom';
import { loadSave } from './main-menu';
import { createPortalFx, type PortalFx } from './portal-fx';
import type { ScreenFactory } from './screen';
import {
  EMPTY_SELECTION,
  buildMatchSetup,
  buttonStates,
  displayOrder,
  orderNumber,
  rowView,
  toggleSelection,
} from './garrison-model';
import type { MatchMode, MatchSetup, Selection } from './garrison-model';

export interface GarrisonDeps {
  readonly load: () => SaveV1 | null;
  readonly navigate: (route: string) => void;
  readonly alert: (message: string) => void;
  /** Seed for the opponent draw; the platform supplies it (core never reads a clock). */
  readonly seed: () => number;
  readonly onMatch: (setup: MatchSetup) => void;
  /** CSS background-image value for a character sprite key. */
  readonly avatarUrl: (sprite: string) => string;
}

function browserDeps(): GarrisonDeps {
  return {
    load: () => loadSave(window.localStorage),
    navigate: (route) => {
      window.location.hash = `#${route}`;
    },
    alert: (m) => {
      window.alert(m);
    },
    seed: () => Math.floor(Math.random() * 0x100000000),
    onMatch: () => undefined,
    avatarUrl: (sprite) => `url("img/map/${encodeURIComponent(sprite)}.png")`,
  };
}

const BUTTONS: readonly { mode: MatchMode; id: string; label: string }[] = [
  { mode: 'battle', id: 'enterBattlegroundContainer', label: 'Enter Battleground' },
  { mode: 'practice', id: 'enterPracticeContainer', label: 'Practice' },
  { mode: 'portal', id: 'enterPortalContainer', label: 'Enter Portal' },
];

export function garrisonScreen(deps?: GarrisonDeps): ScreenFactory {
  return () => {
    let node: HTMLElement | null = null;
    const fxs: PortalFx[] = [];
    return {
      mount(container) {
        const d = deps ?? browserDeps();
        const save = d.load();
        const page = el('div', 'menuPage');
        node = page;
        container.append(page);
        page.append(el('h1', 'heading', 'Garrison'));
        const back = el('a', 'menuLink', 'Back');
        back.setAttribute('href', '#main');
        if (save === null || save.garrison.length === 0) {
          page.append(el('div', undefined, 'No heroes yet.'), back);
          return;
        }
        let sel: Selection = EMPTY_SELECTION;
        const rows = displayOrder(save);
        const table = el('div');
        table.id = 'garrisonTable';
        table.setAttribute('role', 'group');
        table.setAttribute('aria-label', 'Heroes: select up to the allowed number, in battle order');
        const buttons = el('div');
        page.append(table, buttons, back);
        let refocus: string | null = null;

        const render = (): void => {
          table.replaceChildren();
          for (const entry of rows) {
            const v = rowView(entry);
            const n = orderNumber(sel, v.id);
            const row = el('div', n === null ? 'garrisonRow' : 'garrisonRow selectedGarrisonRow');
            row.id = v.id;
            // A keyboard-operable toggle: Tab to focus, Enter or Space to select, named by its visible text (name, level, XP, element, battle order).
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.setAttribute('aria-pressed', String(n !== null));
            const avatar = el('div', 'garrisonAvatar');
            avatar.style.backgroundImage = d.avatarUrl(v.sprite);
            avatar.style.backgroundSize = 'contain';
            avatar.style.backgroundRepeat = 'no-repeat';
            avatar.style.width = '80px';
            avatar.style.height = '80px';
            const info = el('div', 'garrisonInfoDiv');
            info.append(
              el('div', undefined, v.name),
              el('div', undefined, `Level ${String(v.level)}`),
              el('div', undefined, `XP ${String(v.xp)}`),
              el('div', `element-${v.element}`, v.element),
            );
            const order = el('div', 'battlegroundOrderContainer', n === null ? '' : String(n));
            if (n === null) order.hidden = true;
            row.append(avatar, info, order);
            const toggle = (): void => {
              sel = toggleSelection(sel, v.id, save.chapter);
              refocus = v.id;
              render();
            };
            row.addEventListener('click', toggle);
            row.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
              }
            });
            table.append(row);
          }
          for (const fx of fxs.splice(0)) fx.dispose();
          buttons.replaceChildren();
          const states = buttonStates(save.chapter, sel.order.length);
          for (const b of BUTTONS) {
            if (b.mode === 'portal' && !states.portalVisible) continue;
            const s = states[b.mode];
            const portal = b.mode === 'portal';
            const ready = s.enabled ? (portal ? 'readyToEnterPortal' : 'readyToEnterBattleground') : undefined;
            const btn = el('button', ready, b.label);
            btn.type = 'button';
            btn.id = b.id;
            if (portal) {
              // Legacy ChaoticFire: an ember canvas behind the label, animated while hovered or focused.
              const canvas = el('canvas');
              canvas.id = 'enterPortalCanvas';
              canvas.setAttribute('aria-hidden', 'true');
              btn.prepend(canvas);
              fxs.push(createPortalFx({ canvas: canvas, target: btn }));
            }
            btn.addEventListener('click', () => {
              if (s.message !== null) {
                d.alert(s.message);
                return;
              }
              const setup = buildMatchSetup(b.mode, save, sel, seedSfc32(d.seed(), 'meta'));
              if (setup === null) return;
              d.onMatch(setup);
              d.navigate('loading');
            });
            buttons.append(btn);
          }
          if (refocus !== null) {
            document.getElementById(refocus)?.focus();
            refocus = null;
          }
        };
        render();
      },
      unmount() {
        for (const fx of fxs.splice(0)) fx.dispose();
        node?.remove();
        node = null;
      },
    };
  };
}
