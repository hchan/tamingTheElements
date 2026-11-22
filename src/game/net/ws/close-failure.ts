/** Hint from a close code when no ERROR frame arrived (advisory in wire v3): 4003 update, 4011 resting; anything else is a network drop. (Structurally an `OnlineFailure`.) */
export function closeFailure(
  code: number | undefined,
): { readonly kind: 'update-needed' } | { readonly kind: 'resting'; readonly retryAfterSec: number } | { readonly kind: 'network' } {
  if (code === 4003) return { kind: 'update-needed' };
  if (code === 4011) return { kind: 'resting', retryAfterSec: 0 };
  return { kind: 'network' };
}
