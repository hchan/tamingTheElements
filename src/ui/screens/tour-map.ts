import { el } from '../dom';

/**
 * The World Tour map (FUN-DESIGN 2.18, WP-tour-map): nine pins along a path, drawn as inline SVG in code (no art files). The layout is
 * pure (`mapLayout`); `tourMapView` builds the DOM. Every pin says its location in words and has its own shape (never colour alone),
 * and a list below the picture gives the same information as text. The pulse on the current pin is skipped under reduced motion.
 */

export type PinState = 'cleared' | 'current' | 'locked';

export interface MapPin {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly element: string;
  readonly state: PinState;
}

export const MAP_W = 360;
export const MAP_H = 200;

/** A fixed winding path, left to right in three rows (integers, so the layout is stable). */
const POINTS: readonly (readonly [number, number])[] = [
  [30, 40], [100, 30], [170, 50], [240, 30], [320, 45],
  [290, 110], [210, 120], [130, 105], [60, 165],
];

const word = (e: string): string => (e[0] ?? '').toUpperCase() + e.slice(1);

/** Pin positions and states for a run: stages before `stage` are cleared (all of them once `won`), `stage` is current. */
export function mapLayout(locations: readonly string[], stage: number, won: boolean): readonly MapPin[] {
  return locations.map((element, index): MapPin => {
    const [x, y] = POINTS[index] ?? [MAP_W / 2, MAP_H / 2];
    const state: PinState = won || index < stage ? 'cleared' : index === stage ? 'current' : 'locked';
    return { index, x, y, element, state };
  });
}

const stateWord = (s: PinState): string => (s === 'cleared' ? 'Cleared' : s === 'current' ? 'Next' : 'Locked');

export const pinText = (p: MapPin): string => `Stage ${String(p.index + 1)}: ${word(p.element)}, ${stateWord(p.state)}`;

export const mapSummary = (pins: readonly MapPin[]): string => {
  const cleared = pins.filter((p) => p.state === 'cleared').length;
  const cur = pins.find((p) => p.state === 'current');
  return `World Tour map: ${String(cleared)} of ${String(pins.length)} stages cleared${cur ? `, next is stage ${String(cur.index + 1)}, ${word(cur.element)}` : ''}.`;
};

const pt = (x: number, y: number): string => `${String(x)},${String(y)}`;

/** Shape per element: fire triangle, earth square, air diamond, void star, water circle (no points). */
const shapePoints = (e: string, x: number, y: number): string | undefined => {
  const r = 11;
  switch (e) {
    case 'fire': return [pt(x, y - r), pt(x + r, y + r), pt(x - r, y + r)].join(' ');
    case 'earth': return [pt(x - r, y - r), pt(x + r, y - r), pt(x + r, y + r), pt(x - r, y + r)].join(' ');
    case 'air': return [pt(x, y - r - 2), pt(x + r + 2, y), pt(x, y + r + 2), pt(x - r - 2, y)].join(' ');
    case 'void': return [pt(x, y - 14), pt(x + 4, y - 4), pt(x + 14, y), pt(x + 4, y + 4), pt(x, y + 14), pt(x - 4, y + 4), pt(x - 14, y), pt(x - 4, y - 4)].join(' ');
    default: return undefined;
  }
};

const FILL: Readonly<Record<string, string>> = { fire: '#a0402c', earth: '#5c7a4a', water: '#3e5f8c', air: '#9db4c0', void: '#74509a' };
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Readonly<Record<string, string>>): SVGElement => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function pinGroup(p: MapPin, animate: boolean): SVGElement {
  const g = svg('g', { 'data-pin': String(p.index + 1), 'data-state': p.state, opacity: p.state === 'locked' ? '0.4' : '1' });
  const stroke = p.state === 'current' ? '#ffbf00' : '#fff';
  const sw = p.state === 'current' ? '3' : '1.5';
  const shape = shapePoints(p.element, p.x, p.y);
  g.append(
    shape
      ? svg('polygon', { points: shape, fill: FILL[p.element] ?? '#888', stroke, 'stroke-width': sw })
      : svg('circle', { cx: String(p.x), cy: String(p.y), r: '11', fill: FILL[p.element] ?? '#888', stroke, 'stroke-width': sw }),
  );
  if (p.state === 'current') {
    const ring = svg('circle', { cx: String(p.x), cy: String(p.y), r: '17', fill: 'none', stroke: '#ffbf00', 'stroke-width': '2' });
    if (animate) ring.append(svg('animate', { attributeName: 'r', values: '15;19;15', dur: '1.6s', repeatCount: 'indefinite' }));
    g.append(ring);
  }
  const t = svg('text', { x: String(p.x), y: String(p.y + 29), 'text-anchor': 'middle', fill: '#fff', 'font-size': '11' });
  t.textContent = `${String(p.index + 1)} ${word(p.element)}${p.state === 'cleared' ? ' (Cleared)' : p.state === 'locked' ? ' (Locked)' : ''}`;
  g.append(t);
  return g;
}

/** A small standalone SVG of an element's pin shape (decorative: the caller gives the words). */
export function elementGlyph(element: string, size = 48): SVGElement {
  const root = svg('svg', { viewBox: '0 0 40 40', width: String(size), height: String(size), 'aria-hidden': 'true', focusable: 'false' });
  const shape = shapePoints(element, 20, 20);
  const attrs = { fill: FILL[element] ?? '#888', stroke: '#fff', 'stroke-width': '1.5' };
  root.append(shape ? svg('polygon', { points: shape, ...attrs }) : svg('circle', { cx: '20', cy: '20', r: '11', ...attrs }));
  return root;
}

/** The map picture plus the text list of pins; the current pin's list item is focusable and marked `aria-current`. */
export function tourMapView(pins: readonly MapPin[], reducedMotion: boolean): HTMLElement {
  const wrap = el('div');
  wrap.id = 'tourMap';
  const root = svg('svg', {
    viewBox: `0 0 ${String(MAP_W)} ${String(MAP_H)}`,
    role: 'img',
    'aria-label': mapSummary(pins),
    width: '100%',
    style: 'max-width:640px;height:auto;display:block;margin:0 auto',
  });
  root.append(svg('polyline', {
    points: pins.map((p) => pt(p.x, p.y)).join(' '),
    fill: 'none', stroke: '#887', 'stroke-width': '3', 'stroke-dasharray': '6 4',
  }));
  for (const p of pins) root.append(pinGroup(p, !reducedMotion));
  const list = el('ol');
  list.id = 'tourPins';
  for (const p of pins) {
    const li = el('li', undefined, pinText(p));
    li.dataset.pin = String(p.index + 1);
    li.dataset.state = p.state;
    li.dataset.element = p.element;
    if (p.state === 'current') {
      li.tabIndex = 0;
      li.setAttribute('aria-current', 'step');
    }
    list.append(li);
  }
  wrap.append(root, list);
  return wrap;
}
