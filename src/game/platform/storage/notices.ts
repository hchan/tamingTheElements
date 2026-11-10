/** Tiny channel for user-visible storage notices (recovered save, another tab saved, upgrade blocked). */
export type NoticeListener = (message: string) => void;

const listeners = new Set<NoticeListener>();
/** Notices raised before anyone listens are kept so a banner mounted later still shows them. */
const pending: string[] = [];

export function notify(message: string): void {
  if (listeners.size === 0) {
    if (!pending.includes(message)) pending.push(message);
    return;
  }
  for (const l of listeners) l(message);
}

export function onNotice(listener: NoticeListener): () => void {
  listeners.add(listener);
  for (const m of pending.splice(0)) listener(m);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetNotices(): void {
  listeners.clear();
  pending.length = 0;
}
