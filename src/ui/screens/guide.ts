import { getBindings } from '../../game/platform/input/bindings';
import { el } from '../dom';
import { focusHeading } from '../keyboard';
import { ELEMENT_MARKS } from '../element-marks';
import { iconSvg } from './guide-icons';
import {
  WHEEL_ORDER,
  commonAbilities,
  elementalAbilities,
  multText,
  weatherCards,
  wheelArrows,
  type AbilityCard,
} from './guide-data';
import type { Screen } from './screen';
import '../styles/guide.css';

const NS = 'http://www.w3.org/2000/svg';
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Node centres on a 400 x 400 wheel, clockwise from the top (the same order as WHEEL_ORDER). */
const NODES: readonly (readonly [number, number])[] = [
  [200, 64],
  [336, 200],
  [200, 336],
  [64, 200],
];

function svgEl(tag: string, attrs: Readonly<Record<string, string>>, text?: string): SVGElement {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

/** The damage wheel: four element discs, an arrow from each element to the one it beats, the multiplier on the arrow. */
export function wheelSvg(): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 400 400', class: 'guideWheel', role: 'img', 'aria-label': 'Element damage wheel' }) as SVGSVGElement;
  svg.append(svgEl('defs', {}));
  const defs = svg.firstChild as SVGElement;
  const marker = svgEl('marker', { id: 'guideArrowHead', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto' });
  marker.append(svgEl('path', { d: 'M0 0L10 5L0 10z', class: 'guideArrowFill' }));
  defs.append(marker);
  svg.append(svgEl('circle', { cx: '200', cy: '200', r: '136', class: 'guideRing' }));
  for (const a of wheelArrows()) {
    const [x1, y1] = NODES[WHEEL_ORDER.indexOf(a.from)] ?? [0, 0];
    const [x2, y2] = NODES[WHEEL_ORDER.indexOf(a.to)] ?? [0, 0];
    // Shorten both ends so the arrow clears the discs, and bow it outwards from the centre.
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;
    const sx = x1 + ux * 40;
    const sy = y1 + uy * 40;
    const ex = x2 - ux * 44;
    const ey = y2 - uy * 44;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const cx = mx + (mx - 200) * 0.45;
    const cy = my + (my - 200) * 0.45;
    const g = svgEl('g', { class: 'guideArrow', 'data-from': a.from, 'data-to': a.to });
    g.append(svgEl('path', { d: `M${String(sx)} ${String(sy)} Q${String(cx)} ${String(cy)} ${String(ex)} ${String(ey)}`, class: 'guideArrowLine', 'marker-end': 'url(#guideArrowHead)' }));
    const lx = (sx + 2 * cx + ex) / 4;
    const ly = (sy + 2 * cy + ey) / 4;
    g.append(svgEl('rect', { x: String(lx - 26), y: String(ly - 12), width: '52', height: '24', rx: '4', class: 'guideArrowTag' }));
    g.append(svgEl('text', { x: String(lx), y: String(ly + 5), 'text-anchor': 'middle', class: 'guideArrowText' }, multText(a.mult)));
    svg.append(g);
  }
  WHEEL_ORDER.forEach((e, i) => {
    const [x, y] = NODES[i] ?? [0, 0];
    const g = svgEl('g', { class: `guideNode el-${e}`, 'data-element': e });
    g.append(svgEl('circle', { cx: String(x), cy: String(y), r: '36', class: 'guideDisc' }));
    g.append(svgEl('text', { x: String(x), y: String(y - 2), 'text-anchor': 'middle', class: 'guideMark' }, ELEMENT_MARKS[e] ?? ''));
    g.append(svgEl('text', { x: String(x), y: String(y + 18), 'text-anchor': 'middle', class: 'guideNodeName' }, cap(e)));
    svg.append(g);
  });
  return svg;
}

function card(c: AbilityCard, extraClass: string): HTMLElement {
  const li = el('li', `guideCard ${extraClass}`);
  li.dataset.id = c.id;
  const head = el('div', 'guideCardHead');
  head.append(iconSvg(c.icon));
  head.append(el('h3', 'guideCardName', c.name));
  head.append(el('span', 'guideKey', c.key));
  li.append(head);
  const cd = el('p', 'guideCooldown');
  cd.append(el('span', 'guideLabel', 'Cooldown '), document.createTextNode(c.cooldown));
  li.append(cd, el('p', 'guideEffect', c.effect));
  return li;
}

function section(id: string, title: string, intro: string): HTMLElement {
  const s = el('section', 'guideSection');
  s.setAttribute('aria-labelledby', id);
  const h = el('h2', 'heading', title);
  h.id = id;
  s.append(h, el('p', 'guideIntro', intro));
  return s;
}

function wheelSection(): HTMLElement {
  const s = section('guideWheelHeading', 'Element wheel', 'Each element beats the next one round the wheel. The arrow points at the element that takes more damage.');
  const body = el('div', 'guideWheelBody');
  body.append(wheelSvg());
  const list = el('ul', 'guideWheelList');
  for (const a of wheelArrows()) {
    const li = el('li');
    li.dataset.from = a.from;
    li.dataset.to = a.to;
    li.textContent = `${ELEMENT_MARKS[a.from] ?? ''} ${cap(a.from)} beats ${ELEMENT_MARKS[a.to] ?? ''} ${cap(a.to)}: ${multText(a.mult)} damage dealt, and ${cap(a.to)} hits ${cap(a.from)} for only ${multText(a.back)}.`;
    list.append(li);
  }
  list.append(el('li', undefined, `${ELEMENT_MARKS['void'] ?? ''} Void is neutral against every element.`));
  body.append(list);
  s.append(body);
  return s;
}

function abilitySection(): HTMLElement {
  const b = getBindings();
  const s = section('guideAbilitiesHeading', 'Abilities', 'Every fighter has these. Keys follow your Key Bindings (Player 1).');
  const common = el('ul', 'guideCards');
  for (const c of commonAbilities(b)) common.append(card(c, 'guideCommon'));
  s.append(common);
  s.append(el('h3', 'guideSubheading', 'Element ability'));
  s.append(el('p', 'guideIntro', 'One extra button, set by the hero\'s element. Always ready on its own cooldown.'));
  const elem = el('ul', 'guideCards');
  for (const c of elementalAbilities(b)) {
    const li = card(c, `guideElemental el-${c.element}`);
    li.querySelector('.guideCardName')?.prepend(`${ELEMENT_MARKS[c.element] ?? ''} `);
    elem.append(li);
  }
  s.append(elem);
  return s;
}

function weatherSection(): HTMLElement {
  const s = section('guideWeatherHeading', 'Weather', 'Fill the weather charge by walking or casting, then call the weather of your element. It covers the stage for everyone.');
  const list = el('ul', 'guideCards guideWeatherCards');
  for (const w of weatherCards()) {
    const li = el('li', `guideCard guideWeather el-${w.caster}`);
    li.dataset.id = w.id;
    const prev = el('div', `guidePreview preview-${w.id}`);
    prev.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 6; i++) prev.append(el('i'));
    li.append(prev);
    const head = el('div', 'guideCardHead');
    head.append(iconSvg(w.id));
    head.append(el('h3', 'guideCardName', w.name));
    head.append(el('span', 'guideKey', `${ELEMENT_MARKS[w.caster] ?? ''} ${cap(w.caster)}`));
    li.append(head);
    li.append(el('p', 'guideFavour', `Favours: ${cap(w.favourText)}.`));
    li.append(el('p', 'guideCounter', `Against: ${cap(w.counterText)}.`));
    if (w.extra !== '') li.append(el('p', 'guideEffect', w.extra));
    li.append(el('p', 'guideCooldown', `Lasts ${w.duration}. A new weather replaces the old one.`));
    list.append(li);
  }
  s.append(list);
  return s;
}

/** The guide page body. Mounted by the lazy shell in `guide-lazy.ts`. */
export function guideContent(): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      node = el('div', 'menuPage guidePage');
      node.append(el('h1', 'heading', 'Guide'));
      node.append(wheelSection(), abilitySection(), weatherSection());
      const back = el('a', 'menuLink guideBack', 'Back');
      back.setAttribute('href', '#help');
      node.append(back);
      container.append(node);
      focusHeading(node);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}
