/** Small stroke icons for the guide cards (24 x 24 viewBox, one path each; decorative, the card text carries the meaning). */
const PATHS: Readonly<Record<string, string>> = {
  dash: 'M3 7h9M2 12h13M5 17h9M15 5l7 7-7 7',
  guard: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  charge: 'M4 12h10M10 6l7 6-7 6M19 5v14',
  super: 'M13 2L5 14h6l-1 8 9-13h-6z',
  trap: 'M3 18h18M5 18l3-8 4 8 4-8 3 8M12 3v4',
  weather: 'M7 18a4 4 0 010-8 5 5 0 019-1 4 4 0 011 9z',
  tag: 'M4 8h13l-3-3M20 16H7l3 3',
  snag: 'M4 20c3-8 6 0 8-8s5-4 8-8M17 4h3v3',
  'elemental-fire': 'M12 3c1 4 5 6 5 11a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z',
  'elemental-water': 'M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z',
  'elemental-earth': 'M3 19l5-10 4 6 3-4 6 8z',
  'elemental-air': 'M3 9h11a3 3 0 10-3-3M3 14h15a3 3 0 11-3 3M3 19h7',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  rain: 'M7 14a4 4 0 010-8 5 5 0 019-1 4 4 0 011 9zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  sandstorm: 'M3 8h12a3 3 0 10-3-3M3 13h16M3 18h10M17 17h4',
  gale: 'M3 9h11a3 3 0 10-3-3M3 14h15a3 3 0 11-3 3M3 19h7',
  eclipse: 'M12 3a9 9 0 100 18 9 9 0 000-18zM15 5a7 7 0 010 14',
};

const NS = 'http://www.w3.org/2000/svg';

/** An aria-hidden SVG icon for `name` (an empty frame for an unknown name, so a missing icon never breaks a card). */
export function iconSvg(name: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'guideIcon');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', PATHS[name] ?? '');
  svg.append(p);
  return svg;
}

export const ICON_NAMES: readonly string[] = Object.keys(PATHS);
