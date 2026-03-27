/**
 * White-label client portal links (must match server URL rules in server/lib/clientPortalUrl.js).
 */

export const PORTAL_ROUTE = {
  /** Primary link shared with clients */
  booking: 'booking',
  /** Alias — same experience as booking */
  client: 'client',
  /** Contract-focused path — same booking token */
  contract: 'contract',
  /** Payment return + deep links — same booking token */
  payment: 'payment',
  /** Client invoice (public_token) */
  invoice: 'invoice',
};

const LEGACY_STORAGE_KEY = 'vizo_portal_url';
export const CLIENT_PORTAL_STORAGE_KEY = 'vizo_client_portal_base_url';

/**
 * @returns {{ ok: true, normalized: string, empty: boolean } | { ok: false, error: string }}
 */
export function validateClientPortalBaseUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, normalized: '', empty: true };
  let u;
  try {
    u = new URL(s);
  } catch {
    return {
      ok: false,
      error: 'Enter a valid URL including https:// (e.g. https://portal.yourstudio.com)',
    };
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    return { ok: false, error: 'URL must use http:// or https://' };
  }
  if (!u.hostname) {
    return { ok: false, error: 'Invalid hostname' };
  }
  const path = u.pathname.replace(/\/+$/, '');
  return { ok: true, normalized: `${u.origin}${path}`, empty: false };
}

/** @returns {string|null} error message or null if OK */
export function messageIfMissingPortalBase(baseUrl) {
  const s = String(baseUrl ?? '').trim();
  if (!s) {
    return 'Set your Client Portal URL in Settings before copying or sharing client links.';
  }
  const v = validateClientPortalBaseUrl(s);
  if (!v.ok) return v.error;
  return null;
}

/**
 * @param {string} baseUrl
 * @param {string} routeSegment  PORTAL_ROUTE.* value
 * @param {string} token  booking public_token
 */
export function buildClientPortalLink(baseUrl, routeSegment, token) {
  const err = messageIfMissingPortalBase(baseUrl);
  if (err) return { ok: false, error: err };
  const v = validateClientPortalBaseUrl(baseUrl.trim());
  if (!v.ok || v.empty) return { ok: false, error: v.error || 'Invalid portal URL' };
  const t = encodeURIComponent(token);
  return { ok: true, url: `${v.normalized}/${routeSegment}/${t}` };
}

export function clientBookingPortalUrl(baseUrl, token) {
  return buildClientPortalLink(baseUrl, PORTAL_ROUTE.booking, token);
}

export function clientInvoicePortalUrl(baseUrl, publicToken) {
  return buildClientPortalLink(baseUrl, PORTAL_ROUTE.invoice, publicToken);
}

/** Read cached portal base from localStorage (legacy key migrated once). */
export function readCachedPortalBaseUrl() {
  try {
    const next = localStorage.getItem(CLIENT_PORTAL_STORAGE_KEY);
    if (next?.trim()) return next.trim();
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy?.trim()) {
      localStorage.setItem(CLIENT_PORTAL_STORAGE_KEY, legacy.trim());
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy.trim();
    }
  } catch {
    /* private mode */
  }
  const env = import.meta.env.VITE_PORTAL_URL;
  if (env?.trim()) return env.trim();
  // Fixed dev port (see portal/vite.config.js strictPort) — avoids booking links pointing at a random port
  if (import.meta.env.DEV) return 'http://localhost:5174';
  return '';
}
