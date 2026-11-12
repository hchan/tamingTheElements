import { afterEach, describe, expect, it, vi } from 'vitest';
import { notify, onNotice, resetNotices } from './notices';

afterEach(resetNotices);

describe('storage notices channel', () => {
  it('delivers a notice to every current listener', () => {
    const a = vi.fn();
    const b = vi.fn();
    onNotice(a);
    onNotice(b);
    notify('Save recovered.');
    expect(a).toHaveBeenCalledWith('Save recovered.');
    expect(b).toHaveBeenCalledWith('Save recovered.');
  });

  it('keeps notices raised before anyone listens and replays them once to the first listener', () => {
    notify('early');
    const first = vi.fn();
    onNotice(first);
    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith('early');
    const second = vi.fn();
    onNotice(second);
    expect(second).not.toHaveBeenCalled();
  });

  it('does not queue the same early message twice', () => {
    notify('dup');
    notify('dup');
    notify('other');
    const seen: string[] = [];
    onNotice((m) => seen.push(m));
    expect(seen).toEqual(['dup', 'other']);
  });

  it('stops delivering after unsubscribe and queues again with no listener', () => {
    const l = vi.fn();
    const off = onNotice(l);
    off();
    notify('later');
    expect(l).not.toHaveBeenCalled();
    const l2 = vi.fn();
    onNotice(l2);
    expect(l2).toHaveBeenCalledWith('later');
  });
});
