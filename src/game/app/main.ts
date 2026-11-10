import { SIM_VERSION } from '@core/index';
import { currentRoute } from '@ui/router';
import { showWebglError } from '../boot/error-screen';
import { detectWebgl } from '../boot/webgl-check';
import { getUiFlags } from '../platform/flags';

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
  createGame('game');
}

if (root) {
  if (flags.play || flags.forceNoWebgl) {
    void enterPlay(root);
  } else {
    root.textContent = `Port in progress; play the legacy build. (sim v${String(SIM_VERSION)}, ${currentRoute()})`;
  }
}
