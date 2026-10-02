/**
 * URL policy for the renderer window. Pure functions, so they are unit-tested without Electron.
 * Wired up in index.ts: links go to the default browser, navigation stays inside the app.
 */

/** Protocols that may be handed to the operating system via shell.openExternal. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** True for links that are safe to open in the user's browser or mail client. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export interface NavigationPolicy {
  /** Dev server URL from electron-vite (process.env.ELECTRON_RENDERER_URL); unset in production. */
  devServerUrl?: string;
}

/**
 * True when the renderer may navigate to `url`: the dev server origin while developing, or the
 * app's own file:// bundle. Hash-only route changes never reach this check.
 */
export function isAllowedNavigation(url: string, policy: NavigationPolicy): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (policy.devServerUrl) {
    try {
      return target.origin === new URL(policy.devServerUrl).origin;
    } catch {
      return false;
    }
  }
  return target.protocol === 'file:';
}
