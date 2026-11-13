import type { CharacterId } from '@core/menu-index';
import { el } from '../dom';
import { ELEMENT_MARKS } from '../element-marks';
import { ELEMENT_ORDER, HERO_COLUMNS, heroProfile, heroesByElement } from './hero-info';

/**
 * DOM of the hero select (Marvel vs. Capcom style): the element-grouped portrait grid and the focused-hero panel (large portrait,
 * stats, and each ability with icon, name, key and a plain description generated from the data in `hero-info.ts`). Shared by the
 * Versus picker and the Play team picker. Faces are graded grim with CSS (`.heroFace`, the in-game `hero-grade` look).
 */

const assetUrl = (kind: string, name: string): string => `${import.meta.env.BASE_URL}assets/img/${kind}/${encodeURIComponent(name)}.png`;

/** The portrait source: the hero's map sprite, first frame of the 4-frame strip. */
export const faceUrl = (id: CharacterId): string => `url("${assetUrl('map', heroProfile(id).sprite)}")`;

export interface HeroPanel {
  readonly node: HTMLElement;
  show: (id: CharacterId) => void;
  /** Relabels the action button ("Add to team" or "Remove from team"), which is only there when `onAdd` was given. */
  setAction: (label: string) => void;
}

/** An ability icon: the effect sprite's first frame, or the kind mark when the sprite is missing. */
function abilityIcon(mark: string, sprite: string | undefined): HTMLElement {
  const box = el('span', 'heroAbilityIcon');
  box.setAttribute('aria-hidden', 'true');
  box.append(el('span', 'heroAbilityMark', mark));
  if (sprite) {
    const img = el('img');
    img.alt = '';
    img.src = assetUrl('fx', sprite);
    img.addEventListener('load', () => {
      // Wide strips are frames side by side: show the first, not the whole strip squeezed in.
      if (img.naturalWidth >= img.naturalHeight * 3) img.classList.add('heroIconStrip');
    });
    img.addEventListener('error', () => {
      img.remove();
    });
    box.append(img);
  }
  return box;
}

/** The focused-hero panel. `show` rebuilds it for a hero (cheap: a handful of nodes); `onAdd` adds the "Add to team" button. */
export function heroPanel(onAdd?: () => void): HeroPanel {
  const node = el('section', 'heroPanel');
  node.setAttribute('aria-label', 'Hero details');
  // "Add to team": assigns the shown hero (the mouse and touch alternative to a second click or a drag).
  const add = el('button', 'menuButton heroAdd', 'Add to team');
  add.type = 'button';
  add.addEventListener('click', () => {
    onAdd?.();
  });
  const show = (id: CharacterId): void => {
    const p = heroProfile(id);
    node.textContent = '';
    node.dataset['element'] = p.element;
    const face = el('span', 'heroPortrait heroFace');
    face.style.backgroundImage = faceUrl(id);
    face.setAttribute('aria-hidden', 'true');
    const head = el('div', 'heroHead');
    const mark = el('span', 'heroMark', ELEMENT_MARKS[p.element] ?? '');
    mark.setAttribute('aria-hidden', 'true');
    head.append(el('h3', 'heroName', p.name), el('p', 'heroKind'), el('p', 'heroBlurb', p.blurb));
    head.querySelector('.heroKind')?.append(mark, ` ${p.element}`);
    const stats = el('dl', 'heroStats');
    for (const [label, value] of p.stats) {
      const row = el('div');
      row.append(el('dt', undefined, label), el('dd', undefined, value));
      stats.append(row);
    }
    const abil = el('ul', 'heroAbilities');
    for (const a of p.abilities) {
      const li = el('li', 'heroAbility');
      const key = el('span', 'heroKey', a.key);
      key.title = `Player 2: ${a.keyP2}`;
      const text = el('div', 'heroAbilityText');
      const title = el('p', 'heroAbilityName');
      title.append(el('b', undefined, a.name), ` (${a.kind}) `, key);
      text.append(title, el('p', 'heroAbilityDesc', a.description));
      li.append(abilityIcon(a.mark, a.sprite), text);
      abil.append(li);
    }
    const top = el('div', 'heroTop');
    top.append(face, head);
    node.append(top, ...(onAdd ? [add] : []), stats, el('h4', 'heroAbilitiesTitle', 'Abilities'), abil);
  };
  const setAction = (label: string): void => {
    add.textContent = label;
  };
  return { node, show, setAction };
}

export interface HeroGridOptions {
  readonly races: readonly CharacterId[];
  /** Builds the tile content (after the face): called once per hero. */
  readonly onTile?: (tile: HTMLButtonElement, id: CharacterId, index: number) => void;
}

/**
 * The portrait grid: a heading per element, three heroes under it. Returns the grid, the heroes in cursor order (rows of
 * `HERO_COLUMNS`, so index +/- 1 moves sideways and +/- 3 moves a row) and the tile of each.
 */
export function heroGrid(o: HeroGridOptions): { grid: HTMLElement; order: CharacterId[]; tiles: HTMLButtonElement[] } {
  const order = heroesByElement(o.races);
  const grid = el('div', 'heroGrid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Heroes');
  const tiles: HTMLButtonElement[] = [];
  let last = '';
  order.forEach((id, i) => {
    const p = heroProfile(id);
    if (p.element !== last && ELEMENT_ORDER.includes(p.element)) {
      last = p.element;
      const h = el('h3', 'heroGroup');
      h.dataset['element'] = p.element;
      const mark = el('span', 'heroMark', ELEMENT_MARKS[p.element] ?? '');
      mark.setAttribute('aria-hidden', 'true');
      h.append(mark, ` ${p.element}`);
      grid.append(h);
    }
    const t = el('button', 'menuButton heroTile');
    t.type = 'button';
    t.dataset['element'] = p.element;
    const face = el('span', 'heroFace heroTileFace');
    face.style.backgroundImage = faceUrl(id);
    face.setAttribute('aria-hidden', 'true');
    t.append(face, el('span', 'heroTileName', p.name), el('span', 'srOnly', ` (${p.element})`));
    o.onTile?.(t, id, i);
    tiles.push(t);
    grid.append(t);
  });
  return { grid, order, tiles };
}

export { HERO_COLUMNS };
