import { describe, expect, it } from 'vitest';
import { FROST_MARK_MS, FROST_SHARD_MS, frostMarkAlpha, frostShardAlpha, frostShardReach } from './frost-view';

describe('frost-view curves', () => {
  it('shards snap outward then fade out by FROST_SHARD_MS', () => {
    expect(frostShardReach(0)).toBe(0);
    expect(frostShardReach(FROST_SHARD_MS)).toBe(1);
    expect(frostShardReach(FROST_SHARD_MS / 2)).toBeGreaterThan(0.5);
    expect(frostShardAlpha(10)).toBe(1);
    expect(frostShardAlpha(FROST_SHARD_MS)).toBe(0);
  });
  it('the marker outlives the shards and ends at FROST_MARK_MS', () => {
    expect(FROST_MARK_MS).toBeGreaterThan(FROST_SHARD_MS * 2);
    expect(frostMarkAlpha(FROST_MARK_MS * 0.4)).toBe(1);
    expect(frostMarkAlpha(FROST_MARK_MS)).toBe(0);
  });
});
