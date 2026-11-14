import { describe, expect, it } from 'vitest';
import { createLiveRegion } from './announcer';

class FakeNode {
  id = '';
  className = '';
  textContent: string | null = '';
  readonly attrs = new Map<string, string>();
  removed = false;
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  remove(): void {
    this.removed = true;
  }
}

function fakeDoc(): { doc: Document; nodes: FakeNode[] } {
  const nodes: FakeNode[] = [];
  const doc = {
    createElement: () => new FakeNode(),
    body: { append: (n: FakeNode) => void nodes.push(n) },
  } as unknown as Document;
  return { doc, nodes };
}

describe('createLiveRegion', () => {
  it('mounts one polite status region and one assertive alert region, both atomic and visually hidden', () => {
    const { doc, nodes } = fakeDoc();
    createLiveRegion(doc, (fn) => { fn(); });
    expect(nodes).toHaveLength(2);
    const [polite, assertive] = nodes;
    expect(polite?.attrs.get('role')).toBe('status');
    expect(polite?.attrs.get('aria-live')).toBe('polite');
    expect(assertive?.attrs.get('role')).toBe('alert');
    expect(assertive?.attrs.get('aria-live')).toBe('assertive');
    for (const n of nodes) {
      expect(n.attrs.get('aria-atomic')).toBe('true');
      expect(n.className).toBe('srOnly');
    }
    expect(polite?.id).not.toBe(assertive?.id);
  });

  it('routes text to the right region', () => {
    const { doc, nodes } = fakeDoc();
    const region = createLiveRegion(doc, (fn) => { fn(); });
    region.speak('hello', false);
    region.speak('Victory', true);
    expect(nodes[0]?.textContent).toBe('hello');
    expect(nodes[1]?.textContent).toBe('Victory');
  });

  it('clears the region first and sets the text on the deferred step so an identical line is re-read', () => {
    const { doc, nodes } = fakeDoc();
    const queued: (() => void)[] = [];
    const region = createLiveRegion(doc, (fn) => void queued.push(fn));
    region.speak('same', false);
    queued.shift()?.();
    expect(nodes[0]?.textContent).toBe('same');
    region.speak('same', false);
    expect(nodes[0]?.textContent).toBe('');
    queued.shift()?.();
    expect(nodes[0]?.textContent).toBe('same');
  });

  it('removes both regions on destroy and ignores a deferred write that lands afterwards', () => {
    const { doc, nodes } = fakeDoc();
    const queued: (() => void)[] = [];
    const region = createLiveRegion(doc, (fn) => void queued.push(fn));
    region.speak('late', false);
    region.destroy();
    queued.shift()?.();
    expect(nodes.every((n) => n.removed)).toBe(true);
    expect(nodes[0]?.textContent).toBe('');
  });

  it('clears the assertive line after it has been read, but not a newer one', () => {
    const { doc, nodes } = fakeDoc();
    const later: (() => void)[] = [];
    const r = createLiveRegion(doc, (fn) => { fn(); }, (fn) => void later.push(fn));
    r.speak('Fight!', true);
    expect(nodes[1]?.textContent).toBe('Fight!');
    r.speak('Match over.', true);
    later[0]?.();
    expect(nodes[1]?.textContent).toBe('Match over.');
    later[1]?.();
    expect(nodes[1]?.textContent).toBe('');
    r.speak('polite', false);
    expect(later).toHaveLength(2);
    expect(nodes[0]?.textContent).toBe('polite');
  });
});
