import { describe, expect, it } from 'vitest';
import {
  DIR_OF_DIR8, FRAME_TIMING, createFrameResolver, frameIndex, generatedSheets, sheetFrameName, walkTime, type ResolvedFrame,
} from './sheet-frames';
import { ACTIONS, DIRS, FRAME, framesIn, layoutAtlas, rowKey, type Action, type Dir, type SheetsManifest } from './sheet-spec';

/** A manifest with one atlas for `sprite` holding `rows` (packed as the packer would). */
function manifestWith(sprite: string, rows: readonly [Action, Dir][]): SheetsManifest {
  const specRows = rows.map(([a, d]) => ({ key: rowKey(a, d), frames: framesIn(a) }));
  const layout = layoutAtlas(specRows);
  return {
    spec: { frame: FRAME, maxSize: 2048, dirs: [...DIRS], actions: ACTIONS.map(([action, frames]) => ({ action, frames })) },
    sheets: [
      {
        sprite, url: `img/sheets/${sprite}.png`, width: layout.width, height: layout.height,
        rows: specRows.map((r, k) => {
          const at = layout.placements[k] ?? { x: 0, y: 0 };
          return { key: r.key, frames: Array.from({ length: r.frames }, (_, i) => [at.x + i * FRAME, at.y] as const) };
        }),
      },
      { sprite: 'circusOfSlime', rows: [] },
    ],
  };
}

const sheetOf = (r: ResolvedFrame): Exclude<ResolvedFrame, { source: 'legacy' }> => {
  if (r.source === 'legacy') throw new Error('expected a sheet frame');
  return r;
};

describe('resolveFrame: fallback order', () => {
  const res = createFrameResolver(manifestWith('curomo', [['idle', 'E'], ['idle', 'W'], ['walk', 'E'], ['cast', 'NE']]));

  it('uses the own row first, even for a west direction that could be mirrored', () => {
    const w = sheetOf(res.resolveFrame('curomo', 'idle', 4, 0));
    expect(w).toMatchObject({ source: 'own', texture: 'sheet:curomo', frame: 'idle/W#0', flipX: false });
  });

  it('mirrors the east-side row for W, NW, SW when they have no art', () => {
    expect(sheetOf(res.resolveFrame('curomo', 'walk', 4, 0))).toMatchObject({ source: 'mirror', frame: 'walk/E#0', flipX: true });
    expect(sheetOf(res.resolveFrame('curomo', 'cast', 3, 0))).toMatchObject({ source: 'mirror', frame: 'cast/NE#0', flipX: true });
    // E itself is never mirrored, and the east side never borrows from the west.
    expect(sheetOf(res.resolveFrame('curomo', 'walk', 0, 0))).toMatchObject({ source: 'own', flipX: false });
  });

  it('falls back to legacy for missing rows: no own row and no east row to mirror', () => {
    expect(res.resolveFrame('curomo', 'hurt', 0, 0)).toEqual({ source: 'legacy', legacy: { set: 'right', frames: 'first' } });
    expect(res.resolveFrame('curomo', 'walk', 5, 0)).toEqual({ source: 'legacy', legacy: { set: 'left', frames: 'strip' } });
    // N and S are never mirrored.
    expect(res.resolveFrame('curomo', 'idle', 2, 0).source).toBe('legacy');
    expect(res.resolveFrame('curomo', 'idle', 6, 0).source).toBe('legacy');
  });

  it('a sprite with an empty sheet entry, or none at all, is legacy everywhere and has nothing to load', () => {
    for (const s of ['circusOfSlime', 'pax']) {
      expect(res.hasSheet(s)).toBe(false);
      expect(res.sheetUrl(s)).toBeUndefined();
      expect(res.frames(s)).toEqual([]);
      for (let d = 0; d < 8; d++) expect(res.resolveFrame(s, 'idle', d, 0).source).toBe('legacy');
    }
    expect(res.hasSheet('curomo')).toBe(true);
    expect(res.sheetUrl('curomo')).toBe('img/sheets/curomo.png');
  });

  it('the shipped manifest has only the Fiara, Pax and Treenoc atlases: every other character resolves to legacy, they have art for idle, walk and cast only', () => {
    const shipped = createFrameResolver(generatedSheets);
    for (const s of generatedSheets.sheets) {
      if (s.sprite === 'fiara' || s.sprite === 'pax' || s.sprite === 'treenoc') continue;
      expect(shipped.hasSheet(s.sprite)).toBe(false);
      for (const [a] of ACTIONS) for (let d = 0; d < 8; d++) expect(shipped.resolveFrame(s.sprite, a, d, 0).source).toBe('legacy');
    }
    expect(shipped.hasSheet('fiara')).toBe(true);
    expect(shipped.hasSheet('pax')).toBe(true);
    expect(shipped.hasSheet('treenoc')).toBe(true);
    for (const sp of ['fiara', 'pax', 'treenoc']) for (const d of [0, 1, 7]) expect(shipped.resolveFrame(sp, 'idle', d, 0).source).not.toBe('legacy');
    expect(shipped.resolveFrame('fiara', 'ko', 0, 0).source).toBe('legacy');
});
});

describe('resolveFrame: frames and rectangles', () => {
  const m = manifestWith('curomo', [['idle', 'E'], ['walk', 'E'], ['ko', 'E']]);
  const res = createFrameResolver(m);

  it('frame rectangles are the packed positions, 80x80, and every frame is registered once', () => {
    const walk = m.sheets[0]?.rows[1];
    for (let i = 0; i < 4; i++) {
      const f = sheetOf(res.resolveFrame('curomo', 'walk', 0, i * FRAME_TIMING.walk.ms));
      expect(f.frame).toBe(sheetFrameName('walk/E', i));
      expect(f.rect).toEqual({ x: walk?.frames[i]?.[0], y: walk?.frames[i]?.[1], w: FRAME, h: FRAME });
    }
    const names = res.frames('curomo').map((f) => f.name);
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
  });

  it('allocates nothing per call: the same (sprite, action, dir, frame) returns the same object', () => {
    expect(res.resolveFrame('curomo', 'idle', 0, 10)).toBe(res.resolveFrame('curomo', 'idle', 0, 20));
    expect(res.resolveFrame('curomo', 'idle', 4, 10)).toBe(res.resolveFrame('curomo', 'idle', 12, 10));
    expect(res.resolveFrame('curomo', 'hurt', 0, 0)).toBe(res.resolveFrame('curomo', 'hurt', 0, 999));
  });
});

describe('frame timing', () => {
  it('looping rows wrap, one-shot rows hold their last frame', () => {
    const idle = FRAME_TIMING.idle.ms;
    expect([0, 1, 2, 3, 4, 5].map((k) => frameIndex('idle', k * idle + 1))).toEqual([0, 1, 2, 3, 0, 1]);
    const ko = FRAME_TIMING.ko.ms;
    expect([0, 1, 2, 3, 4, 10].map((k) => frameIndex('ko', k * ko + 1))).toEqual([0, 1, 2, 3, 3, 3]);
    expect(frameIndex('cast', -50)).toBe(0);
  });

  it('one-shot rows play out within the procedural pose they replace (cast 220, hurt 300, dash 200, tag-in 320, KO 700 ms)', () => {
    const lasts: [Action, number][] = [['cast', 220], ['hurt', 300], ['dash', 200], ['tagIn', 320], ['ko', 700]];
    for (const [a, ms] of lasts) {
      expect(frameIndex(a, ms - 1)).toBe(framesIn(a) - 1);
      expect(framesIn(a) * FRAME_TIMING[a].ms).toBeLessThanOrEqual(ms + 1);
      expect(FRAME_TIMING[a].loop).toBe(false);
    }
  });

  it('the walk row steps once per 30 px stride, like the legacy strip', () => {
    for (let px = 0; px < 300; px += 7) expect(frameIndex('walk', walkTime(px, 30))).toBe(Math.floor(px / 30) % 4);
  });

  it('core dir8 (counter-clockwise from east) maps onto the compass', () => {
    expect(DIR_OF_DIR8).toEqual(['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']);
    expect(new Set(DIR_OF_DIR8)).toEqual(new Set(DIRS));
  });
});
