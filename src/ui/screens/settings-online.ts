import { clearGuestToken } from '../../game/platform/guest-token-store';

/** Settings button: forgets the stored online guest token (a random string, no personal data) on this device. */
export function onlineGuestControls(storage: Pick<Storage, 'removeItem'> | undefined = safeStorage()): HTMLElement {
  const box = document.createElement('div');
  box.className = 'settingsGroup';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menuButton';
  btn.id = 'forgetOnlineGuest';
  btn.textContent = 'Forget online guest';
  const note = document.createElement('span');
  note.setAttribute('role', 'status');
  btn.addEventListener('click', () => {
    clearGuestToken(storage);
    note.textContent = ' Online guest forgotten.';
  });
  box.append(btn, note);
  return box;
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
