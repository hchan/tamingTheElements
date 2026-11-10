import { onNotice } from '../platform/storage/notices';

/**
 * Shows storage notices (recovered save, save changed in another tab) in a dismissible status banner at the top of
 * the page. Returns a function that stops listening.
 */
export function mountNoticeBanner(doc: Document = document): () => void {
  const banner = doc.createElement('div');
  banner.id = 'storeNotice';
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  const text = doc.createElement('span');
  const dismiss = doc.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', () => {
    banner.hidden = true;
    text.textContent = '';
  });
  banner.append(text, ' ', dismiss);
  doc.body.prepend(banner);
  const off = onNotice((message) => {
    text.textContent = message;
    banner.hidden = false;
  });
  return () => {
    off();
    banner.remove();
  };
}
