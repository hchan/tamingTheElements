import { getCharacter, type CharacterId } from '@core/index';
import { el } from '../dom';

/**
 * The grim select-screen dressing of the Tour stage card (WP tour-select-screen-redesign), its own lazy chunk. The plain card from
 * `tourCardView` is shown at once (every word and test hook stays); this adds the painted stage panel, the opponent portraits and the
 * icon pips, and loads `assets/css/tour-select.css`, which turns the stage list into a strip of painted tiles with a stamp on cleared
 * stages, a silhouette on locked ones and an animated frame on the current one. Icons are decorative (`aria-hidden`): the words stay.
 */

const base = (): string => import.meta.env.BASE_URL;

function loadCss(): void {
  if (document.getElementById('tourSelectCss')) return;
  const link = el('link');
  link.id = 'tourSelectCss';
  link.rel = 'stylesheet';
  link.href = `${base()}assets/css/tour-select.css`;
  document.head.append(link);
}

const pips = (kind: string, on: number, total: number): HTMLElement => {
  const s = el('span', `tsPips ${kind}`);
  s.setAttribute('aria-hidden', 'true');
  s.title = `${kind === 'tsLevel' ? 'Level' : 'Continues'}: ${String(on)} of ${String(total)}`;
  for (let i = 0; i < total; i++) s.append(el('i', i < on ? 'on' : undefined));
  return s;
};

/** Decorates the stage card in place: panel with the stage's lines, the roster portraits, difficulty and continue icons. */
export function enhanceStage(
  card: HTMLElement,
  stage: { readonly location: string; readonly aiLevel: string; readonly opponents: readonly CharacterId[] },
  continuesLeft: number,
  continuesMax: number,
  label: (id: CharacterId) => string,
): void {
  loadCss();
  card.classList.add('tsGrim');
  const lines = Array.from(card.querySelectorAll(':scope > p'));
  const panel = el('section', 'tsPanel');
  panel.dataset.element = stage.location;
  const roster = el('div', 'tsRoster');
  roster.setAttribute('aria-hidden', 'true');
  for (const id of stage.opponents) {
    const fig = el('figure', 'tsFoe');
    // The current painted portrait: first frame of the baked-sheet strip (the one the hero select uses), not the legacy Large art.
    const sprite = getCharacter(id).sprite;
    const img = el('span', 'tsFace heroFace');
    // The Void has no baked sheet (its strip is old flat pixel art): its painted portrait sits on the void swirl instead (tour-select.css `.tsVoid`).
    if (getCharacter(id).element === 'void') {
      img.classList.add('tsVoid');
      img.style.backgroundImage = `url("${base()}assets/img/map/${encodeURIComponent(sprite)}Large.png")`;
    } else img.style.backgroundImage = `url("${base()}assets/img/map/${encodeURIComponent(sprite)}.png")`;
    fig.append(img, el('figcaption', undefined, label(id)));
    roster.append(fig);
  }
  const at = (key: string, i: number): Element | undefined => lines.find((l) => (l as HTMLElement).dataset['fact'] === key) ?? lines[i];
  at('difficulty', 2)?.append(' ', pips('tsLevel', stage.aiLevel === 'easy' ? 1 : stage.aiLevel === 'normal' ? 2 : 3, 3));
  at('continues', 3)?.append(' ', pips('tsLives', continuesLeft, continuesMax));
  const info = el('div', 'tsInfo');
  info.append(...lines);
  panel.append(roster, info);
  const map = card.querySelector('#tourMap');
  if (map) map.before(panel);
  else card.querySelector('h1')?.after(panel);
}
