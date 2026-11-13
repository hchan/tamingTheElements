// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { elementGlyph, mapLayout, mapSummary, tourMapView } from './tour-map';

const LOC = ['fire', 'earth', 'water', 'air', 'fire', 'earth', 'water', 'air', 'void'];

describe('tourMapView', () => {
  const pins = mapLayout(LOC, 3, false);
  const view = tourMapView(pins, false);

  it('draws one pin group per stage and a text list of the same length', () => {
    expect(view.id).toBe('tourMap');
    expect(view.querySelectorAll('svg g[data-pin]')).toHaveLength(9);
    expect(view.querySelectorAll('#tourPins li')).toHaveLength(9);
  });
  it('gives the picture an accessible name equal to the summary', () => {
    const svg = view.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe(mapSummary(pins));
  });
  it('makes only the current pin focusable and aria-current', () => {
    const items = [...view.querySelectorAll<HTMLElement>('#tourPins li')];
    const focusable = items.filter((li) => li.tabIndex === 0);
    expect(focusable).toHaveLength(1);
    expect(focusable[0]?.dataset['state']).toBe('current');
    expect(focusable[0]?.getAttribute('aria-current')).toBe('step');
    expect(view.querySelectorAll('[aria-current]')).toHaveLength(1);
  });
  it('states cleared and locked in words, not only by dimming', () => {
    const labels = [...view.querySelectorAll('svg g[data-pin] text')].map((t) => t.textContent);
    expect(labels.filter((t) => t.includes('(Cleared)'))).toHaveLength(3);
    expect(labels.filter((t) => t.includes('(Locked)'))).toHaveLength(5);
  });
  it('animates the current ring only when motion is allowed', () => {
    expect(view.querySelectorAll('animate')).toHaveLength(1);
    expect(tourMapView(pins, true).querySelectorAll('animate')).toHaveLength(0);
  });
});

describe('elementGlyph', () => {
  it('is decorative and sized as asked', () => {
    const g = elementGlyph('fire', 32);
    expect(g.getAttribute('aria-hidden')).toBe('true');
    expect(g.getAttribute('width')).toBe('32');
    expect(g.querySelector('polygon')).not.toBeNull();
  });
  it('falls back to a circle for water and unknown elements', () => {
    expect(elementGlyph('water').querySelector('circle')).not.toBeNull();
    expect(elementGlyph('nonsense').querySelector('circle')).not.toBeNull();
  });
});
