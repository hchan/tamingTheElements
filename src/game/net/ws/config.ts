/**
 * The one place that knows the online service address (docs/ONLINE-CLIENT.md): the build-time value `VITE_ONLINE_URL`,
 * for example `https://relay.example.invalid`, the HTTP base only. The WebSocket address comes from the /ticket response (wire v3).
 * Unset or not an https URL means "not configured" and the online entries are not offered.
 */
export type OnlineConfig =
  | { readonly configured: false }
  | { readonly configured: true; readonly httpUrl: string };

export const NOT_CONFIGURED: OnlineConfig = { configured: false };

/** Pure parser (tests pass a value); never throws. */
export function parseOnlineUrl(value: unknown): OnlineConfig {
  if (typeof value !== 'string') return NOT_CONFIGURED;
  const m = /^https:\/\/([^/?#\s]+)\/?$/.exec(value.trim());
  const host = m?.[1];
  return host === undefined ? NOT_CONFIGURED : { configured: true, httpUrl: `https://${host}` };
}

/** The build's configuration (the single `import.meta.env` read). */
export function onlineConfig(built: unknown = import.meta.env['VITE_ONLINE_URL']): OnlineConfig {
  return parseOnlineUrl(built);
}
