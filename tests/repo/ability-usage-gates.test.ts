import { describe, expect, it } from 'vitest';
import { judgeAbilityGates, loadAbilityGateConfig } from '../../tools/ci/ability-usage-gates';
import { type SlotUsage, judge } from '../../tools/sim/ability-usage';
import { RACES } from '../../tools/sim/run-match';

const slot = (over: Partial<SlotUsage>): SlotUsage => ({ race: 'x', slot: 0, ability: 'a', kind: 'range', matches: 1, ticks: 3000, casts: 10, activeTicks: 0, hits: 0, damage: 0, ...over });
const config = { deadBelowCastsPerMinute: 0.3, maxTopShare: { x: 0.8 } };

describe('nightly ability-usage gate (tools/ci/ability-usage-gates.ts)', () => {
  it('passes a balanced kit', () => {
    expect(judgeAbilityGates(judge([slot({ casts: 10 }), slot({ slot: 1, casts: 8 })]), config)).toEqual([]);
  });

  it('fails a dead slot and a top slot above the band', () => {
    const dead = judgeAbilityGates(judge([slot({ casts: 10 }), slot({ slot: 1, ability: 'b', casts: 0 })]), config);
    expect(dead.some((f) => f.includes('x/b is dead'))).toBe(true);
    const over = judgeAbilityGates(judge([slot({ casts: 50 }), slot({ slot: 1, casts: 5 })]), config);
    expect(over.some((f) => f.includes('cast share'))).toBe(true);
  });

  it('fails a race with no band', () => {
    expect(judgeAbilityGates(judge([slot({})]), { ...config, maxTopShare: {} }).some((f) => f.includes('no maxTopShare'))).toBe(true);
  });

  it('the committed bands cover every race with sane values', () => {
    const c = loadAbilityGateConfig();
    expect(Object.keys(c.maxTopShare).sort()).toEqual([...RACES].sort());
    for (const v of Object.values(c.maxTopShare)) expect(v).toBeGreaterThan(0.5);
    expect(c.deadBelowCastsPerMinute).toBeGreaterThan(0);
  });
});
