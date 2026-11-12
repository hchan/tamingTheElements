import { describe, expect, it } from 'vitest';
import { CAMERA_MARGIN, CAMERA_ZOOM_MIN, cameraTarget, clampCenter, idealFraming, type CameraFraming, type CameraInput } from './arena-camera';

const base: CameraInput = { x1: 800, x2: 1000, worldWidth: 1920, viewWidth: 1280 };

describe('arena camera', () => {
  it('centres on the midpoint at zoom 1 when fighters are close', () => {
    expect(idealFraming(base)).toEqual({ centerX: 900, zoom: 1 });
  });

  it('clamps so the walls are never passed', () => {
    expect(idealFraming({ ...base, x1: 0, x2: 100 }).centerX).toBe(640);
    expect(idealFraming({ ...base, x1: 1820, x2: 1920 }).centerX).toBe(1280);
    expect(clampCenter(5000, 0.8, 1920, 1280)).toBe(1920 - 800);
  });

  it('centres on the world when it is no wider than the view', () => {
    expect(idealFraming({ ...base, worldWidth: 1280, x1: 100, x2: 300 })).toEqual({ centerX: 640, zoom: 1 });
  });

  it('zooms out when separation plus margins exceeds the view, down to the floor', () => {
    const z = idealFraming({ ...base, x1: 400, x2: 1500 }).zoom;
    expect(z).toBeCloseTo(1280 / (1100 + 2 * CAMERA_MARGIN), 10);
    expect(z).toBeLessThan(1);
    expect(idealFraming({ ...base, x1: 160, x2: 1760 }).zoom).toBe(CAMERA_ZOOM_MIN);
    expect(idealFraming({ ...base, worldWidth: 4000, x1: 0, x2: 4000 }).zoom).toBe(CAMERA_ZOOM_MIN);
  });

  it('keeps both fighters inside the margin at max separation', () => {
    const x1 = 320;
    const x2 = 1600; // separation 1280 = what ZOOM_MIN shows with both margins
    const f = idealFraming({ ...base, x1, x2 });
    const half = 1280 / f.zoom / 2;
    expect(f.zoom).toBeCloseTo(CAMERA_ZOOM_MIN, 10);
    expect(f.centerX - half + CAMERA_MARGIN).toBeLessThanOrEqual(x1 + 1e-9);
    expect(f.centerX + half - CAMERA_MARGIN).toBeGreaterThanOrEqual(x2 - 1e-9);
  });

  it('eases toward the target without overshoot', () => {
    const prev: CameraFraming = { centerX: 640, zoom: 1 };
    const input = { ...base, x1: 1400, x2: 1600 };
    const next = cameraTarget(input, prev, 1 / 60);
    expect(next.centerX).toBeGreaterThan(640);
    expect(next.centerX).toBeLessThan(1280);
    let p = prev;
    for (let k = 0; k < 300; k++) p = cameraTarget(input, p, 1 / 60);
    expect(p.centerX).toBeCloseTo(1280, 3);
  });

  it('snaps on reset or when there is no previous framing', () => {
    const input = { ...base, x1: 1400, x2: 1600 };
    const ideal = idealFraming(input);
    expect(cameraTarget(input, { centerX: 640, zoom: 1 }, 1 / 60, true)).toEqual(ideal);
    expect(cameraTarget(input, undefined, 1 / 60)).toEqual(ideal);
  });

  it('reduced motion: no smoothing and zoom fixed at 1', () => {
    const input = { ...base, x1: 160, x2: 1760, reducedMotion: true };
    const f = cameraTarget(input, { centerX: 640, zoom: 0.9 }, 1 / 60);
    expect(f.zoom).toBe(1);
    expect(f.centerX).toBe(clampCenter(960, 1, 1920, 1280));
  });

  it('is frame-rate independent for the same elapsed time', () => {
    const input = { ...base, x1: 500, x2: 1500 };
    const run = (fps: number): CameraFraming => {
      let p: CameraFraming = { centerX: 700, zoom: 1 };
      for (let k = 0; k < fps / 2; k++) p = cameraTarget(input, p, 1 / fps);
      return p;
    };
    // Walls are not binding here, so centre and zoom each follow the same exponential exactly.
    for (const fps of [30, 144]) {
      expect(run(fps).centerX).toBeCloseTo(run(60).centerX, 6);
      expect(run(fps).zoom).toBeCloseTo(run(60).zoom, 6);
    }
  });

  it('is deterministic and ignores a zero or negative dt', () => {
    const prev: CameraFraming = { centerX: 900, zoom: 1 };
    expect(cameraTarget(base, prev, 0.016)).toEqual(cameraTarget(base, prev, 0.016));
    expect(cameraTarget(base, prev, -1)).toEqual(prev);
  });
});
