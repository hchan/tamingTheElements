import { SIM_VERSION } from '@core/menu-index';
import { startRouter } from '@ui/router';
import '@ui/styles/main.css';
import { bindingsFromSave } from '@ui/screens/key-bindings';
import { applyA11y, applyUiScale, loadSave } from '@ui/screens/settings';
import { showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { applyPrefsToDocument, getPrefs } from '../platform/a11y/prefs';
import { getUiFlags } from '../platform/flags';
import { notify } from '../platform/storage/notices';
import { createReplayStore } from '../platform/storage/replay-store';
import { setBindings } from '../platform/input/bindings';
import { createSaveStore } from '../platform/storage/create-save-store';
import { createTesterStore, tester } from '../platform/tester/session';
import { installTesterUi } from '@ui/tester/install';
import { installTestHook } from '../platform/test-hook';
import { AppFlow } from './flow';
import { mountNoticeBanner } from './notice-banner';

const root = document.getElementById('app');
const flags = getUiFlags(window.location.search);
// Tester mode (opt-in, per tab): while on, saves go to a throwaway slot unless "Keep cheat progress" is set.
if (flags.cheats) tester.enable();
const realStore = createSaveStore(() => Date.now());
const store = createTesterStore(realStore, tester, () => Date.now());

async function enterPlay(app: HTMLElement): Promise<void> {
  if (!detectWebgl(flags.forceNoWebgl, () => document.createElement('canvas'))) {
    showWebglError(app);
    return;
  }
  applyUiScale(loadSave().displaySettings);
  app.replaceChildren();
  const game = document.createElement('div');
  game.id = 'game';
  app.append(game);
  // Phaser is loaded lazily so it stays in its own chunk and out of the menu path.
  const { createGame } = await import('../boot/phaser-config');
  createGame('game', flags.arenaDemo, flags.cinematicDemo);
}

/** Saved reduce-motion, high-contrast and key bindings take effect before the first screen; the OS is followed live while unset. */
function initAccessibility(): void {
  const save = loadSave();
  applyA11y(save);
  setBindings(bindingsFromSave(save));
  for (const q of ['(prefers-reduced-motion: reduce)', '(prefers-contrast: more)']) {
    window.matchMedia(q).addEventListener('change', () => {
      applyPrefsToDocument(getPrefs());
    });
  }
}

/**
 * The deterministic sim lives in its own `sim` chunk (kept out of the menu entry; see docs/PERFORMANCE.md). Fetch it once the
 * menu is interactive and the browser is idle so starting a match does not wait on it. A failure is ignored: the real
 * import at match start reports it.
 */
function prefetchSimWhenIdle(): void {
  const go = (): void => {
    void import('@core/lazy-index').catch(() => undefined);
  };
  const run = (): void => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1000);
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

if (root) {
  mountNoticeBanner();
  installTesterUi({ session: tester, store, now: () => Date.now() });
  initAccessibility();
  if (flags.play || flags.arenaDemo || flags.cinematicDemo || flags.forceNoWebgl) {
    void enterPlay(root);
  } else {
    const menu = document.createElement('main');
    menu.id = 'menu';
    menu.dataset.simVersion = String(SIM_VERSION);
    root.replaceChildren(menu);
    const flow = new AppFlow({
      store,
      flags,
      now: () => Date.now(),
      replays: createReplayStore(() => Date.now()),
      navigate: (route) => {
        window.location.hash = `#${route}`;
      },
    });
    startRouter(menu, {
      ...flow.screens(),
      // Arcade Versus (preview, FUN-DESIGN WP 11): a separate flow outside the story flow, in its own chunk loaded on first
      // use. `then` callbacks run in order, so every mount is followed by its unmount. A failed load (offline, or a newer
      // deploy removed the chunk) says so in the notice banner and returns to the menu.
      arcade: () => {
        const chunk = import('./arcade-versus');
        return {
          mount: (c) => {
            chunk.then(
              (a) => {
                a.mountArcade(c);
              },
              () => {
                notify('Arcade Versus could not load. Reload the page.');
                window.location.hash = '#main';
              },
            );
          },
          unmount: () => {
            chunk.then(
              (a) => {
                a.unmountArcade();
              },
              () => undefined,
            );
          },
        };
      },
      online: () => {
        const chunk = import('./online-versus');
        return {
          mount: (c) => {
            chunk.then(
              (a) => {
                a.mountOnline(c);
              },
              () => {
                notify('Online Versus could not load. Reload the page.');
                window.location.hash = '#main';
              },
            );
          },
          unmount: () => {
            chunk.then(
              (a) => {
                a.unmountOnline();
              },
              () => undefined,
            );
          },
        };
      },
    });
  }
  if (!(flags.play || flags.arenaDemo || flags.cinematicDemo || flags.forceNoWebgl)) prefetchSimWhenIdle();
  installTestHook(SIM_VERSION, async (json) => {
    const r = await store.importJson(json);
    if (r.ok) window.dispatchEvent(new HashChangeEvent('hashchange'));
    return r.ok;
  });
}
