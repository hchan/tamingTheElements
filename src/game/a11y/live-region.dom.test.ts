// @vitest-environment happy-dom
import { SimEventKind, type SimEvent } from '@core/index';
import { afterEach, describe, expect, it } from 'vitest';
import { Announcer, LOW_HEALTH, MATCH_START, announcementsFor, createLiveRegion } from './announcer';

// Moved down from tests/e2e/a11y-features.spec.ts (screen reader announcements): the real DOM nodes and the text that lands in them.
afterEach(() => {
  document.body.replaceChildren();
});

const ev = (kind: SimEvent['kind'], extra: Record<string, number> = {}): SimEvent => ({ ...extra, tick: 1, sourceId: 0, kind, seq: 0 });

function mount(): { polite: HTMLElement; assertive: HTMLElement; announcer: Announcer; feed: (events: SimEvent[]) => void } {
  document.body.replaceChildren();
  const region = createLiveRegion(document, (fn) => { fn(); }, () => undefined);
  const polite = document.getElementById('liveRegion') as HTMLElement;
  const assertive = document.getElementById('liveRegionAssertive') as HTMLElement;
  let t = 0;
  const announcer = new Announcer((text, a) => { region.speak(text, a); }, () => (t += 10_000));
  return { polite, assertive, announcer, feed: (events) => { for (const a of announcementsFor(events)) announcer.say(a); } };
}

describe('live regions in the DOM', () => {
  it('mounts a polite status region and an assertive alert region', () => {
    const { polite, assertive } = mount();
    expect(assertive.getAttribute('role')).toBe('alert');
    expect(polite.getAttribute('aria-live')).toBe('polite');
    expect(polite.getAttribute('role')).toBe('status');
    expect(assertive.getAttribute('aria-live')).toBe('assertive');
  });

  it('match start and win are assertive, low health is polite, defeat is assertive', () => {
    const m = mount();
    m.announcer.say(MATCH_START);
    expect(m.assertive.textContent).toContain('Match started');
    m.announcer.say(LOW_HEALTH);
    expect(m.polite.textContent).toContain('Low health');
    m.feed([ev(SimEventKind.matchEnded, { winner: 0 })]);
    expect(m.assertive.textContent).toContain('Victory');
    m.feed([ev(SimEventKind.matchEnded, { winner: 1 })]);
    expect(m.assertive.textContent).toContain('Defeat');
  });

  it('a capture is announced, also when it comes on the same tick as the win', () => {
    const m = mount();
    m.feed([ev(SimEventKind.captured)]);
    expect(m.polite.textContent).toContain('Snagged the opponent');
    const n = mount();
    n.feed([ev(SimEventKind.captured), ev(SimEventKind.matchEnded, { winner: 0 })]);
    expect(n.polite.textContent + n.assertive.textContent).toContain('Snagged the opponent');
  });
});
