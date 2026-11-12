// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../../game/platform/storage/save-store';
import { TesterSession } from '../../game/platform/tester/session';
import { badgeText, mountTesterBadge } from './badge';

afterEach(() => {
  document.body.replaceChildren();
});

const session = (): TesterSession => new TesterSession(undefined, createMemoryStorage());
const badge = (): HTMLButtonElement | null => document.getElementById('testerBadge') as HTMLButtonElement | null;

describe('badgeText', () => {
  it('says whether progress is kept and adds the god-mode warning', () => {
    expect(badgeText(false)).toBe('TESTER MODE - progress not saved');
    expect(badgeText(true)).toBe('TESTER MODE - keeping progress');
    expect(badgeText(false, true)).toBe('TESTER MODE - progress not saved - GOD MODE (you take no damage)');
  });
});

describe('mountTesterBadge', () => {
  it('is hidden while tester mode is off and shown, with an accessible name, once it is on', () => {
    const s = session();
    mountTesterBadge(s, () => undefined);
    expect(badge()?.hidden).toBe(true);
    s.enable();
    expect(badge()?.hidden).toBe(false);
    expect(badge()?.textContent).toBe('TESTER MODE - progress not saved');
    expect(badge()?.getAttribute('aria-label')).toBe('TESTER MODE - progress not saved. Open tester options.');
    expect(badge()?.type).toBe('button');
  });

  it('follows option changes and hides again when tester mode is turned off', () => {
    const s = session();
    s.enable();
    mountTesterBadge(s, () => undefined);
    s.setOption('keepProgress', true);
    expect(badge()?.textContent).toBe('TESTER MODE - keeping progress');
    s.setOption('godMode', true);
    expect(badge()?.textContent).toMatch(/GOD MODE/);
    s.disable();
    expect(badge()?.hidden).toBe(true);
  });

  it('click opens the panel callback', () => {
    const s = session();
    s.enable();
    const onOpen = vi.fn();
    mountTesterBadge(s, onOpen);
    badge()?.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('mounts into the given host and cleanup removes it and stops reacting to the session', () => {
    const s = session();
    const host = document.createElement('div');
    document.body.append(host);
    const off = mountTesterBadge(s, () => undefined, host);
    expect(host.querySelector('#testerBadge')).not.toBeNull();
    const el = badge();
    off();
    expect(badge()).toBeNull();
    s.enable();
    expect(el?.hidden).toBe(true);
    expect(el?.isConnected).toBe(false);
  });
});
