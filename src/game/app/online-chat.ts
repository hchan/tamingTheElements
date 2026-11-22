// Glue between OnlineClient chat frames, the pure ChatChannel and the DOM dock (docs/ONLINE-PROTOCOL.md 4a).
// The dock shows in 'playing' and 'ended'; a new match (not a resume) clears it; leaving online removes it.
import { ChatChannel, type ChatLine } from '../net/ws/chat-channel';
import type { ChatIn, ChatRefused, OnlineClient } from '../net/ws/online-client';
import { actionForCode, getBindings } from '../platform/input/bindings';
import { createChatView, type ChatView } from './online-chat-view';
import type { QuickState } from './online-quick-model';

export const CHAT_TEXT = {
  unsupported: 'Chat is not available right now',
  reconnecting: 'Reconnecting...',
  away: 'Opponent is away',
  limit: 'Chat limit reached for this match',
  tooLong: 'Message is too long',
  notSent: 'Not sent',
  tooFast: 'Not sent (too fast)',
  undelivered: 'Opponent is away; not delivered',
  wait: (s: number): string => `Wait ${String(s)} s`,
} as const;

export interface OnlineChat {
  /** The client of this connection; frames from an older client are ignored. */
  attach(c: OnlineClient): void;
  /** Dock visible in 'playing' and 'ended' only. */
  show(state: QuickState): void;
  /** A new match (not a resume): log, seen-set, mute and the limit start over. */
  newMatch(): void;
  peerAway(away: boolean): void;
  reconnecting(): void;
  reconnected(): void;
  destroy(): void;
}

const isTextTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

function paintLine(line: ChatLine, e: HTMLElement): void {
  const body = e.querySelector('.chat-text');
  if (body && body.textContent !== line.text) body.textContent = line.text;
  e.querySelector('.chat-fail')?.remove();
  if (line.failure !== undefined) {
    const f = document.createElement('span');
    f.className = 'chat-fail';
    f.textContent = ` (${CHAT_TEXT.notSent})`;
    e.append(f);
  }
}

/** Mirrors the channel's lines into the view: appends in place, rebuilds on a reset, trim or order repair, and keeps the unread count. */
function createLogRenderer(view: ChatView, channel: ChatChannel): { opened(): void } {
  let unread = 0;
  let rendered: number[] = [];
  const els = new Map<number, HTMLElement>();
  channel.onChange(() => {
    const lines = channel.lines();
    const prefix = rendered.length <= lines.length && rendered.every((id, i) => lines[i]?.id === id);
    const known = new Set(rendered);
    if (!prefix) {
      view.clear();
      els.clear();
      rendered = [];
    }
    if (view.isOpen()) unread = 0;
    for (const line of lines) {
      const old = els.get(line.id);
      if (old) {
        paintLine(line, old);
        continue;
      }
      const e = view.addLine(line.own ? 'you' : 'opponent', line.text);
      els.set(line.id, e);
      rendered.push(line.id);
      paintLine(line, e);
      if (!line.own && !view.isOpen() && !known.has(line.id)) unread++;
    }
    if (lines.length === 0) unread = 0;
    if (!prefix) view.setUnread(unread);
  });
  return { opened: () => { unread = 0; } };
}

export function mountOnlineChat(parent: HTMLElement, now: () => number, view: ChatView = createChatView()): OnlineChat {
  let client: OnlineClient | undefined;
  let state: QuickState = 'idle';
  let away = false;
  let reconnect = false;
  const channel = new ChatChannel({ sendChat: (t) => client?.sendChat(t) }, now);
  parent.append(view.root);
  const input = (): HTMLInputElement | null => view.root.querySelector<HTMLInputElement>('#chatInput');

  const updateInput = (): void => {
    const off =
      client === undefined || !client.chatSupported() ? CHAT_TEXT.unsupported
        : reconnect ? CHAT_TEXT.reconnecting
          : channel.limitReached() ? CHAT_TEXT.limit
            : away ? CHAT_TEXT.away
              : undefined;
    view.setInputEnabled(off === undefined, off);
  };
  const log = createLogRenderer(view, channel);
  const open = (): void => {
    view.setOpen(true);
    log.opened();
  };
  view.root.querySelector('#chatToggle')?.addEventListener('click', () => { if (view.isOpen()) log.opened(); });
  view.onSend((text) => {
    const r = channel.send(text);
    switch (r.kind) {
      case 'sent':
        view.setNote('');
        if (state === 'playing') (document.activeElement as HTMLElement | null)?.blur();
        return true;
      case 'wait': view.setNote(CHAT_TEXT.wait(r.seconds)); return false;
      case 'tooLong': view.setNote(CHAT_TEXT.tooLong); return false;
      case 'limit': updateInput(); return false;
      case 'unavailable': view.setNote(CHAT_TEXT.notSent); return false;
      default: return false;
    }
  });
  view.onMute((m) => { channel.setMuted(m); });
  view.onFilter((on) => { channel.setFilter(on); });

  const onDockKey = (e: KeyboardEvent): void => {
    const el = input();
    if (e.key === 'Enter' && state === 'playing' && el !== null && e.target === el && el.value.trim() === '' && !e.isComposing) el.blur();
  };
  const onDocKey = (e: KeyboardEvent): void => {
    if (view.root.hidden || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTextTarget(e.target)) return;
    if (e.key !== 'Enter' && e.code !== 'KeyT') return;
    if (actionForCode(getBindings(), e.code) !== undefined) return;
    e.preventDefault();
    open();
    view.focusInput();
  };
  view.root.addEventListener('keydown', onDockKey);
  document.addEventListener('keydown', onDocKey);

  return {
    attach(c) {
      client = c;
      c.onChat = (m: ChatIn) => { if (client === c) channel.receive(m); };
      c.onChatError = (e: ChatRefused) => {
        if (client !== c) return;
        const r = channel.refuse(e);
        if (r === undefined) return;
        updateInput();
        if (r.reason === 'limit') return;
        view.setNote(r.reason === 'tooFast' ? CHAT_TEXT.tooFast : r.reason === 'away' ? CHAT_TEXT.undelivered : CHAT_TEXT.notSent);
        const el = input();
        if (r.reason === 'tooFast' && el !== null && el.value === '') view.setInputText(r.text);
      };
      updateInput();
    },
    show(s) {
      state = s;
      if (s === 'playing' || s === 'ended') {
        updateInput();
        view.show();
      } else view.hide();
    },
    newMatch() {
      away = false;
      channel.reset();
      view.setMuted(false);
      updateInput();
    },
    peerAway(a) {
      away = a;
      updateInput();
    },
    reconnecting() {
      reconnect = true;
      updateInput();
    },
    reconnected() {
      reconnect = false;
      updateInput();
    },
    destroy() {
      document.removeEventListener('keydown', onDocKey);
      if (client) {
        client.onChat = () => undefined;
        client.onChatError = () => undefined;
      }
      client = undefined;
      view.destroy();
    },
  };
}
