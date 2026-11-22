import { DEFAULT_RESTING_SEC, type OnlineFailure } from './online-types';

/** Words for a person; never mentions a server address. Resting names the wait (default 1 h). */
export function friendlyMessage(f: OnlineFailure): string {
  switch (f.kind) {
    case 'not-configured': return 'Online play is not available in this build.';
    case 'network': return 'Could not reach the online service. Check your connection and try again.';
    case 'update-needed': return 'Update needed, reload the page.';
    case 'bad-response': return 'The online service sent something unexpected. Try again in a minute.';
    case 'resting': {
      const sec = restingSec(f);
      return `The game is resting. Please look again in about ${sec >= 3600 ? `${String(Math.round(sec / 3600))} h` : `${String(Math.max(1, Math.round(sec / 60)))} min`}.`;
    }
    case 'server':
      return SERVER_WORDS[f.code] ?? 'The online service had a problem. Try again in a moment.';
  }
}

const SERVER_WORDS: Readonly<Record<number, string>> = {
  4: 'The sign-in expired. Try again.',
  5: 'You are already waiting or in a room.',
  6: 'That room code was not found. Check it, or ask your friend for a new one.',
  7: 'That room already has two players.',
  8: 'The online service is full right now. Try again in a minute.',
  9: 'Too many tries. Wait a moment.',
  10: 'You and your friend run different versions. Reload the page.',
};

/** Seconds until the service may be asked again (the default hour when the server did not say). */
export function restingSec(f: { readonly retryAfterSec: number }): number {
  return f.retryAfterSec > 0 ? f.retryAfterSec : DEFAULT_RESTING_SEC;
}
