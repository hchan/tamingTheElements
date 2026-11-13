import { describe, expect, it } from 'vitest';
import { TAG_COOLDOWN_TICKS } from '@core/index';
import { BAR_Y, SLOT_SIDE, slotX } from './action-bar';
import { barFill, dashSegments, sideOffset } from './bars';
import { chipBar, slimBar } from './slim-hud';
import {
  CALL_TICKS, FLASH_TICKS, TAG_BAR_H, TAG_BAR_W, activeLabel, benchBarOf, benchLabel, callPose, callText, dashes, flashPose,
  heroName, mainBarOf, redPct, redSpan, tagLayout, tagLine, tagReadout, teamX, type TagHero,
} from './tag-fx';
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

  it('puts the TAG caption over the third action-bar slot', () => {
    expect(TAG_SLOT_X).toBe(slotX(2) + SLOT_SIDE / 2);
    expect(TAG_SLOT_Y).toBe(BAR_Y);
  });

  it('scales the call in (not with reduced motion) and fades it out at the end', () => {
    expect(callPose(0, false).scale).toBeCloseTo(1.6);
    expect(callPose(8, false).scale).toBe(1);
    expect(callPose(0, true).scale).toBe(1);
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
