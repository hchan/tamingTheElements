import { describe, expect, it } from 'vitest';
import { CHARACTERS, migrate, seedSfc32 } from '@core/index';
import { buildPreset, parseEditorText, PRESETS } from './game-master';

describe('game master presets', () => {
  it('builds valid v1 saves for every preset', () => {
    for (const p of PRESETS) {
      const save = buildPreset(p, seedSfc32(7, 'meta'), 1000);
      expect(migrate(JSON.parse(JSON.stringify(save))).ok).toBe(true);
    }
  });

  it('chapter presets use 5 characters at cap-1 XP', () => {
    const s = buildPreset(2, seedSfc32(1, 'meta'), 5);
    expect(s.chapter).toBe(2);
    expect(s.garrison).toHaveLength(5);
    expect(s.garrison.every((g) => g.experience === 19)).toBe(true);
    expect(buildPreset(3, seedSfc32(1, 'meta'), 5).garrison[0]?.experience).toBe(49);
    expect(buildPreset(4, seedSfc32(1, 'meta'), 5).garrison[0]?.experience).toBe(99);
  });

  it('complete preset has every character at chapter 4 cap', () => {
    const s = buildPreset('complete', seedSfc32(1, 'meta'), 5);
    expect(s.chapter).toBe(4);
    expect(s.garrison).toHaveLength(CHARACTERS.length);
    expect(s.garrison.every((g) => g.experience === 100)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(buildPreset(3, seedSfc32(9, 'meta'), 1)).toEqual(buildPreset(3, seedSfc32(9, 'meta'), 1));
  });

  it('validates editor text', () => {
    expect(parseEditorText('  ')).toEqual({ ok: true, save: null });
    expect(parseEditorText('{').ok).toBe(false);
    expect(parseEditorText('[]').ok).toBe(false);
    const good = JSON.stringify(buildPreset(2, seedSfc32(1, 'meta'), 1));
    expect(parseEditorText(good).ok).toBe(true);
  });
});
