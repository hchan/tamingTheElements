/**
 * The one place that knows the online service address (docs/ONLINE-CLIENT.md): the build-time value `VITE_ONLINE_URL`,
 * for example `https://relay.example.invalid`. Unset or not an https URL means "not configured" and the online entries are not offered.
 */
export type OnlineConfig =
  | { readonly configured: false }
  | { readonly configured: true; readonly httpUrl: string; readonly wsUrl: string };

export const NOT_CONFIGURED: OnlineConfig = { configured: false };

/** Pure parser (tests pass a value); never throws. The WebSocket URL is the https one with `wss`. */
export function parseOnlineUrl(value: unknown): OnlineConfig {
  if (typeof value !== 'string') return NOT_CONFIGURED;
  const m = /^https:\/\/([^/?#\s]+)\/?$/.exec(value.trim());
  const host = m?.[1];
  return host === undefined ? NOT_CONFIGURED : { configured: true, httpUrl: `https://${host}`, wsUrl: `wss://${host}` };
}

/** The build's configuration (the single `import.meta.env` read). */
export function onlineConfig(built: unknown = import.meta.env['VITE_ONLINE_URL']): OnlineConfig {
  return parseOnlineUrl(built);
}
