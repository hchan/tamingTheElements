import { SIM_VERSION } from '@core/index';
import { startRouter } from '@ui/router';
import '@ui/styles/main.css';
import { applyUiScale, loadSave } from '@ui/screens/settings';
import { showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { getUiFlags } from '../platform/flags';
import { createReplayStore } from '../platform/storage/replay-store';
import { createSaveStore } from '../platform/storage/create-save-store';
import { installTestHook } from '../platform/test-hook';
import { AppFlow } from './flow';

const root = document.getElementById('app');
const flags = getUiFlags(window.location.search);
const store = createSaveStore(() => Date.now());

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

if (root) {
  if (flags.play || flags.arenaDemo || flags.cinematicDemo || flags.forceNoWebgl) {
    void enterPlay(root);
  } else {
    const menu = document.createElement('div');
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
    startRouter(menu, flow.screens());
  }
  installTestHook(SIM_VERSION, async (json) => {
    const r = await store.importJson(json);
    if (r.ok) window.dispatchEvent(new HashChangeEvent('hashchange'));
    return r.ok;
  });
}
