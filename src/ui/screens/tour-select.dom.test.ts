// @vitest-environment happy-dom
import type { CharacterId } from '@core/index';
import { describe, expect, it } from 'vitest';
import { enhanceStage } from './tour-select';
import { tourCardView } from './tour';
import { mapLayout, tourMapView } from './tour-map';

// happy-dom cannot load stylesheets; treat the disabled load as a success so it stays quiet.
(window as unknown as { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } } }).happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

const LOC = ['fire', 'earth', 'water', 'air', 'fire', 'earth', 'water', 'air', 'void'];

const card = (): HTMLElement =>
  tourCardView({
    id: 'tourStage',
    heading: 'Stage 2 of 9',
    extra: tourMapView(mapLayout(LOC, 1, false), false),
    lines: ['Location: Earth.', 'Opponent: Lavax, Pax.', 'Difficulty: Normal. 2 of 3 continues left.'],
    actions: [{ id: 'tourFight', label: 'Fight', onClick: () => undefined }],
  });

describe('enhanceStage', () => {
  const c = card();
  enhanceStage(c, { location: 'earth', aiLevel: 'normal', opponents: ['lavax', 'pax'] as CharacterId[] }, 2, 3, (id) => id);

  it('keeps every word of the plain card and loads the stylesheet once', () => {
    expect(c.classList.contains('tsGrim')).toBe(true);
    for (const w of ['Location: Earth.', 'Opponent: Lavax, Pax.', 'Difficulty: Normal.', 'Fight', 'Stage 2: Earth, Next']) expect(c.textContent).toContain(w);
    enhanceStage(card(), { location: 'fire', aiLevel: 'easy', opponents: [] }, 3, 3, (id) => id);
    expect(document.querySelectorAll('#tourSelectCss')).toHaveLength(1);
  });
  it('puts the panel before the map, with the three lines inside it', () => {
    const panel = c.querySelector('.tsPanel');
    expect(panel?.nextElementSibling?.id).toBe('tourMap');
    expect(panel?.querySelectorAll('p')).toHaveLength(3);
    expect(panel?.getAttribute('data-element')).toBe('earth');
  });
  it('hides the portraits and icons from assistive tech and shows 3 + 3 pips', () => {
    expect(c.querySelector('.tsRoster')?.getAttribute('aria-hidden')).toBe('true');
    expect(c.querySelectorAll('.tsRoster img')).toHaveLength(2);
    expect(c.querySelectorAll('.tsLevel i.on')).toHaveLength(2);
    expect(c.querySelectorAll('.tsLives i')).toHaveLength(3);
    expect(c.querySelectorAll('.tsLives i.on')).toHaveLength(2);
    expect(c.querySelectorAll('.tsPips[aria-hidden="true"]')).toHaveLength(2);
  });
  it('keeps one focusable aria-current stage tile', () => {
    expect(c.querySelectorAll('#tourPins li[tabindex="0"][aria-current="step"]')).toHaveLength(1);
  });
});
