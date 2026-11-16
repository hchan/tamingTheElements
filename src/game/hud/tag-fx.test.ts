import { describe, expect, it } from 'vitest';
import { TAG_COOLDOWN_TICKS } from '@core/index';
import { BAR_Y, SLOT_SIDE, slotX } from './action-bar';
import { barFill, dashSegments, sideOffset } from './bars';
import { chipBar, slimBar } from './slim-hud';
import {
  CALL_HEAD_GAP, CALL_TICKS, GLINT_TICKS, GLINT_W, CALL_TOP_MIN, FLASH_TICKS, TAG_BAR_H, TAG_BAR_W, activeLabel, barFlashPose, barFlashRect, benchBarOf, benchLabel, callFit, callPose, callText, CALL_KO_MAX_W, dashes, flashPose,
  heroName, mainBarOf, placeCall, redPct, redSpan, tagLayout, tagLine, tagReadout, teamX, type TagHero,
} from './tag-fx';
import { viewOfCamera } from './arcade-hud';
import { TAG_SLOT_X, TAG_SLOT_Y } from './tag-view';

const hero = (o: Partial<TagHero> = {}): TagHero => ({ sprite: 'pax', hp: 400, maxHp: 1000, restCap: 600, dead: false, ...o });

describe('tag view rules: words', () => {
  it('names heroes from their sprite, and falls back to the sprite key', () => {
    expect(heroName('sindarosa')).toBe('Sindarosa');
    expect(heroName('pax')).toBe('Pax');
    expect(heroName('nobody')).toBe('nobody');
    expect(activeLabel('fiara')).toBe('IN Fiara');
  });

  it('labels the bench with HP and red life in words, or K.O.', () => {
    expect(benchLabel(hero())).toBe('BENCH Pax 40% +20% red');
    expect(benchLabel(hero({ restCap: 400 }))).toBe('BENCH Pax 40%');
    expect(benchLabel(hero({ hp: 0, dead: true }))).toBe('BENCH Pax K.O.');
    expect(redPct(hero({ restCap: 399 }))).toBe(0);
    expect(redPct(hero({ dead: true }))).toBe(0);
  });

  it('adds the bench hero\'s element as a glyph when known', () => {
    expect(benchLabel(hero({ element: 'water' }))).toBe('BENCH Pax ● 40% +20% red');
    expect(benchLabel(hero({ element: 'fire', hp: 0, dead: true }))).toBe('BENCH Pax ▲ K.O.');
  });

  it('reads the tag cooldown as a word and a fill: READY, seconds left, or NO TAG when the partner is down', () => {
    expect(tagReadout(0, false)).toEqual({ label: 'TAG READY', fill: 1 });
    expect(tagReadout(-5, false)).toEqual({ label: 'TAG READY', fill: 1 });
    expect(tagReadout(TAG_COOLDOWN_TICKS, false)).toEqual({ label: 'TAG 3.0s', fill: 0 });
    expect(tagReadout(30, false)).toEqual({ label: 'TAG 0.6s', fill: 0.8 });
    expect(tagReadout(0, true)).toEqual({ label: 'NO TAG', fill: 0 });
  });

  it('calls TAG! for a tag and the name for a KO entrance; live lines per side and kind', () => {
    expect(callText('pax', false)).toBe('TAG!');
    expect(callText('pax', true)).toBe('PAX IN!');
    expect(tagLine(0, 'sindarosa', 'pax', false)).toEqual({ key: 'tag0', text: 'Tag! Pax is in, Sindarosa rests.', important: false });
    expect(tagLine(1, 'fiara', 'lavax', false)).toEqual({ key: 'tag1', text: 'The enemy tagged in Lavax.', important: false });
    expect(tagLine(0, 'sindarosa', 'pax', true)).toEqual({ key: 'koIn0', text: 'Sindarosa is down. Pax steps in.', important: false });
    expect(tagLine(1, 'fiara', 'lavax', true).text).toBe('Enemy Fiara is down. Lavax steps in.');
  });
});

describe('tag view rules: geometry and motion', () => {
  it('lays the bars out as slim-hud.ts does, and the red span where barFill puts the health and rest strokes', () => {
    for (const team of [0, 1]) {
      expect(teamX(team)).toBe(sideOffset(team));
      const m = slimBar(team);
      expect(mainBarOf(team)).toEqual({ minX: m.minX, maxX: m.maxX, y: m.y, line: m.line });
      for (const i of [0, 1]) {
        const b = chipBar(team, i);
        expect(benchBarOf(team, i)).toEqual({ minX: b.minX, maxX: b.maxX, y: b.y, line: b.line });
      }
      for (const h of [hero(), hero({ hp: 0 }), hero({ restCap: 1200 }), hero({ maxHp: 0 })]) {
        const f = barFill(chipBar(team, 0), h.hp, h.maxHp, h.restCap);
        expect(redSpan(benchBarOf(team, 0), h)).toEqual([f.curX, f.restX]);
      }
    }
    expect(dashes(10, 40, [6, 4])).toEqual(dashSegments(10, 40, [6, 4]));
    expect(dashes(10, 10, [6, 4])).toEqual([]);
  });

  it('lays the lines out: three rows under the bench bar for two heroes, each BENCH line under its own bar in 3v3', () => {
    const rowH = 20;
    // 2v2: IN, BENCH and the tag word stacked from y 32 (as before 3v3), the tag bar left of the word.
    expect(tagLayout(2, rowH, 1)).toEqual({ rows: [[0, 32], [0, 52], [TAG_BAR_W + 8, 72]], bar: [0, 72 + (rowH - 5 - TAG_BAR_H) / 2] });
    const three = tagLayout(3, rowH, 1);
    expect(three.rows).toHaveLength(4);
    const [inRow, a, b, word] = three.rows as [[number, number], [number, number], [number, number], [number, number]];
    const top = (i: number): number => 26 + i * 40 + 6;
    expect([a, b]).toEqual([[0, top(0)], [0, top(1)]]);
    expect(word).toEqual([TAG_BAR_W + 8, top(1) + rowH]);
    expect(inRow[1]).toBe(word[1]);
    expect(inRow[0]).toBeGreaterThan(word[0] + 80);
    // Every row clear of the second bench bar's stroke, and the last row above the super meter.
    for (const [, y] of three.rows) expect(y >= top(1) || y + rowH - 5 <= 26 + 40 - 3).toBe(true);
  });

  it('keeps the Tag slot position on the third action-bar slot', () => {
    expect(TAG_SLOT_X).toBe(slotX(2) + SLOT_SIDE / 2);
    expect(TAG_SLOT_Y).toBe(BAR_Y);
  });

  it('scales the call in (not with reduced motion) and fades it out at the end', () => {
    expect(callPose(0, false).scale).toBeCloseTo(1.6);
    expect(callPose(8, false).scale).toBe(1);
    expect(callPose(0, true).scale).toBe(1);
    expect(callPose(0, false, true).scale).toBeCloseTo(1.25);
    expect(callPose(-5, false, true).scale).toBeCloseTo(1.25);
    expect(callPose(-5, false).scale).toBeCloseTo(1.6);
    expect(callPose(8, false, true).scale).toBe(1);
    expect(callPose(0, true, true).scale).toBe(1);
    expect(callFit(300, 1.25, true)).toBeCloseTo(1.2);
    expect(callFit(200, 1.25, true)).toBe(1.25);
    expect(callFit(500, 1, true) * 500).toBeCloseTo(CALL_KO_MAX_W);
    expect(callFit(500, 1.6, false)).toBe(1.6);
    expect(callPose(10, false).alpha).toBe(1);
    expect(callPose(CALL_TICKS - 6, false).alpha).toBe(0.5);
    expect(callPose(CALL_TICKS, false).alpha).toBe(0);
  });

  it('grows the ring and slides the speed lines in; reduced motion keeps a static ring and the flash, no slide', () => {
    const a = flashPose(0, 80, false);
    const b = flashPose(FLASH_TICKS / 2, 80, false);
    expect(a.ring).toBe(40);
    expect(b.ring).toBeGreaterThan(a.ring);
    expect(a.slide).toBe(160);
    expect(flashPose(10, 80, false).slide).toBe(0);
    expect(a.core).toBeGreaterThan(0);
    expect(flashPose(6, 80, false).core).toBe(0);
    expect(flashPose(FLASH_TICKS, 80, false).alpha).toBe(0);
    const r = flashPose(0, 80, true);
    expect(r).toMatchObject({ ring: 80, slide: 0, alpha: 1 });
    expect(r.core).toBe(a.core);
    expect(flashPose(FLASH_TICKS / 2, 80, true).ring).toBe(80);
  });
});

describe('the swap flash on the life bar (WP-HF1)', () => {
  it('hugs the bar frame: exact rects for both teams', () => {
    expect(barFlashRect(0)).toEqual({ x: 118, y: 9, w: 464, h: 22 });
    expect(barFlashRect(1)).toEqual({ x: 698, y: 9, w: 464, h: 22 });
  });
  it('stays clear of the portraits and under the name row', () => {
    const a = barFlashRect(0);
    const b = barFlashRect(1);
    expect(a.x).toBeGreaterThanOrEqual(112); // the portrait ends at 110
    expect(b.x + b.w).toBeLessThanOrEqual(1168); // the portrait starts at 1170
    expect(a.y - 0.5).toBeGreaterThanOrEqual(0);
    expect(a.y + a.h + 0.5).toBeLessThanOrEqual(34); // SLIM_ROW_B
  });
  it('is one rect for the whole flash, and its alphas only fall', () => {
    let rim = Infinity;
    let wash = Infinity;
    for (let t = 0; t < FLASH_TICKS; t++) {
      const p = barFlashPose(t, false, false);
      expect(p.on).toBe(true);
      expect(p.width).toBe(t < 6 ? 3 : 2);
      expect(p.rim).toBeLessThanOrEqual(rim);
      expect(p.wash).toBeLessThanOrEqual(wash);
      rim = p.rim;
      wash = p.wash;
    }
  });
  it('is off before it starts and after it ends', () => {
    for (const t of [-1, FLASH_TICKS, 60]) expect(barFlashPose(t, false, false).on).toBe(false);
  });
  it('is white in high contrast and bone otherwise', () => {
    expect(barFlashPose(0, false, true).color).toBe(0xffffff);
    expect(barFlashPose(0, false, false).color).toBe(0xf1e8cf);
  });
  it('never washes the bar in full motion (HF2-2: a wash made a light fill look dimmed)', () => {
    for (let t = -1; t <= FLASH_TICKS; t++) expect(barFlashPose(t, false, false).wash).toBe(0);
  });
  it('sweeps a glint stripe inside the rect for the first 12 ticks only, none with reduced motion', () => {
    const w = barFlashRect(0).w;
    expect(barFlashRect(1).w).toBe(464);
    let prev = -1;
    for (let t = 0; t < GLINT_TICKS; t++) {
      const p = barFlashPose(t, false, false);
      if (t > 0) expect(p.glintW).toBeGreaterThan(0);
      expect(p.glintW).toBeLessThanOrEqual(GLINT_W);
      expect(p.glintX).toBeGreaterThanOrEqual(0);
      expect(p.glintX + p.glintW).toBeLessThanOrEqual(w);
      expect(p.glintX + p.glintW).toBeGreaterThan(prev);
      prev = p.glintX + p.glintW;
    }
    for (let t = GLINT_TICKS; t < FLASH_TICKS; t++) expect(barFlashPose(t, false, false).glintW).toBe(0);
    for (let t = 0; t < FLASH_TICKS; t++) expect(barFlashPose(t, true, false).glintW).toBe(0);
  });
  it('keeps only a tiny 4-tick wash with reduced motion', () => {
    expect(barFlashPose(0, true, false).wash).toBeCloseTo(0.15);
    expect(barFlashPose(4, true, false).wash).toBe(0);
  });
});

describe('the TAG! call placement (WP-HF1)', () => {
  const out = { x: 0, y: 0 };
  it('hangs a fixed gap over the drawn head', () => {
    expect(placeCall(600, 500, 90, 46, [], out)).toEqual({ x: 600, y: 500 - CALL_HEAD_GAP });
  });
  it('never rises under the top bar and chips', () => {
    expect(placeCall(600, 120, 90, 46, [], out).y).toBe(CALL_TOP_MIN);
  });
  it('slides clear of a combo readout toward the centre', () => {
    const combo = { x: 24, y: 110, w: 200, h: 60 };
    expect(placeCall(150, 150, 90, 46, [combo], out).x).toBeGreaterThanOrEqual(combo.x + combo.w + 90);
    const right = { x: 1000, y: 110, w: 256, h: 60 };
    expect(placeCall(1150, 150, 90, 46, [right], out).x).toBeLessThanOrEqual(right.x - 90);
  });
  it('leaves a combo that is not in its way alone', () => {
    expect(placeCall(600, 500, 90, 46, [{ x: 24, y: 110, w: 200, h: 60 }], out).x).toBe(600);
  });
});

describe('viewOfCamera', () => {
  it('builds the world view from scroll and zoom', () => {
    expect(viewOfCamera({ scrollX: 100, scrollY: 50, width: 1280, height: 720, zoom: 2 }, { x: 0, y: 0, w: 0, h: 0 })).toEqual({ x: 420, y: 230, w: 640, h: 360 });
  });
});
