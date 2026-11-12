import { afterEach, describe, expect, it } from 'vitest';
import { notify, resetNotices } from '../platform/storage/notices';
import { mountNoticeBanner } from './notice-banner';

class FakeEl {
  id = '';
  hidden = false;
  type = '';
  textContent: string | null = '';
  children: unknown[] = [];
  removed = false;
  readonly attrs = new Map<string, string>();
  readonly handlers = new Map<string, () => void>();
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  addEventListener(ev: string, fn: () => void): void {
    this.handlers.set(ev, fn);
  }
  append(...c: unknown[]): void {
    this.children.push(...c);
  }
  remove(): void {
    this.removed = true;
  }
}

function setup(): { doc: Document; created: FakeEl[]; prepended: FakeEl[] } {
  const created: FakeEl[] = [];
  const prepended: FakeEl[] = [];
  const doc = {
    createElement: () => {
      const e = new FakeEl();
      created.push(e);
      return e;
    },
    body: { prepend: (e: FakeEl) => void prepended.push(e) },
  } as unknown as Document;
  return { doc, created, prepended };
}

afterEach(resetNotices);

describe('mountNoticeBanner', () => {
  it('mounts a hidden status banner at the top of the page', () => {
    const { doc, prepended } = setup();
    mountNoticeBanner(doc);
    const banner = prepended[0];
    expect(banner?.id).toBe('storeNotice');
    expect(banner?.attrs.get('role')).toBe('status');
    expect(banner?.hidden).toBe(true);
  });

  it('shows a notice and lets the player dismiss it', () => {
    const { doc, created, prepended } = setup();
    mountNoticeBanner(doc);
    const [banner, text, dismiss] = [prepended[0], created[1], created[2]];
    notify('Your save was recovered.');
    expect(text?.textContent).toBe('Your save was recovered.');
    expect(banner?.hidden).toBe(false);
    dismiss?.handlers.get('click')?.();
    expect(banner?.hidden).toBe(true);
    expect(text?.textContent).toBe('');
    notify('Second notice.');
    expect(banner?.hidden).toBe(false);
  });

  it('shows a notice that was raised before the banner mounted', () => {
    notify('early notice');
    const { doc, created, prepended } = setup();
    mountNoticeBanner(doc);
    expect(created[1]?.textContent).toBe('early notice');
    expect(prepended[0]?.hidden).toBe(false);
  });

  it('unmount removes the banner and stops listening', () => {
    const { doc, created, prepended } = setup();
    const unmount = mountNoticeBanner(doc);
    unmount();
    expect(prepended[0]?.removed).toBe(true);
    notify('after unmount');
    expect(created[1]?.textContent).toBe('');
  });
});
