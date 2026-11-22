// DOM chat dock for online matches. No network knowledge: the glue feeds lines and state in and
// takes sends, mute and filter changes out. Text goes in with textContent only.
import '@ui/styles/online-chat.css';

export const CHAT_MAX_BYTES = 120;
export const CHAT_LOG_CAP = 100;

export type ChatSide = 'you' | 'opponent';

export interface ChatView {
  readonly root: HTMLElement;
  show(): void;
  hide(): void;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  focusInput(): void;
  /** Adds a line; opponent lines count as unread while collapsed. Returns the line element. */
  addLine(side: ChatSide, text: string): HTMLElement;
  clear(): void;
  setUnread(n: number): void;
  setNote(text: string): void;
  /** Disabled input shows `note` (for example while reconnecting); enabling clears the note. */
  setInputEnabled(enabled: boolean, note?: string): void;
  setMuted(muted: boolean): void;
  setFilter(on: boolean): void;
  setInputText(text: string): void;
  /** Return false to keep the typed text (it was not sent). */
  onSend(cb: (text: string) => boolean | undefined): void;
  onMute(cb: (muted: boolean) => void): void;
  onFilter(cb: (on: boolean) => void): void;
  destroy(): void;
}

const IME_KEYCODE = 229;
const encoder = new TextEncoder();
const bytesOf = (s: string): number => encoder.encode(s).length;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, id?: string, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function buildDock() {
  const dock = el('div', 'chatDock', 'chat-dock');
  dock.setAttribute('data-keep-focus', '');
  dock.hidden = true;

  const toggle = el('button', 'chatToggle', 'chat-toggle', 'Chat');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'chatPanel');
  toggle.setAttribute('aria-label', 'Chat');
  const unreadBadge = el('span', 'chatUnread', 'chat-unread');
  unreadBadge.setAttribute('aria-hidden', 'true');
  toggle.append(unreadBadge);

  const panel = el('div', 'chatPanel', 'chat-panel');
  panel.hidden = true;
  const head = el('div', undefined, 'chat-head');
  const filterLabel = el('label', undefined, 'chat-filter');
  const filter = el('input', 'chatFilter');
  filter.type = 'checkbox';
  filter.checked = true;
  filterLabel.append(filter, el('span', undefined, undefined, 'Hide rude words'));
  const mute = el('button', 'chatMute', 'chat-mute', 'Mute opponent');
  mute.type = 'button';
  mute.setAttribute('aria-pressed', 'false');
  head.append(filterLabel, mute);

  const log = el('div', 'chatLog', 'chat-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions');

  const row = el('div', undefined, 'chat-row');
  const label = el('label', undefined, 'chat-sr', 'Message');
  const input = el('input', 'chatInput', 'chat-input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.setAttribute('enterkeyhint', 'send');
  label.htmlFor = 'chatInput';
  const send = el('button', 'chatSend', 'chat-send', 'Send');
  send.type = 'button';
  send.disabled = true;
  row.append(label, input, send);
  const count = el('span', 'chatCount', 'chat-count', `0/${String(CHAT_MAX_BYTES)}`);
  const note = el('div', 'chatNote', 'chat-note');
  note.setAttribute('aria-live', 'polite');
  panel.append(head, log, row, count, note);
  dock.append(toggle, panel);
  return { dock, toggle, unreadBadge, panel, filter, mute, log, input, send, count, note };
}

export function createChatView(): ChatView {
  const { dock, toggle, unreadBadge, panel, filter, mute, log, input, send, count, note } = buildDock();
  let unread = 0;
  let open = false;
  let enabled = true;
  let sendCb: (text: string) => boolean | undefined = () => undefined;
  let muteCb: (muted: boolean) => void = () => undefined;
  let filterCb: (on: boolean) => void = () => undefined;

  const renderUnread = (): void => {
    unreadBadge.textContent = unread <= 0 ? '' : unread > 9 ? '9+' : String(unread);
    toggle.setAttribute('aria-label', unread > 0 ? `Chat, ${String(unread)} unread` : 'Chat');
  };
  const renderCount = (): void => {
    const n = bytesOf(input.value);
    count.textContent = `${String(n)}/${String(CHAT_MAX_BYTES)}`;
    count.classList.toggle('over', n > CHAT_MAX_BYTES);
    send.disabled = !enabled || n > CHAT_MAX_BYTES || input.value.trim() === '';
  };
  const setOpen = (next: boolean): void => {
    open = next;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      unread = 0;
      renderUnread();
      log.scrollTop = log.scrollHeight;
    } else if (dock.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  };
  const doSend = (): void => {
    if (send.disabled) return;
    if (sendCb(input.value) === false) return;
    input.value = '';
    renderCount();
  };

  toggle.addEventListener('click', () => { setOpen(!open); });
  send.addEventListener('click', doSend);
  input.addEventListener('input', renderCount);
  mute.addEventListener('click', () => {
    const next = mute.getAttribute('aria-pressed') !== 'true';
    mute.setAttribute('aria-pressed', String(next));
    muteCb(next);
  });
  filter.addEventListener('change', () => { filterCb(filter.checked); });
  // jsdom-style click() on a checkbox fires change; keep a click fallback out of the way.
  input.addEventListener('keydown', (e) => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- IME composition reports keyCode 229
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === IME_KEYCODE) return;
    e.preventDefault();
    doSend();
  });
  // Typing must never reach the keyboard agent, fullscreen, pause or menu keys (they listen on window).
  const stop = (e: Event): void => {
    e.stopPropagation();
  };
  dock.addEventListener('keydown', (e) => {
    stop(e);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  });
  dock.addEventListener('keypress', stop);
  for (const b of [toggle, send, mute, filter]) b.addEventListener('mousedown', (e) => { e.preventDefault(); });

  return {
    root: dock,
    show: () => { dock.hidden = false; },
    hide: () => { dock.hidden = true; },
    isOpen: () => open,
    setOpen,
    focusInput: () => { input.focus(); },
    addLine(side, text) {
      const line = el('div', undefined, `chat-line chat-${side}`);
      line.append(el('span', undefined, 'chat-who', side === 'you' ? 'You:' : 'Opponent:'), ' ');
      const body = el('span', undefined, 'chat-text', text);
      body.dir = 'auto';
      line.append(body);
      log.append(line);
      while (log.children.length > CHAT_LOG_CAP) log.firstElementChild?.remove();
      if (open) log.scrollTop = log.scrollHeight;
      else if (side === 'opponent') {
        unread += 1;
        renderUnread();
      }
      return line;
    },
    clear() {
      log.replaceChildren();
      unread = 0;
      renderUnread();
      note.textContent = '';
    },
    setUnread(n) {
      unread = Math.max(0, Math.floor(n));
      renderUnread();
    },
    setNote: (text) => { note.textContent = text; },
    setInputEnabled(on, text = '') {
      enabled = on;
      input.disabled = !on;
      note.textContent = on ? '' : text;
      renderCount();
    },
    setMuted: (m) => { mute.setAttribute('aria-pressed', String(m)); },
    setFilter: (on) => { filter.checked = on; },
    setInputText(text) {
      input.value = text;
      renderCount();
    },
    onSend: (cb) => { sendCb = cb; },
    onMute: (cb) => { muteCb = cb; },
    onFilter: (cb) => { filterCb = cb; },
    destroy: () => { dock.remove(); },
  };
}
