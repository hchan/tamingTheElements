import { describe, expect, it } from 'vitest';
import { netStatusText, phaseText } from './online-versus';

describe('phaseText', () => {
  it('says each outcome in words', () => {
    expect(phaseText('go', undefined)).toMatch(/^Connected\./);
    expect(phaseText('waiting-hello', undefined)).toMatch(/Checking/);
    expect(phaseText('rejected', 'simVersion')).toMatch(/different version/);
    expect(phaseText('rejected', 'flags')).toContain('flags');
    expect(phaseText('rejected', undefined)).toContain('unknown');
  });
});

describe('netStatusText', () => {
  it('speaks only for the states that need the player to know', () => {
    expect(netStatusText('running', undefined)).toBeUndefined();
    expect(netStatusText('waiting', undefined)).toBeUndefined();
    expect(netStatusText('desync', undefined)).toMatch(/disagree/);
    expect(netStatusText('forfeit', 'timeout')).toMatch(/you win/);
    expect(netStatusText('forfeit', 'remote-conceded')).toMatch(/left/);
    expect(netStatusText('remote-paused', undefined)).toMatch(/switched tabs/);
  });
});
