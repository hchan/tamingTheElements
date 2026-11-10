import { SIM_VERSION } from '@core/index';
import { currentRoute } from '@ui/router';

const root = document.getElementById('app');
if (root) {
  root.textContent = `Port in progress; play the legacy build. (sim v${SIM_VERSION}, ${currentRoute()})`;
}
