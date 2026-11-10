import type { TesterSession } from '../../game/platform/tester/session';
import { el } from '../dom';

/** Badge text: says clearly whether this session's progress is thrown away or kept. */
export function badgeText(keepProgress: boolean): string {
  return keepProgress ? 'TESTER MODE - keeping progress' : 'TESTER MODE - progress not saved';
}

/** The always-visible "TESTER MODE" badge (menus and play). Clicking it opens the tester panel. */
export function mountTesterBadge(session: TesterSession, onOpen: () => void, host: HTMLElement = document.body): () => void {
  const badge = el('button', 'testerBadge');
  badge.type = 'button';
  badge.id = 'testerBadge';
  badge.hidden = true;
  badge.addEventListener('click', onOpen);
  host.append(badge);
  const render = (): void => {
    badge.hidden = !session.enabled;
    if (session.enabled) {
      const text = badgeText(session.options.keepProgress);
      badge.textContent = text;
      badge.setAttribute('aria-label', `${text}. Open tester options.`);
    }
  };
  const off = session.subscribe(render);
  render();
  return () => {
    off();
    badge.remove();
  };
}
