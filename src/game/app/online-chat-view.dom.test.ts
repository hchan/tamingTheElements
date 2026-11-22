// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_LOG_CAP, CHAT_MAX_BYTES, createChatView, type ChatView } from './online-chat-view';

const FORBIDDEN = /\b(classic|arcade|ruleset|capture|room|friend)\b/i;
const q = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T; // eslint-disable-line @typescript-eslint/no-unnecessary-type-parameters
let view: ChatView | undefined;
const make = (): ChatView => {
  view = createChatView();
  document.body.append(view.root);
  view.show();
  return view;
};
afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.replaceChildren();
});

describe('online chat view', () => {
  it('starts collapsed with the right aria and ids', () => {
    make();
    const toggle = q<HTMLButtonElement>('chatToggle');
    expect(q('chatDock').hasAttribute('data-keep-focus')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('chatPanel');
    expect(q('chatPanel').hidden).toBe(true);
    expect(q('chatUnread').getAttribute('aria-hidden')).toBe('true');
    const log = q('chatLog');
    expect(log.getAttribute('role')).toBe('log');
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(q('chatMute').getAttribute('aria-pressed')).toBe('false');
    expect(q('chatInput').hasAttribute('maxlength')).toBe(false);
    expect(q('chatFilter').parentElement?.textContent).toContain('Hide rude words');
    expect(q('chatNote').getAttribute('aria-live')).toBe('polite');
  });

  it('is hidden until shown', () => {
    view = createChatView();
    expect(view.root.hidden).toBe(true);
    view.show();
    expect(view.root.hidden).toBe(false);
    view.hide();
    expect(view.root.hidden).toBe(true);
  });

  it('counts unread while collapsed, 1-9 then 9+, and expanding clears it', () => {
    const v = make();
    v.addLine('opponent', 'hi');
    v.addLine('opponent', 'there');
    expect(q('chatUnread').textContent).toBe('2');
    expect(q('chatToggle').getAttribute('aria-label')).toBe('Chat, 2 unread');
    for (let i = 0; i < 7; i++) v.addLine('opponent', 'x');
    expect(q('chatUnread').textContent).toBe('9');
    v.addLine('opponent', 'x');
    expect(q('chatUnread').textContent).toBe('9+');
    q('chatToggle').click();
    expect(q('chatToggle').getAttribute('aria-expanded')).toBe('true');
    expect(q('chatPanel').hidden).toBe(false);
    expect(q('chatUnread').textContent).toBe('');
    expect(q('chatToggle').getAttribute('aria-label')).toBe('Chat');
    v.addLine('opponent', 'open now');
    expect(q('chatUnread').textContent).toBe('');
  });

  it('does not count own lines as unread', () => {
    const v = make();
    v.addLine('you', 'mine');
    expect(q('chatUnread').textContent).toBe('');
  });

  it('keeps hostile text as text', () => {
    const v = make();
    const bad = '<img src=x onerror=alert(1)>';
    v.addLine('opponent', bad);
    const log = q('chatLog');
    expect(log.querySelector('img')).toBeNull();
    expect(log.textContent).toContain(bad);
    expect(log.querySelector('[dir="auto"]')?.textContent).toBe(bad);
    expect(log.textContent).toContain('Opponent:');
  });

  it('labels own lines You:', () => {
    make().addLine('you', 'hello');
    expect(q('chatLog').textContent).toContain('You:');
  });

  it('never shows a banned player word', () => {
    const v = make();
    q('chatToggle').click();
    v.addLine('you', 'hi');
    v.setNote('Wait 2 s');
    v.setInputEnabled(false, 'Reconnecting...');
    const all = [...document.querySelectorAll('*')].flatMap((e) => [e.textContent, e.getAttribute('aria-label') ?? '', e.getAttribute('title') ?? '']);
    for (const t of all) expect(t).not.toMatch(FORBIDDEN);
  });

  it('caps the log at 100 lines', () => {
    const v = make();
    for (let i = 0; i < CHAT_LOG_CAP + 5; i++) v.addLine('you', `m${String(i)}`);
    expect(q('chatLog').children.length).toBe(CHAT_LOG_CAP);
    expect(q('chatLog').textContent).not.toMatch(/\bm0\b/);
    expect(q('chatLog').textContent).toContain(`m${String(CHAT_LOG_CAP + 4)}`);
  });

  it('counts UTF-8 bytes and disables Send over 120', () => {
    make();
    q('chatToggle').click();
    const input = q<HTMLInputElement>('chatInput');
    const send = q<HTMLButtonElement>('chatSend');
    expect(send.disabled).toBe(true);
    input.value = 'a'.repeat(120);
    input.dispatchEvent(new Event('input'));
    expect(q('chatCount').textContent).toBe('120/120');
    expect(send.disabled).toBe(false);
    input.value = 'a'.repeat(119) + 'é';
    input.dispatchEvent(new Event('input'));
    expect(q('chatCount').textContent).toBe('121/120');
    expect(send.disabled).toBe(true);
    expect(q('chatCount').classList.contains('over')).toBe(true);
    expect(CHAT_MAX_BYTES).toBe(120);
  });

  it('sends through the handler, clears on success and keeps text on false', () => {
    const v = make();
    q('chatToggle').click();
    const onSend = vi.fn<(t: string) => boolean | undefined>(() => false);
    v.onSend(onSend);
    const input = q<HTMLInputElement>('chatInput');
    input.value = 'go';
    input.dispatchEvent(new Event('input'));
    q('chatSend').click();
    expect(onSend).toHaveBeenCalledWith('go');
    expect(input.value).toBe('go');
    onSend.mockReturnValue(undefined);
    q('chatSend').click();
    expect(input.value).toBe('');
    expect(q('chatCount').textContent).toBe('0/120');
  });

  it('Enter sends but not while composing; Esc collapses and blurs', () => {
    const v = make();
    q('chatToggle').click();
    const onSend = vi.fn();
    v.onSend(onSend);
    const input = q<HTMLInputElement>('chatInput');
    input.focus();
    input.value = 'yo';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    expect(onSend).not.toHaveBeenCalled();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSend).toHaveBeenCalledTimes(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('chatToggle').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).not.toBe(input);
  });

  it('stops keydown and keypress inside the dock from reaching the window', () => {
    make();
    q('chatToggle').click();
    const seen = vi.fn();
    const keyup = vi.fn();
    window.addEventListener('keydown', seen);
    window.addEventListener('keypress', seen);
    window.addEventListener('keyup', keyup);
    q('chatInput').dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
    q('chatInput').dispatchEvent(new KeyboardEvent('keypress', { code: 'KeyF', bubbles: true }));
    q('chatInput').dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true }));
    window.removeEventListener('keydown', seen);
    window.removeEventListener('keypress', seen);
    window.removeEventListener('keyup', keyup);
    expect(seen).not.toHaveBeenCalled();
    expect(keyup).toHaveBeenCalledTimes(1);
  });

  it('buttons keep focus on mousedown', () => {
    make();
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    q('chatSend').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('mute and filter toggles report and reflect state', () => {
    const v = make();
    q('chatToggle').click();
    const onMute = vi.fn();
    const onFilter = vi.fn();
    v.onMute(onMute);
    v.onFilter(onFilter);
    q('chatMute').click();
    expect(onMute).toHaveBeenCalledWith(true);
    expect(q('chatMute').getAttribute('aria-pressed')).toBe('true');
    q<HTMLInputElement>('chatFilter').click();
    expect(onFilter).toHaveBeenCalledWith(false);
    v.setMuted(false);
    expect(q('chatMute').getAttribute('aria-pressed')).toBe('false');
  });

  it('disables the input with a note', () => {
    const v = make();
    v.setInputEnabled(false, 'Reconnecting...');
    expect(q<HTMLInputElement>('chatInput').disabled).toBe(true);
    expect(q<HTMLButtonElement>('chatSend').disabled).toBe(true);
    expect(q('chatNote').textContent).toBe('Reconnecting...');
    v.setInputEnabled(true);
    expect(q<HTMLInputElement>('chatInput').disabled).toBe(false);
    expect(q('chatNote').textContent).toBe('');
  });
});
