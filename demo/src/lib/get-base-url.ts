/**
 * Returns the correct base URL for email redirects.
 * Uses VITE_APP_URL env var if set, otherwise falls back to window.location.origin.
 * This is needed because some preview/dev environments can expose
 * window.location.origin as a local URL that is not reachable externally.
 */
export function getBaseUrl(): string {
  return import.meta.env.VITE_APP_URL || window.location.origin;
}
