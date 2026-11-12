import { describe, expect, it } from 'vitest';
import type { PlaybackStatus } from '../scenes/launch';
import { describeAnnouncement, describeStatus } from './replay-viewer';

const at = (tick: number, over: Partial<PlaybackStatus> = {}): PlaybackStatus => ({
  tick,
  total: 500,
  state: 'playing',
  paused: false,
  speed: 1,
  ...over,
});

describe('replay viewer announcements', () => {
  it('does not change while only the tick advances', () => {
    expect(describeAnnouncement(at(1))).toBe(describeAnnouncement(at(2)));
    expect(describeStatus(at(1))).not.toBe(describeStatus(at(2)));
  });

  it('changes for pause, speed and the final verdict', () => {
    const texts = new Set([
      describeAnnouncement(at(1)),
      describeAnnouncement(at(1, { paused: true })),
      describeAnnouncement(at(1, { speed: 2 })),
      describeAnnouncement(at(1, { state: 'ok' })),
      describeAnnouncement(at(1, { state: 'diverged', divergentTick: 50 })),
    ]);
    expect(texts.size).toBe(5);
  });

  it('names slow motion in the announcement', () => {
    expect(describeAnnouncement(at(1, { speed: 0.5 }))).toBe('Playing 0.5x');
  });
});
