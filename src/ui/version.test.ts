import { describe, expect, it } from 'vitest';
import { versionStamp } from './version';

describe('versionStamp', () => {
  it('formats version and commit', () => {
    expect(versionStamp({ VITE_APP_VERSION: '0.1.0', VITE_APP_COMMIT: 'abc1234' })).toBe('v0.1.0 (abc1234)');
  });

  it('falls back when not injected', () => {
    expect(versionStamp({})).toBe('vdev (unknown)');
  });
});
