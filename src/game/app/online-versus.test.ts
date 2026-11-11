import { describe, expect, it } from 'vitest';
import { phaseText } from './online-versus';

describe('phaseText', () => {
  it('says each outcome in words', () => {
    expect(phaseText('go', undefined)).toMatch(/^Connected\./);
    expect(phaseText('waiting-hello', undefined)).toMatch(/Checking/);
    expect(phaseText('rejected', 'simVersion')).toMatch(/different version/);
    expect(phaseText('rejected', 'flags')).toContain('flags');
    expect(phaseText('rejected', undefined)).toContain('unknown');
  });
});
