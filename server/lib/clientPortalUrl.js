/**
 * Client-facing portal base URL (white-label).
 * Stored in app_settings; PORTAL_URL env is a dev/server fallback for Square redirects & CORS.
 */
const db = require('../db');

function normalizeFromUrl(u) {
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.origin}${path}`;
}

/**
 * @returns {{ ok: true, normalized: string, empty: boolean } | { ok: false, error: string }}
 */
function validateClientPortalBaseUrl(raw) {
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
  return { ok: true, normalized: normalizeFromUrl(u), empty: false };
}

/**
 * Resolved base URL for server-side redirects (Square checkout, etc.).
 * Order: database app_settings → process.env.PORTAL_URL
 */
function getResolvedClientPortalBaseUrl() {
  try {
    const row = db.prepare('SELECT client_portal_base_url FROM app_settings WHERE id = 1').get();
    if (row?.client_portal_base_url?.trim()) {
      const v = validateClientPortalBaseUrl(row.client_portal_base_url);
      if (v.ok && !v.empty) return v.normalized;
    }
  } catch {
    /* table missing during migration */
  }
  const env = process.env.PORTAL_URL?.trim();
  if (env) {
    const v = validateClientPortalBaseUrl(env);
    if (v.ok && !v.empty) return v.normalized;
  }
  return null;
}

module.exports = {
  validateClientPortalBaseUrl,
  getResolvedClientPortalBaseUrl,
};
