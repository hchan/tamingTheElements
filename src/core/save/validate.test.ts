import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { checkSave, isKnownCharacterName } from './validate';
import { newEmptyState, type SaveV1 } from './v1';

const member = (characterName: string, experience = 5) => ({ id: 'a', characterName, experience });
const save = (over: Partial<SaveV1> = {}): SaveV1 => ({ ...newEmptyState(), ...over });

describe('checkSave', () => {
  it('accepts an empty and a normal save', () => {
    expect(checkSave(newEmptyState()).ok).toBe(true);
    expect(checkSave(save({ chapter: 3, garrison: [member('Eternal Void'), member('Curomo')] })).ok).toBe(true);
  });

  it('knows legacy names via the slug rule', () => {
    expect(isKnownCharacterName('Eternal Void')).toBe(true);
    expect(isKnownCharacterName('Bogus Mage')).toBe(false);
  });

  it.each([
    ['an unknown character', save({ garrison: [member('Bogus Mage')] })],
    ['a huge display scale', save({ displaySettings: 9999 })],
    ['a zero display scale', save({ displaySettings: 0 })],
    ['a negative experience', save({ garrison: [member('Curomo', -3)] })],
    ['a chapter past the end', save({ chapter: 6 })],
    ['an absurd difficulty', save({ difficulty: 1e9 })],
    ['a gigantic garrison', save({ garrison: Array.from({ length: 1000 }, () => member('Curomo')) })],
  ])('rejects %s', (_n, s) => {
    expect(checkSave(s).ok).toBe(false);
  });
});

describe('migrate with validation', () => {
  it('turns an unknown character in an imported v1 save into a friendly invalid error', () => {
    const r = migrate({ ...newEmptyState(), garrison: [member('Bogus Mage')] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid');
  });

  it('rejects a huge display scale in a v1 save', () => {
    expect(migrate({ ...newEmptyState(), displaySettings: 1e9 }).ok).toBe(false);
  });

  it('never throws on arbitrary JSON, and only ok results are valid saves', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const r = migrate(v);
        if (r.ok) expect(checkSave(r.value).ok).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('never throws on schema-shaped saves with garbage members', () => {
    const junk = fc.oneof(fc.string(), fc.integer(), fc.double(), fc.constant(null));
    fc.assert(
      fc.property(junk, junk, junk, junk, (name, xp, disp, diff) => {
        const raw = {
          ...newEmptyState(),
          displaySettings: disp,
          difficulty: diff,
          garrison: [{ id: 'x', characterName: name, experience: xp }],
        };
        expect(() => migrate(raw)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});
