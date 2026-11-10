import type { TesterAwareStore, TesterSession } from '../../game/platform/tester/session';
import { mountTesterBadge } from './badge';
import { mountBenchPanel } from './bench-panel';
import { advanceKonami, KONAMI } from './code';
import { openTesterPanel } from './panel';

export interface TesterUiDeps {
  readonly session: TesterSession;
  readonly store: TesterAwareStore;
  readonly now: () => number;
}

/** Opens the tester panel; set by `installTesterUi`, a no-op before that (and in unit tests of single screens). */
let opener: () => void = () => undefined;

export function requestOpenTesterPanel(): void {
  opener();
}

/** True on the main menu route (the only place the key sequence counts). */
export function onMainMenu(hash: string): boolean {
  return hash === '' || hash === '#' || hash === '#main';
}

function editable(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  const tag = t?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable === true;
}

function refresh(): void {
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Mounts the TESTER MODE badge, the bench panel and the main-menu key-sequence listener, and wires the tester panel.
 * Everything stays hidden until the cheat code is entered (or `?cheats=1` in dev/test builds).
 */
export function installTesterUi(deps: TesterUiDeps): () => void {
  const { session, store, now } = deps;
  const open = (): void => {
    openTesterPanel({ session, store, now, confirm: (m) => window.confirm(m), refresh });
  };
  opener = open;
  const offBadge = mountTesterBadge(session, open);
  const offBench = mountBenchPanel(session);
  let progress = 0;
  const onKey = (e: KeyboardEvent): void => {
    if (!onMainMenu(window.location.hash) || editable(e.target) || session.enabled) {
      progress = 0;
      return;
    }
    progress = advanceKonami(progress, e.code);
    if (progress === KONAMI.length) {
      progress = 0;
      session.enable();
      refresh();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    offBadge();
    offBench();
    opener = () => undefined;
  };
}
