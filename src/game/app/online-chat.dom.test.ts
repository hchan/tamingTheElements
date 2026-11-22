// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OnlineClient } from '../net/ws/online-client';
import { mountOnlineChat, type OnlineChat } from './online-chat';

const FORBIDDEN = /\b(classic|arcade|ruleset|capture|room|friend)\b/i;

class FakeClient {
  supported = true;
  sent: string[] = [];
  seq = 0;
  onChat: (m: { seq: number; text: string }) => void = () => undefined;
  onChatError: (e: { seq: number; code: number; retryAfterSec: number }) => void = () => undefined;
  chatSupported(): boolean { return this.supported; }
  sendChat(t: string): number | undefined {
    this.sent.push(t);
    return this.seq++;
  }
}

let clock = 0;
let parent: HTMLElement;
let chat: OnlineChat;
let c: FakeClient;
const q = (id: string): HTMLElement => parent.querySelector<HTMLElement>(`#${id}`) as HTMLElement;
const qi = (id: string): HTMLInputElement => q(id) as HTMLInputElement;
const type = (text: string): void => {
  qi('chatInput').value = text;
  q('chatInput').dispatchEvent(new Event('input'));
};
const send = (text: string): void => {
  type(text);
  q('chatSend').click();
};
const lines = (): string[] => [...parent.querySelectorAll('#chatLog .chat-line')].map((l) => l.textContent);
const attach = (client: FakeClient = c): void => { chat.attach(client as unknown as OnlineClient); };

beforeEach(() => {
  clock = 0;
  parent = document.createElement('div');
  document.body.append(parent);
  c = new FakeClient();
  chat = mountOnlineChat(parent, () => clock);
  attach();
  chat.show('playing');
});
afterEach(() => {
  chat.destroy();
  document.body.replaceChildren();
});

describe('online chat glue', () => {
  it('shows only in playing and ended', () => {
    expect(q('chatDock').hidden).toBe(false);
    chat.show('ended');
    expect(q('chatDock').hidden).toBe(false);
    for (const s of ['idle', 'queued', 'matched', 'connecting'] as const) {
      chat.show(s);
      expect(q('chatDock').hidden).toBe(true);
    }
  });

  it('sends a line and echoes it', () => {
    send('hello');
    expect(c.sent).toEqual(['hello']);
    expect(lines()).toEqual(['You: hello']);
    expect(qi('chatInput').value).toBe('');
  });

  it('counts opponent lines as unread while collapsed and clears on open', () => {
    c.onChat({ seq: 0, text: 'hi' });
    c.onChat({ seq: 1, text: 'there' });
    expect(q('chatUnread').textContent).toBe('2');
    expect(q('chatToggle').getAttribute('aria-label')).toBe('Chat, 2 unread');
    q('chatToggle').click();
    expect(q('chatUnread').textContent).toBe('');
    expect(lines()).toEqual(['Opponent: hi', 'Opponent: there']);
    c.onChat({ seq: 2, text: 'open' });
    expect(q('chatUnread').textContent).toBe('');
  });

  it('ignores repeated seq numbers', () => {
    c.onChat({ seq: 0, text: 'hi' });
    c.onChat({ seq: 0, text: 'hi' });
    expect(lines()).toHaveLength(1);
  });

  it('says Wait N s when the client burst is spent and keeps the text', () => {
    send('a');
    send('b');
    send('c');
    expect(c.sent).toEqual(['a', 'b']);
    expect(q('chatNote').textContent).toMatch(/^Wait \d+ s$/);
    expect(qi('chatInput').value).toBe('c');
    clock += 2000;
    q('chatSend').click();
    expect(c.sent).toEqual(['a', 'b', 'c']);
  });

  it('marks a refused line and restores the text when too fast', () => {
    send('hey');
    c.onChatError({ seq: 0, code: 9, retryAfterSec: 1 });
    expect(lines()[0]).toContain('Not sent');
    expect(q('chatNote').textContent).toBe('Not sent (too fast)');
    expect(qi('chatInput').value).toBe('hey');
  });

  it('notes an undelivered line and disables input at the limit', () => {
    send('x');
    c.onChatError({ seq: 0, code: 0x0e, retryAfterSec: 0 });
    expect(q('chatNote').textContent).toBe('Opponent is away; not delivered');
    clock += 5000;
    send('y');
    c.onChatError({ seq: 1, code: 0x0d, retryAfterSec: 0 });
    expect(qi('chatInput').disabled).toBe(true);
    expect(q('chatNote').textContent).toBe('Chat limit reached for this match');
  });

  it('mute drops opponent lines without unread', () => {
    q('chatMute').click();
    c.onChat({ seq: 0, text: 'rude' });
    expect(lines()).toEqual([]);
    expect(q('chatUnread').textContent).toBe('');
    q('chatMute').click();
    c.onChat({ seq: 1, text: 'ok' });
    expect(lines()).toEqual(['Opponent: ok']);
  });

  it('filter masks rude words and unmasks when switched off', () => {
    c.onChat({ seq: 0, text: 'what a shit game' });
    expect(lines()[0]).toContain('****');
    const f = qi('chatFilter');
    f.checked = false;
    f.dispatchEvent(new Event('change'));
    expect(lines()[0]).toContain('shit');
  });

  it('resets on a new match but not on a resume', () => {
    c.onChat({ seq: 0, text: 'one' });
    q('chatMute').click();
    chat.reconnecting();
    expect(qi('chatInput').disabled).toBe(true);
    expect(q('chatNote').textContent).toBe('Reconnecting...');
    chat.reconnected(); // a resume never calls newMatch: the log stays
    expect(qi('chatInput').disabled).toBe(false);
    expect(lines()).toHaveLength(1);
    expect(q('chatMute').getAttribute('aria-pressed')).toBe('true');
    chat.newMatch();
    expect(lines()).toEqual([]);
    expect(q('chatUnread').textContent).toBe('');
    expect(q('chatMute').getAttribute('aria-pressed')).toBe('false');
    c.onChat({ seq: 0, text: 'again' }); // the seen-set started over too
    expect(lines()).toEqual(['Opponent: again']);
  });

  it('hides the whole dock when chat is unsupported and re-reads after a reconnect', () => {
    c.supported = false;
    chat.show('playing');
    expect(q('chatDock').hidden).toBe(true);
    chat.show('ended');
    expect(q('chatDock').hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't' }));
    expect(q('chatPanel').hidden).toBe(true); // the T key stays inert too
    c.supported = true;
    chat.reconnected();
    expect(q('chatDock').hidden).toBe(false);
    expect(qi('chatInput').disabled).toBe(false);
  });

  it('disables the input while the opponent is away', () => {
    chat.peerAway(true);
    expect(qi('chatInput').disabled).toBe(true);
    expect(q('chatNote').textContent).toBe('Opponent is away');
    chat.peerAway(false);
    expect(qi('chatInput').disabled).toBe(false);
  });

  it('ignores frames from a replaced client', () => {
    const old = c;
    const next = new FakeClient();
    attach(next);
    old.onChat({ seq: 0, text: 'stale' });
    old.onChatError({ seq: 0, code: 9, retryAfterSec: 1 });
    expect(lines()).toEqual([]);
    next.onChat({ seq: 0, text: 'fresh' });
    expect(lines()).toEqual(['Opponent: fresh']);
  });

  it('opens with T, keeps typed keys from the window, and Esc collapses', () => {
    const seen: string[] = [];
    const spy = (e: KeyboardEvent): void => { seen.push(e.code); };
    window.addEventListener('keydown', spy);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't', bubbles: true, cancelable: true }));
    expect(q('chatPanel').hidden).toBe(false);
    expect(document.activeElement).toBe(q('chatInput'));
    seen.length = 0;
    q('chatInput').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'a', bubbles: true, cancelable: true }));
    q('chatInput').dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', key: 'a', bubbles: true }));
    expect(seen).toEqual([]);
    q('chatInput').dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    expect(q('chatPanel').hidden).toBe(true);
    window.removeEventListener('keydown', spy);
  });

  it('does not open while hidden or with a modifier', () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't', ctrlKey: true, bubbles: true }));
    expect(q('chatPanel').hidden).toBe(true);
    chat.show('queued');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', key: 't', bubbles: true }));
    expect(q('chatPanel').hidden).toBe(true);
  });

  it('keeps focus in the input across playing to ended and blurs after a send while playing', () => {
    q('chatToggle').click();
    q('chatInput').focus();
    chat.show('ended');
    expect(document.activeElement).toBe(q('chatInput'));
    chat.show('playing');
    send('go');
    expect(document.activeElement).not.toBe(q('chatInput'));
  });

  it('removes the dock on destroy and uses no forbidden words', () => {
    chat.show('ended');
    expect(parent.textContent).not.toMatch(FORBIDDEN);
    c.supported = false;
    chat.reconnected();
    expect(parent.textContent).not.toMatch(FORBIDDEN);
    chat.destroy();
    expect(parent.querySelector('#chatDock')).toBeNull();
  });
});
