/** Build stamp shown in the menu footer: package.json version plus short git sha (injected by vite.config.ts). */
export function versionStamp(env: Readonly<Record<string, unknown>>): string {
  const version = typeof env.VITE_APP_VERSION === 'string' ? env.VITE_APP_VERSION : 'dev';
  const commit = typeof env.VITE_APP_COMMIT === 'string' ? env.VITE_APP_COMMIT : 'unknown';
  return `v${version} (${commit})`;
}
