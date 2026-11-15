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
    lines: [],
    facts: [
      { key: 'location', label: 'Location', value: 'Earth' },
      { key: 'opponent', label: 'Opponent', value: 'Lavax, Pax' },
      { key: 'difficulty', label: 'Difficulty', value: 'Normal' },
      { key: 'continues', label: 'Continues', value: '2 of 3' },
    ],
    actions: [{ id: 'tourFight', label: 'Fight', onClick: () => undefined }],
  });

describe('enhanceStage', () => {
  const c = card();
  enhanceStage(c, { location: 'earth', aiLevel: 'normal', opponents: ['lavax', 'pax'] as CharacterId[] }, 2, 3, (id) => id, ['fiara', 'pax'] as CharacterId[]);

  it('keeps every word of the plain card and loads the stylesheet once', () => {
    expect(c.classList.contains('tsGrim')).toBe(true);
    for (const w of ['Location: Earth', 'Opponent: Lavax, Pax', 'Difficulty: Normal', 'Continues: 2 of 3', 'Fight', 'Stage 2  Earth']) expect(c.textContent).toContain(w);
    expect(c.querySelector('#tourPins li[data-state="current"]')?.getAttribute('aria-label')).toBe('Stage 2: Earth, Next');
    enhanceStage(card(), { location: 'fire', aiLevel: 'easy', opponents: [] }, 3, 3, (id) => id);
    expect(document.querySelectorAll('#tourSelectCss')).toHaveLength(1);
  });
  it('puts the panel before the map, with the four fact rows inside it', () => {
    const panel = c.querySelector('.tsPanel');
    expect(panel?.nextElementSibling?.id).toBe('tourMap');
    expect(panel?.querySelectorAll('p.tourFact')).toHaveLength(4);
    expect(c.textContent).not.toMatch(/Press Fight/);
    expect(panel?.querySelector('[data-fact="difficulty"] .tsLevel')).not.toBeNull();
    expect(panel?.querySelector('[data-fact="continues"] .tsLives')).not.toBeNull();
    expect(panel?.getAttribute('data-element')).toBe('earth');
  });
  it('hides the portraits and icons from assistive tech and shows 3 + 3 pips', () => {
    expect(c.querySelector('.tsRoster')?.getAttribute('aria-hidden')).toBe('true');
    expect(c.querySelectorAll('.tsRoster .tsFace')).toHaveLength(2);
    for (const f of Array.from(c.querySelectorAll<HTMLElement>('.tsRoster .tsFace'))) expect(f.style.backgroundImage).not.toContain('Large');
    expect(c.querySelectorAll('.tsLevel i.on')).toHaveLength(2);
    expect(c.querySelectorAll('.tsLives i')).toHaveLength(3);
    expect(c.querySelectorAll('.tsLives i.on')).toHaveLength(2);
    expect(c.querySelectorAll('.tsPips[aria-hidden="true"]')).toHaveLength(2);
  });
  it('keeps one focusable aria-current stage tile', () => {
    expect(c.querySelectorAll('#tourPins li[tabindex="0"][aria-current="step"]')).toHaveLength(1);
  });
});

describe('enhanceStage for the Void boss (qa-r28)', () => {
  it('shows the painted portrait on the void plate, not the flat pixel strip', () => {
    const c = card();
    enhanceStage(c, { location: 'void', aiLevel: 'hard', opponents: ['eternal-void'] as CharacterId[] }, 0, 3, (id) => id);
    const face = c.querySelector<HTMLElement>('.tsRoster .tsFace');
    expect(face?.classList.contains('tsVoid')).toBe(true);
    expect(face?.style.backgroundImage).toContain('eternalVoidLarge.png');
  });
});
