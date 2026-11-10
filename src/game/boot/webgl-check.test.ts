import { describe, expect, it } from 'vitest';
import { detectWebgl, hasWebgl } from './webgl-check';

const canvasWith = (ok: readonly string[]) => ({
  getContext: (id: string): unknown => (ok.includes(id) ? {} : null),
});

describe('webgl check', () => {
  it('accepts webgl2 or webgl', () => {
    expect(hasWebgl(canvasWith(['webgl2']))).toBe(true);
    expect(hasWebgl(canvasWith(['webgl']))).toBe(true);
  });
  it('rejects when no context is available', () => {
    expect(hasWebgl(canvasWith([]))).toBe(false);
  });
  it('rejects when getContext throws', () => {
    expect(
      hasWebgl({
        getContext: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(false);
  });
  it('releases the probe context with loseContext', () => {
    let lost = 0;
    const gl = { getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext: () => { lost++; } } : null) };
    expect(hasWebgl({ getContext: () => gl })).toBe(true);
    expect(lost).toBe(1);
  });
  it('forceNoWebgl wins and skips the probe', () => {
    let created = false;
    const make = () => {
      created = true;
      return canvasWith(['webgl2']);
    };
    expect(detectWebgl(true, make)).toBe(false);
    expect(created).toBe(false);
    expect(detectWebgl(false, make)).toBe(true);
  });
});
