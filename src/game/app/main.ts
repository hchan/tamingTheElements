import { SIM_VERSION } from '@core/index';
import { startRouter } from '@ui/router';
import '@ui/styles/main.css';
import { showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { getUiFlags } from '../platform/flags';
import { installTestHook } from '../platform/test-hook';

const root = document.getElementById('app');
const flags = getUiFlags(window.location.search);

async function enterPlay(app: HTMLElement): Promise<void> {
  if (!detectWebgl(flags.forceNoWebgl, () => document.createElement('canvas'))) {
    showWebglError(app);
    return;
  }
  app.replaceChildren();
  const game = document.createElement('div');
  game.id = 'game';
  app.append(game);
  // Phaser is loaded lazily so it stays in its own chunk and out of the menu path.
  const { createGame } = await import('../boot/phaser-config');
  createGame('game', flags.arenaDemo);
}

if (root) {
  if (flags.play || flags.arenaDemo || flags.forceNoWebgl) {
    void enterPlay(root);
  } else {
    const menu = document.createElement('div');
    menu.id = 'menu';
    menu.dataset.simVersion = String(SIM_VERSION);
    root.replaceChildren(menu);
    startRouter(menu);
  }
  installTestHook(SIM_VERSION);
}
