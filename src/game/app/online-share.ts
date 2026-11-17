import { el } from '@ui/dom';
import { qrMatrix, qrSvg } from '../net/qr';

/** Share helpers for the `#online` screen: join link, Copy / Paste / Share, and a QR of the link (docs/WEBRTC-PLAN.md WP03). */

/** `<origin><path>?join=<code>#online`: opening it on the friend's device starts Join at once. */
export function joinLink(code: string, loc: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${loc.origin}${loc.pathname}?join=${encodeURIComponent(code)}#online`;
}

/** The friend's code from `?join=` in a query string, if it looks like one. */
export function joinParam(search: string): string | undefined {
  const v = new URLSearchParams(search).get('join');
  return v !== null && /^T1\.\S+$/.test(v.trim()) ? v.trim() : undefined;
}

/** Copies text; falls back to selecting the box (the player presses Ctrl+C) when the clipboard API is missing or refused. */
export async function copyText(text: string, box?: HTMLTextAreaElement | HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    box?.focus();
    box?.select();
    return false;
  }
}

/** Reads the clipboard into `box`; false when unavailable or refused. */
export async function pasteInto(box: HTMLTextAreaElement): Promise<boolean> {
  try {
    const t = await navigator.clipboard.readText();
    if (t === '') return false;
    box.value = t.trim();
    return true;
  } catch {
    box.focus();
    return false;
  }
}

/** How long a button keeps saying Copied / Pasted before its own label returns. */
export const FLASH_MS = 2000;

/** Shows `word` on a button for a moment (the label comes back after FLASH_MS); the button's aria-live text is the status line, so this is the visual cue. */
export function flashLabel(b: HTMLButtonElement, word: string): void {
  const prev = b.dataset['label'] ?? b.textContent;
  b.dataset['label'] = prev;
  b.textContent = word;
  b.classList.add('onlineDone');
  const timer = window.setTimeout(() => {
    b.textContent = prev;
    b.classList.remove('onlineDone');
    delete b.dataset['label'];
  }, FLASH_MS);
  b.addEventListener('click', () => { window.clearTimeout(timer); }, { once: true });
}

/** A big full-width Copy button: copies `getText()`, flashes Copied, or selects the box (clipboard missing or refused) and tells the player to press Ctrl+C / long-press. */
export function copyButton(id: string, label: string, getText: () => string, box: HTMLTextAreaElement | undefined, say: (s: string) => void, okMsg: string, failMsg: string): HTMLButtonElement {
  const b = el('button', 'menuButton onlineBig', label);
  b.type = 'button';
  b.id = id;
  b.addEventListener('click', () => {
    void copyText(getText(), box).then((ok) => {
      if (ok) flashLabel(b, 'Copied');
      say(ok ? okMsg : failMsg);
    });
  });
  return b;
}

/** A big Paste button for a code box: fills it from the clipboard, flashes Pasted, or focuses the box and explains. */
export function pasteButton(id: string, label: string, box: HTMLTextAreaElement, say: (s: string) => void, okMsg: string): HTMLButtonElement {
  const b = el('button', 'menuButton onlineBig', label);
  b.type = 'button';
  b.id = id;
  b.addEventListener('click', () => {
    void pasteInto(box).then((ok) => {
      if (ok) flashLabel(b, 'Pasted');
      say(ok ? okMsg : 'Could not read the clipboard. Press and hold in the box above, choose Paste.');
    });
  });
  return b;
}

/** A small inline SVG of the join link as a QR code, or undefined when the link is too long for the encoder. */
export function qrNode(link: string): HTMLElement | undefined {
  const m = qrMatrix(link);
  if (m === undefined) return undefined;
  const svg = qrSvg(m, 4);
  const box = el('div');
  box.id = 'onlineQr';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', 'QR code of the join link. Point your friend\'s phone camera at it.');
  box.innerHTML = svg;
  return box;
}

/** Share / Copy-link / QR block for the host's code. `say` reports the outcome in words. */
export function shareBlock(code: string, codeBox: HTMLTextAreaElement, say: (s: string) => void): HTMLElement {
  const link = joinLink(code);
  const box = el('div');
  box.id = 'onlineShare';
  const mk = (id: string, label: string, fn: () => void): HTMLButtonElement => {
    const b = el('button', 'menuButton onlineBig', label);
    b.type = 'button';
    b.id = id;
    b.addEventListener('click', fn);
    return b;
  };
  box.append(
    copyButton('onlineCopyCode', 'Copy code', () => code, codeBox, say, 'Code copied. Send it to your friend.', 'Could not copy automatically: the code is selected, press Ctrl+C (or press and hold, then Copy).'),
    copyButton('onlineCopyLink', 'Copy link', () => link, undefined, say, 'Link copied. Your friend opens it to join at once.', 'Could not copy the link. Send the code instead.'),
  );
  if (typeof navigator.share === 'function') {
    box.append(
      mk('onlineShareLink', 'Share', () => {
        navigator.share({ title: 'Taming the Elements', text: 'Join my match', url: link }).catch(() => {
          say('Sharing was cancelled.');
        });
      }),
    );
  }
  const qr = qrNode(link);
  if (qr) box.append(qr);
  return box;
}
